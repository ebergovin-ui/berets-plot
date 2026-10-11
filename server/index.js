import cors from 'cors';
import { buildPlotArchive, plotStartPayload } from './plotArchive.js';
import { mergePrinterReport, watchFileStart } from './printerState.js';
import { transferFileJob } from './fileJob.js';
import { createCommandClock } from '../src/motionTiming.js';
import { waitForCommandAck } from './commandAck.js';
import { waitForStream, cancelStream } from './streamControl.js';
import { batchGCodeLines } from './streamBatches.js';
import express from 'express';
import { Client as FTPClient } from 'basic-ftp';
import mqtt from 'mqtt';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import dgram from 'node:dgram';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PLOTTER_SERVER_PORT || 5426);
const HOST = process.env.PLOTTER_SERVER_HOST || '127.0.0.1';
const SHOULD_OPEN_BROWSER = process.env.PLOTTER_OPEN_BROWSER === '1';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATIC_DIR = process.env.PLOTTER_STATIC_DIR
  ? path.resolve(process.env.PLOTTER_STATIC_DIR)
  : path.resolve(__dirname, '../dist');
const PACKAGE_INFO = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
const app = express();

app.use(cors({ origin: [/^http:\/\/127\.0\.0\.1:\d+$/, /^http:\/\/localhost:\d+$/] }));
app.use(['/api/printer/send-gcode', '/api/printer/preflight-gcode'], express.json({ limit: '64mb' }));
app.use(express.json({ limit: '2mb' }));

let client = null;
let config = null;
let connected = false;
let lastReport = null;
let lastError = '';
let sequence = Date.now();
let activeStream = null;
let lastSafeZ = 10;
let mqttLogSequence = 0;
let toolheadFanKeepalive = null;
const mqttLog = [];

const blockedPatterns = [
  /^M109\b/i,
  /^M190\b/i,
  /^M141\b/i,
  /^M106\b/i,
  /^M82\b/i,
  /^M83\b/i,
  /^M302\b/i,
  /^M600\b/i,
  /^M701\b/i,
  /^M702\b/i,
  /^T\d+/i,
  /\bE-?\d/i,
];

const allowedCommands = /^(G0|G1|G4|G21|G28|G90|G91|G92|M2|M17|M18|M84|M104|M107|M140|M220|M221|M400)\b/i;
const MAX_DIRECT_SEND_LINES = 100000;
const MAX_DIRECT_SEND_BYTES = 1500000;
const MAX_FILE_SEND_BYTES = 32 * 1024 * 1024;
const MAX_FILE_SEND_LINES = 1000000;
const DEFAULT_START_DELAY_MS = 2500;
const DEFAULT_LINE_DELAY_MS = 80;

function cleanLine(line) {
  return line.replace(/^N\d+\s+/i, '').split(';')[0].trim();
}

function isUnsafeSafetyCommand(line) {
  return (
    (/^M104\b/i.test(line) && !/^M104\s+S0(\s|$)/i.test(line))
    || (/^M140\b/i.test(line) && !/^M140\s+S0(\s|$)/i.test(line))
    || (/^M221\b/i.test(line) && !/^M221\s+S(0|100)(\s|$)/i.test(line))
  );
}

function homesZ(line) {
  return /^G28(\s*$|\s+(?=.*\bZ\b))/i.test(line);
}

