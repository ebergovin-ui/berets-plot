import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeSpeedLines } from '../src/nativeSpeed.js';
import { startServer } from '../server/index.js';

test('large SD jobs pass preflight; stream limits stay separate; API errors return JSON', async () => {
  const server = await startServer(0, '127.0.0.1', { openBrowser: false });
  const root = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body) => fetch(root + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const nativeJob = [...nativeSpeedLines(), 'G0 Z7 F1200', ...nativeSpeedLines(true), 'G1 X50 Y50 F49800', 'M400', ...nativeSpeedLines(), 'G0 Z7 F1200'].join('\n');
    const nativeResponse = await post('/api/printer/preflight-gcode', { gcode: nativeJob });
    assert.equal((await nativeResponse.json()).validation.ok, true);
    const invalidResponse = await post('/api/printer/preflight-gcode', { gcode: 'M204.2 K100' });
    assert.equal((await invalidResponse.json()).validation.ok, false);
    const gcode = 'G1 X123.456 Y123.456 F12000\n'.repeat(100001);
    let response = await post('/api/printer/preflight-gcode', { gcode, method: 'file' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).validation.ok, true);
    response = await post('/api/printer/preflight-gcode', { gcode, method: 'stream' });
    assert.equal((await response.json()).validation.ok, false);
    response = await post('/api/printer/send-gcode', { gcode, confirmed: true });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, 'Printer is not connected.');
    response = await post('/api/printer/connect', { padding: 'x'.repeat(2 * 1024 * 1024 + 1) });
    assert.equal(response.status, 413);
    assert.match((await response.json()).error, /upload limit/);
    response = await fetch(root + '/api/printer/preflight-gcode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).ok, false);
    response = await fetch(root + '/api/missing');
    assert.equal(response.status, 404);
    assert.equal((await response.json()).ok, false);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