function validateGCode(gcode, { allowNegativeZ = false, allowHome = true, method = 'file' } = {}) {
  if (typeof gcode !== 'string') return { ok: false, errors: ['G-code must be text.'], lineCount: 0, byteCount: 0 };
  const byteCount = Buffer.byteLength(gcode, 'utf8');
  const maxBytes = method === 'stream' ? MAX_DIRECT_SEND_BYTES : MAX_FILE_SEND_BYTES;
  const maxLines = method === 'stream' ? MAX_DIRECT_SEND_LINES : MAX_FILE_SEND_LINES;
  const lines = gcode.split(/\r?\n/);
  const errors = [];
  const executableLines = lines.filter((line) => cleanLine(line));

  if (byteCount > maxBytes) {
    errors.push(`G-code exceeds the ${method} limit of ${maxBytes} bytes.`);
  }

  if (executableLines.length > maxLines) {
    errors.push(`G-code exceeds the ${method} limit of ${maxLines} motion lines.`);
  }

  lines.forEach((line, index) => {
    const cleaned = cleanLine(line);
    if (!cleaned) return;
    if (!allowedCommands.test(cleaned)) {
      errors.push(`Line ${index + 1}: unsupported command "${cleaned}"`);
    }
    if (blockedPatterns.some((pattern) => pattern.test(cleaned))) {
      errors.push(`Line ${index + 1}: blocked non-plotter command "${cleaned}"`);
    }
    if (isUnsafeSafetyCommand(cleaned)) {
      errors.push(`Line ${index + 1}: unsafe safety command "${cleaned}"`);
    }
    if (/^G28\b/i.test(cleaned) && !allowHome && homesZ(cleaned)) {
      errors.push(`Line ${index + 1}: Z homing is disabled for direct send because it resets calibrated Z`);
    }
    const zMatch = cleaned.match(/\bZ(-?\d+(\.\d+)?)/i);
    if (zMatch && Number(zMatch[1]) < 0 && !allowNegativeZ) {
      errors.push(`Line ${index + 1}: negative Z requires explicit confirmation`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    lineCount: executableLines.length,
    byteCount,
  };
}

function requireConnected(response) {
  if (!client || !connected || !config) {
    response.status(409).json({ ok: false, error: 'Printer is not connected.' });
    return false;
  }
  return true;
}

function requestTopic() {
  return `device/${config.serial}/request`;
}

function reportTopic() {
  return `device/${config.serial}/report`;
}

function nextSequence() {
  sequence += 1;
  return String(sequence);
}

function addMqttLog(direction, topic, payload) {
  mqttLogSequence += 1;
  mqttLog.push({
    id: mqttLogSequence,
    time: new Date().toISOString(),
    direction,
    topic,
    payload,
  });
  if (mqttLog.length > 250) mqttLog.splice(0, mqttLog.length - 250);
}

function parseSsdpPrinterMessage(raw, rinfo) {
  if (!/bambu|3dprinter/i.test(raw)) return null;
  const headers = {};
  raw.split(/\r?\n/).forEach((line) => {
    const index = line.indexOf(':');
    if (index > 0) headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  });
  const usn = headers.usn || headers['dev-id.bambu.com'] || headers['dev_id.bambu.com'] || '';
  const serialMatch = usn.match(/[A-Z0-9]{8,}/i);
  return {
    host: rinfo.address,
    serial: headers['dev-id.bambu.com'] || headers['dev_id.bambu.com'] || serialMatch?.[0] || '',
    name: headers['dev-name.bambu.com'] || headers['dev_name.bambu.com'] || headers.server || 'Bambu printer',
    model: headers['dev-model.bambu.com'] || headers['dev_model.bambu.com'] || '',
    raw: Object.fromEntries(Object.entries(headers).filter(([key]) => key.includes('bambu') || ['usn', 'server', 'location'].includes(key))),
  };
}

async function discoverBambuPrinters(timeoutMs = 5000) {
  const found = new Map();
  const sockets = [];
  const addPrinter = (printer) => {
    if (!printer?.host) return;
    const key = printer.serial || printer.host;
    found.set(key, { ...found.get(key), ...printer });
  };

  await Promise.all([1900, 2021].map((port) => new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sockets.push(socket);
    socket.on('message', (message, rinfo) => addPrinter(parseSsdpPrinterMessage(message.toString(), rinfo)));
    socket.on('error', () => resolve());
    socket.bind(port, '0.0.0.0', () => {
      try {
        socket.addMembership('239.255.255.250');
      } catch {
        // Another process may already own membership; direct replies still work.
      }
      resolve();
    });
  })));

  const searchSocket = dgram.createSocket('udp4');
  sockets.push(searchSocket);
  const search = [
    'M-SEARCH * HTTP/1.1',
    'HOST: 239.255.255.250:1900',
    'MAN: "ssdp:discover"',
    'MX: 2',
    'ST: urn:bambulab-com:device:3dprinter:1',
    '',
    '',
  ].join('\r\n');
  searchSocket.on('message', (message, rinfo) => addPrinter(parseSsdpPrinterMessage(message.toString(), rinfo)));
  searchSocket.bind(0, () => {
    searchSocket.setMulticastTTL(2);
    const payload = Buffer.from(search);
    [1900, 2021].forEach((port) => searchSocket.send(payload, port, '239.255.255.250'));
  });

  await sleep(timeoutMs);
  sockets.forEach((socket) => {
    try { socket.close(); } catch { /* closed already */ }
  });
  return [...found.values()].sort((a, b) => `${a.name}${a.host}`.localeCompare(`${b.name}${b.host}`));
}

function publish(payload, qos = 0) {
  return new Promise((resolve, reject) => {
    const topic = requestTopic();
    addMqttLog('out', topic, payload);
    const timer = setTimeout(() => reject(new Error('Printer command timeout.')), 5000);
    client.publish(topic, JSON.stringify(payload), { qos }, (error) => {
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    });
  });
}

function startPrinterConnection({ host, serial, accessCode }) {
  if (client) client.end(true);
  stopToolheadFanKeepalive();
  config = { host, serial, accessCode };
  connected = false;
  lastError = '';
  lastReport = null;

  client = mqtt.connect(`mqtts://${host}:8883`, {
    username: 'bblp',
    password: accessCode,
    clientId: `plotter_studio_${Date.now()}`,
    rejectUnauthorized: false,
    connectTimeout: 8000,
    reconnectPeriod: 3000,
  });

  client.on('connect', () => {
    connected = true;
    client.subscribe(reportTopic(), (error) => {
      if (!error) publish({ pushing: { sequence_id: nextSequence(), command: 'pushall' } }).catch(error => { lastError = error.message; });
    });
  });

  client.on('message', (topic, message) => {
    if (topic !== reportTopic()) return;
    try {
      const report = JSON.parse(message.toString());
      lastReport = mergePrinterReport(lastReport, report);
      addMqttLog('in', topic, report);
    } catch {
      lastReport = { raw: message.toString() };
      addMqttLog('in', topic, lastReport);
    }
  });

  client.on('error', (error) => {
    lastError = error.message;
  });

  client.on('close', () => {
    connected = false;
  });
}

async function sendGCode(gcode) {
  const param = gcode.endsWith('\n') ? gcode : `${gcode}\n`;
  await publish({
    print: {
      sequence_id: nextSequence(),
      command: 'gcode_line',
      param,
    },
  }, 0);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function stopToolheadFanKeepalive() {
  if (toolheadFanKeepalive) clearInterval(toolheadFanKeepalive);
  toolheadFanKeepalive = null;
}

function executableGCodeLines(gcode) {
  return gcode
    .split(/\r?\n/)
    .map((line) => cleanLine(line))
    .filter(Boolean);
}

async function sendGCodeStream(gcode, lineDelayMs = DEFAULT_LINE_DELAY_MS) {
  const lines = executableGCodeLines(gcode);
  let sent = 0;
  const delay = Math.max(80, Math.min(Number(lineDelayMs) || DEFAULT_LINE_DELAY_MS, 2000));
  if (activeStream) throw new Error('A plot is already streaming.');
  const stream = { abort: false, paused: false, controller: new AbortController() };
  activeStream = stream;
  const clock = createCommandClock();
  try {
  for (const batch of batchGCodeLines(lines, 2048, 64)) {
    if (stream.abort) break;
    while (stream.paused && !stream.abort) {
      await waitForStream(sleep(150), stream.controller.signal);
    }
    if (stream.abort) break;
    const sequence_id = nextSequence();
    const ack = waitForCommandAck(client, sequence_id, stream.controller.signal);
    await Promise.all([ack, waitForStream(publish({print:{sequence_id,command:'gcode_line',param:batch.join('\n')+'\n'}}), stream.controller.signal)]);
    if (stream.abort) break;
    sent += batch.length;
    await waitForStream(sleep(Math.max(delay, clock(batch)*1000)), stream.controller.signal);
  }
  return sent;
  } finally { if (activeStream === stream) activeStream = null; }
}

async function uploadGCodeFile(gcode, filename) {
  const ftp = new FTPClient(15000);
  try {
    await ftp.access({
      host: config.host,
      port: 990,
      user: 'bblp',
      password: config.accessCode,
      secure: 'implicit',
      secureOptions: { rejectUnauthorized: false },
    });
    await ftp.uploadFrom(Readable.from([gcode]), `/cache/${filename}`);
  } finally {
    ftp.close();
  }
}

async function startGCodeFile(filename) {
  await publish({
    print: {
      sequence_id: nextSequence(),
      command: 'gcode_file',
      param: `cache/${filename}`,
    },
  });
}

async function startA1PlotFile(filename, md5, signal) {
  if (signal.aborted) return { cancelled: true, started: false };
  const sequence_id = nextSequence();
  const watch = watchFileStart(client, reportTopic(), filename, signal);
  try {
    const [accepted] = await Promise.all([
      waitForCommandAck(client, sequence_id, signal, 15000, 'project_file'),
      publish(plotStartPayload(filename, md5, sequence_id)),
    ]);
    if (!accepted || signal.aborted) return { cancelled: true, started: false };
    await publish({ pushing: { sequence_id: nextSequence(), command: 'pushall' } });
    const result = await watch.promise;
    if (result.error) throw new Error(result.error);
    return result;
  } finally { watch.stop(); }
}

async function sendPrintControl(command) {
  await publish({
    print: {
      sequence_id: nextSequence(),
      command,
      param: '',
      reason: 'success',
      result: 'success',
    },
  }, 1);
}

async function emergencyStopPlot() {
  cancelStream(activeStream);

  await sendPrintControl('pause');
  await sleep(80);
  await sendPrintControl('stop');
  await sleep(80);

  // Some Bambu raw G-code paths ignore job stop. These direct lines are a best-effort
  // plotter safety fallback to stop motion after the printer accepts new commands.
  await sendGCode(`M400\nG0 Z${lastSafeZ.toFixed(2)} F3000\nM400`);
}

app.get('/api/app/version', (request, response) => {
  response.json({ ok: true, version: PACKAGE_INFO.version, name: PACKAGE_INFO.name });
});

app.get('/api/app/check-update', (request, response) => {
  response.json({ ok: true, currentVersion: PACKAGE_INFO.version,
    latestVersion: PACKAGE_INFO.version, updateAvailable: false });
});

app.post('/api/app/update', (request, response) => {
  response.status(409).json({ ok: false,
    error: 'Download a new BERETS Plot release and restart the app to update.' });
});

app.get('/api/printer/status', (request, response) => {
  response.json({
    ok: true,
    connected,
    streaming: Boolean(activeStream),
    config: config ? { host: config.host, serial: config.serial } : null,
    lastReport,
    lastError,
  });
});

app.get('/api/printer/mqtt-log', (request, response) => {
  const since = Number(request.query.since || 0);
  response.json({
    ok: true,
    entries: mqttLog.filter((entry) => entry.id > since),
    lastId: mqttLogSequence,
  });
});

app.post('/api/printer/mqtt-log/clear', (request, response) => {
  mqttLog.length = 0;
  response.json({ ok: true, lastId: mqttLogSequence });
});

app.post('/api/printer/connect', (request, response) => {
  const { host, serial, accessCode } = request.body;
  if (!host || !serial || !accessCode) {
    response.status(400).json({ ok: false, error: 'Host, serial, and access code are required.' });
    return;
  }

  startPrinterConnection({ host, serial, accessCode });
  response.json({ ok: true, message: 'Connection started. Check status for live connection state.' });
});

app.post('/api/printer/discover', async (request, response) => {
  const { serial = '', accessCode = '', autoConnect = true } = request.body || {};
  const printers = await discoverBambuPrinters();
  const normalizedSerial = String(serial).trim().toLowerCase();
  const serialMatch = normalizedSerial
    ? printers.find((printer) => String(printer.serial || '').toLowerCase() === normalizedSerial)
    : null;
  const matched = serialMatch || (printers.length === 1 ? printers[0] : null);

  if (autoConnect && matched && accessCode) {
    const connectionSerial = matched.serial || serial;
    if (!connectionSerial) {
      response.json({
        ok: true,
        printers,
        selectedPrinter: { host: matched.host, serial: matched.serial || '', name: matched.name, model: matched.model },
        message: `Found ${matched.name || 'Bambu printer'} at ${matched.host}, but no serial was discovered. Enter the serial once, then connect.`,
      });
      return;
    }
    startPrinterConnection({ host: matched.host, serial: connectionSerial, accessCode });
    response.json({
      ok: true,
      printers,
      connectedPrinter: { host: matched.host, serial: connectionSerial, name: matched.name, model: matched.model },
      message: `Found ${matched.name || 'Bambu printer'} at ${matched.host}. Connection started with saved access code.`,
    });
    return;
  }

  response.json({
    ok: true,
    printers,
    selectedPrinter: matched ? { host: matched.host, serial: matched.serial || '', name: matched.name, model: matched.model } : null,
    message: printers.length
      ? `Found ${printers.length} Bambu printer${printers.length === 1 ? '' : 's'}.`
      : 'No Bambu printers found on this network.',
  });
});

app.post('/api/printer/disconnect', (request, response) => {
  stopToolheadFanKeepalive();
  if (client) client.end(true);
  client = null;
  config = null;
  connected = false;
  lastReport = null;
  response.json({ ok: true });
});

app.get('/api/printer/storage', async (request, response) => {
  if (!requireConnected(response)) return;
  if (activeStream) return response.status(409).json({ ok: false, error: 'Storage inspection waits until file transfer finishes.' });
  const ftp = new FTPClient(10000);
  let stage = 'login';
  try {
    await ftp.access({ host: config.host, port: 990, user: 'bblp', password: config.accessCode,
      secure: 'implicit', secureOptions: { rejectUnauthorized: false } });
    stage = 'list';
    const files = await ftp.list();
    const recent = files.filter(file => /^berets_plot_.*\.gcode$/.test(file.name))
      .sort((a, b) => b.name.localeCompare(a.name)).slice(0, 3);
    const checks = [];
    for (const file of recent) {
      const item = { name: file.name, listedBytes: file.size };
      try { item.sizeBytes = await ftp.size('/' + file.name); }
      catch (error) { item.sizeError = error.message; }
      checks.push(item);
    }
    response.json({ ok: true, entries: files.length, folders: files.filter(file => file.isDirectory).map(file => file.name), recent: checks });
  } catch (error) {
    response.status(502).json({ ok: false, stage, error: error.message });
  } finally { ftp.close(); }
});

app.post('/api/printer/send-gcode', async (request, response) => {
  if (!requireConnected(response)) return;
  if (activeStream) { response.status(409).json({ ok: false, error: 'Another plot is streaming. Stop or wait for it first.' }); return; }
  const { gcode, confirmed = false, allowNegativeZ = false, allowHome = false, method = 'file', startDelayMs = DEFAULT_START_DELAY_MS, lineDelayMs = DEFAULT_LINE_DELAY_MS } = request.body;
  if (!confirmed) {
    response.status(400).json({ ok: false, error: 'Safety confirmation is required before sending G-code.' });
    return;
  }
  const validation = validateGCode(gcode ?? '', { allowNegativeZ, allowHome, method });
  if (!validation.ok) {
    response.status(400).json({ ok: false, validation });
    return;
  }
  const safeZMatch = (gcode || '').match(/\bG0\s+Z(\d+(\.\d+)?)\s+F/i);
  if (safeZMatch) lastSafeZ = Number(safeZMatch[1]);

  if (method !== 'stream' && ['PREPARE', 'RUNNING', 'PAUSE'].includes(lastReport?.print?.gcode_state)) {
    response.status(409).json({ ok: false, error: 'Printer already has an active job. Stop it before sending another file.' });
    return;
  }

  const resolvedMethod = method;

  if (resolvedMethod === 'stream') {
    let sentLineCount;
    try { sentLineCount = await sendGCodeStream(gcode, lineDelayMs); }
    catch(error) { lastError=error.message; response.status(502).json({ok:false,error:error.message}); return; }
    response.json({ ok: true, validation, method: resolvedMethod, sentLineCount, lineDelayMs });
    return;
  }

  const filename = `berets_plot_${Date.now()}.gcode.3mf`;
  const job = {abort:false,paused:false,controller:new AbortController()};
  activeStream=job;
  try {
    const archive = await buildPlotArchive(gcode);
    const result=await transferFileJob({gcode:archive.bytes,filename,ftp:new FTPClient(15000),
      access:{host:config.host,port:990,user:'bblp',password:config.accessCode,secure:'implicit',secureOptions:{rejectUnauthorized:false}},
      start:name=>startA1PlotFile(name,archive.md5,job.controller.signal),signal:job.controller.signal,remotePath:`/${filename}`});
    response.json({ok:true,validation,method:'file',filename,...result,message:result.cancelled?'File upload cancelled; printer not started.':'File uploaded and start requested.'});
  } catch(error) {
    lastError=error.message;
    response.status(502).json({ok:false,error:`File transfer failed: ${error.message}`});
  } finally {if(activeStream===job)activeStream=null;}

});

app.post('/api/printer/preflight-gcode', (request, response) => {
  const { gcode, allowNegativeZ = false, allowHome = false, method = 'file' } = request.body;
  const validation = validateGCode(gcode ?? '', { allowNegativeZ, allowHome, method });
  response.json({ ok: true, validation });
});

app.post('/api/printer/jog', async (request, response) => {
  if (!requireConnected(response)) return;
  if (activeStream) { response.status(409).json({ ok: false, error: 'Manual motion is unavailable while a plot is streaming.' }); return; }
  const { x = 0, y = 0, z = 0, feedrate = 1200, confirmed = false } = request.body;
  const move = { x: Number(x), y: Number(y), z: Number(z), feedrate: Number(feedrate) };
  if ([move.x, move.y, move.z, move.feedrate].some((value) => !Number.isFinite(value))) {
    response.status(400).json({ ok: false, error: 'Jog values must be finite numbers.' });
    return;
  }
  if (Math.max(Math.abs(move.x), Math.abs(move.y), Math.abs(move.z)) > 50) {
    response.status(400).json({ ok: false, error: 'Jog moves are limited to 50 mm per command.' });
    return;
  }
  if (move.z < 0 && !confirmed) {
    response.status(400).json({ ok: false, error: 'Negative Z jog requires confirmation.' });
    return;
  }

  const parts = ['G91'];
  const axes = [];
  if (move.x) axes.push(`X${move.x.toFixed(2)}`);
  if (move.y) axes.push(`Y${move.y.toFixed(2)}`);
  if (move.z) axes.push(`Z${move.z.toFixed(2)}`);
  if (axes.length) parts.push(`G0 ${axes.join(' ')} F${Math.round(move.feedrate)}`);
  parts.push('G90');
  await sendGCode(parts.join('\n'));
  response.json({ ok: true });
});

app.post('/api/printer/move-absolute', async (request, response) => {
  if (!requireConnected(response)) return;
  if (activeStream) { response.status(409).json({ ok: false, error: 'Manual motion is unavailable while a plot is streaming.' }); return; }
  const { x = 0, y = 0, z = 10, feedrate = 3000, confirmed = false } = request.body;
  const target = {
    x: Number(x), y: Number(y), z: Number(z), feedrate: Number(feedrate),
  };
  if ([target.x, target.y, target.z, target.feedrate].some((value) => !Number.isFinite(value))) {
    response.status(400).json({ ok: false, error: 'Move values must be finite numbers.' });
    return;
  }
  if (target.z < 0 && !confirmed) {
    response.status(400).json({ ok: false, error: 'Negative Z requires confirmation.' });
    return;
  }

  const gcode = [
    'G90',
    `G0 Z${target.z.toFixed(2)} F${Math.round(target.feedrate)}`,
    'M400',
    `G0 X${target.x.toFixed(2)} Y${target.y.toFixed(2)} F${Math.round(target.feedrate)}`,
  ].join('\n');

  await sendGCode(gcode);
  response.json({ ok: true });
});

app.post('/api/printer/set-z-zero', async (request, response) => {
  if (!requireConnected(response)) return;
  if (activeStream) { response.status(409).json({ ok: false, error: 'Manual motion is unavailable while a plot is streaming.' }); return; }
  const { confirmed = false } = request.body;
  if (!confirmed) {
    response.status(400).json({ ok: false, error: 'Confirm that the pen tip is touching the paper before setting Z zero.' });
    return;
  }
  await sendGCode('G92 Z0');
  response.json({ ok: true });
});

app.post('/api/printer/toolhead-fan', async (request, response) => {
  if (!requireConnected(response)) return;
  const { on = true } = request.body;
  const speed = on ? 255 : 0;
  stopToolheadFanKeepalive();
  await sendGCode(`M106 P0 S${speed}`);
  if (on) {
    toolheadFanKeepalive = setInterval(() => {
      if (!client || !connected) {
        stopToolheadFanKeepalive();
        return;
      }
      sendGCode('M106 P0 S255').catch((error) => {
        lastError = error.message;
        stopToolheadFanKeepalive();
      });
    }, 1000);
  }
  response.json({
    ok: true,
    message: on
      ? 'Toolhead/hotend fan keepalive started: M106 P0 S255 every 1s.'
      : 'Toolhead/hotend fan keepalive stopped: M106 P0 S0 sent.',
  });
});

app.post('/api/printer/home', async (request, response) => {
  if (!requireConnected(response)) return;
  if (activeStream) { response.status(409).json({ ok: false, error: 'Manual motion is unavailable while a plot is streaming.' }); return; }
  await sendGCode('G28');
  response.json({ ok: true });
});

app.post('/api/printer/release-motors', async (request, response) => {
  if (!requireConnected(response)) return;
  if (activeStream) { response.status(409).json({ ok: false, error: 'Manual motion is unavailable while a plot is streaming.' }); return; }
  const gcode = [
    '; BERETS Plot motor release',
    'G90',
    'M400',
    'M18 X Y Z',
    'M84 X Y Z',
    'M84',
    'M400',
    '',
  ].join('\n');
  const filename = `plotter_release_motors_${Date.now()}.gcode`;
  await uploadGCodeFile(gcode, filename);
  await sleep(500);
  await startGCodeFile(filename);
  response.json({ ok: true, message: `Motor release file started: cache/${filename}.` });
});

app.post('/api/printer/cancel-stream', (request, response) => {
  cancelStream(activeStream);
  response.json({ ok: true, message: 'Sending cancelled. Commands already accepted by the printer may still execute.' });
});

app.post('/api/printer/pause', async (request, response) => {
  if (!requireConnected(response)) return;
  if (activeStream) activeStream.paused = true;
  await sendPrintControl('pause');
  response.json({ ok: true, message: activeStream ? 'Paused line streaming and sent printer pause.' : 'Pause command sent.' });
});

app.post('/api/printer/resume', async (request, response) => {
  if (!requireConnected(response)) return;
  if (activeStream) activeStream.paused = false;
  await sendPrintControl('resume');
  response.json({ ok: true, message: activeStream ? 'Resumed line streaming and sent printer resume.' : 'Resume command sent.' });
});

app.post('/api/printer/stop', async (request, response) => {
  if (!requireConnected(response)) return;
  await emergencyStopPlot();
  response.json({ ok: true, message: 'Emergency stop sent: pause, stop, and safe Z lift requested.' });
});

app.use('/api', (request, response) => {
  response.status(404).json({ ok: false, error: 'Unknown API endpoint. Refresh the application.' });
});

app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  const status = error.type === 'entity.too.large' ? 413
    : error.type === 'entity.parse.failed' ? 400
    : /timeout/i.test(error.message || '') ? 504 : 500;
  const message = status === 413
    ? `Request exceeds the ${Math.round(error.limit / 1024 / 1024)} MB upload limit.`
    : status === 400 ? 'Invalid JSON request.'
    : error.message || 'Printer server error.';
  response.status(status).json({ ok: false, error: message });
});

if (existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  app.get(/.*/, (request, response) => {
    response.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
}

function openBrowser(url) {
  const command = process.platform === 'win32'
    ? 'cmd'
    : process.platform === 'darwin'
      ? 'open'
      : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}



function startServer(port = PORT, host = HOST, { openBrowser: shouldOpen } = {}) {
  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      const url = `http://${host}:${port}`;
      console.log(`BERETS Plot server listening at ${url}`);
      if (existsSync(STATIC_DIR)) console.log(`Serving app from ${STATIC_DIR}`);
      if (shouldOpen || SHOULD_OPEN_BROWSER) openBrowser(url);
      resolve(server);
    });
  });
}

export { app, startServer };

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  startServer(PORT, HOST, { openBrowser: SHOULD_OPEN_BROWSER });
}
