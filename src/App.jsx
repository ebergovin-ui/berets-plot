import { validateGCodeLocally } from './gcodeValidation.js';
import { composeScenePaths, commitDrawPath } from './scenePaths.js';
import QRCode from 'qrcode';
import { switchTool } from './toolProfiles.js';
import { emojiGlyphs, normalizeEmojiText } from './emojiGlyphs.js';
import { layoutDocument } from './documentLayout.js';
import standardFonts from './standardFonts.json';
import hersheyFonts from 'hersheytext/hersheytext.min.json';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import packageInfo from '../package.json';
import './App.css';
import { plotGeometryErrors } from './plotSafety.js';
import { compilePlot, samplePlot } from './plotJob.js';
import { translate } from './i18n.js';
import { validateProject } from './projectFile.js';
import { normalizePaper, resizeObject } from './editorGeometry.js';
import { formatTextBlock } from './textLayout.js';
import { speedProfile, upgradePlotProfile, orientPlotPoint, reachablePenBounds, unreachablePenZones } from './plotProfile.js';
import './Berets.css';

const PRESETS = {
  a1: { label: 'Bambu Lab A1', bedWidth: 256, bedHeight: 256, paperWidth: 210, paperHeight: 210, feedrate: 1200, travelSpeed: 3000 },
  a1mini: { label: 'Bambu Lab A1 mini', bedWidth: 180, bedHeight: 180, paperWidth: 148, paperHeight: 148, feedrate: 1100, travelSpeed: 2800 },
  x1c: { label: 'Bambu Lab X1 Carbon', bedWidth: 256, bedHeight: 256, paperWidth: 220, paperHeight: 220, feedrate: 1300, travelSpeed: 3200 },
  p1s: { label: 'Bambu Lab P1S', bedWidth: 256, bedHeight: 256, paperWidth: 220, paperHeight: 220, feedrate: 1300, travelSpeed: 3200 },
  custom: { label: 'Custom Board', bedWidth: 256, bedHeight: 256, paperWidth: 210, paperHeight: 210, feedrate: 1200, travelSpeed: 3000 },
};

const HERSHEY = {
  A: ['0,1 0.5,0 1,1', '0.22,0.58 0.78,0.58'],
  B: ['0,0 0,1 0.68,1 0.9,0.82 0.68,0.58 0,0.58', '0,0.58 0.72,0.58 0.94,0.34 0.72,0 0,0'],
  C: ['0.92,0.15 0.72,0 0.25,0 0,0.28 0,0.72 0.25,1 0.72,1 0.92,0.85'],
  D: ['0,0 0,1', '0,0 0.62,0 0.95,0.32 0.95,0.68 0.62,1 0,1'],
  E: ['0.9,0 0,0 0,1 0.9,1', '0,0.5 0.65,0.5'],
  F: ['0,1 0,0 0.9,0', '0,0.5 0.65,0.5'],
  G: ['0.92,0.18 0.72,0 0.25,0 0,0.28 0,0.72 0.25,1 0.75,1 0.98,0.72 0.98,0.58 0.62,0.58'],
  H: ['0,0 0,1', '1,0 1,1', '0,0.5 1,0.5'],
  I: ['0.2,0 0.8,0', '0.5,0 0.5,1', '0.2,1 0.8,1'],
  J: ['0.9,0 0.9,0.76 0.72,1 0.35,1 0.1,0.82'],
  K: ['0,0 0,1', '1,0 0,0.56 1,1'],
  L: ['0,0 0,1 0.88,1'],
  M: ['0,1 0,0 0.5,0.58 1,0 1,1'],
  N: ['0,1 0,0 1,1 1,0'],
  O: ['0.5,0 0.86,0.14 1,0.5 0.86,0.86 0.5,1 0.14,0.86 0,0.5 0.14,0.14 0.5,0'],
  P: ['0,1 0,0 0.72,0 0.95,0.22 0.72,0.5 0,0.5'],
  Q: ['0.5,0 0.86,0.14 1,0.5 0.86,0.86 0.5,1 0.14,0.86 0,0.5 0.14,0.14 0.5,0', '0.62,0.68 1,1'],
  R: ['0,1 0,0 0.72,0 0.95,0.22 0.72,0.5 0,0.5', '0.45,0.5 1,1'],
  S: ['0.9,0.14 0.68,0 0.25,0 0.05,0.22 0.25,0.48 0.72,0.52 0.95,0.76 0.72,1 0.25,1 0.05,0.84'],
  T: ['0,0 1,0', '0.5,0 0.5,1'],
  U: ['0,0 0,0.74 0.22,1 0.78,1 1,0.74 1,0'],
  V: ['0,0 0.5,1 1,0'],
  W: ['0,0 0.22,1 0.5,0.45 0.78,1 1,0'],
  X: ['0,0 1,1', '1,0 0,1'],
  Y: ['0,0 0.5,0.5 1,0', '0.5,0.5 0.5,1'],
  Z: ['0,0 1,0 0,1 1,1'],
  '0': ['0.5,0 0.86,0.14 1,0.5 0.86,0.86 0.5,1 0.14,0.86 0,0.5 0.14,0.14 0.5,0'],
  '1': ['0.35,0.24 0.5,0 0.5,1', '0.3,1 0.72,1'],
  '2': ['0.12,0.22 0.32,0 0.75,0 0.95,0.22 0.1,1 0.95,1'],
  '3': ['0.12,0.15 0.34,0 0.78,0 0.96,0.25 0.68,0.5 0.96,0.75 0.78,1 0.34,1 0.12,0.85'],
  '4': ['0.78,1 0.78,0', '0.12,0.65 0.95,0.65 0.72,0'],
  '5': ['0.9,0 0.18,0 0.08,0.46 0.72,0.46 0.95,0.7 0.75,1 0.25,1 0.08,0.85'],
  '6': ['0.86,0.12 0.62,0 0.2,0.15 0,0.5 0.18,0.9 0.58,1 0.92,0.78 0.78,0.52 0.2,0.5'],
  '7': ['0.08,0 0.95,0 0.35,1'],
  '8': ['0.5,0 0.86,0.16 0.78,0.42 0.5,0.5 0.22,0.42 0.14,0.16 0.5,0', '0.5,0.5 0.9,0.66 0.8,0.94 0.5,1 0.2,0.94 0.1,0.66 0.5,0.5'],
  '9': ['0.82,0.5 0.22,0.48 0.08,0.22 0.42,0 0.82,0.1 1,0.5 0.8,0.88 0.38,1 0.12,0.84'],
  '-': ['0.18,0.5 0.82,0.5'],
  '.': ['0.5,0.92 0.52,0.94'],
  '/': ['0.95,0 0.05,1'],
  '?': ['0.18,0.22 0.34,0 0.7,0 0.9,0.2 0.82,0.42 0.52,0.58 0.52,0.72', '0.52,0.92 0.54,0.94'],
  '!': ['0.5,0 0.5,0.72', '0.5,0.92 0.52,0.94'],
  ':': ['0.5,0.34 0.52,0.36', '0.5,0.76 0.52,0.78'],
  ',': ['0.56,0.9 0.42,1.1'],
  '+': ['0.5,0.2 0.5,0.8', '0.2,0.5 0.8,0.5'],
  '=': ['0.2,0.38 0.8,0.38', '0.2,0.62 0.8,0.62'],
  "'": ['0.48,0 0.38,0.22'],
  '"': ['0.34,0 0.28,0.22', '0.66,0 0.6,0.22'],
  '&': ['0.78,1 0.22,0.38 0.24,0.08 0.52,0 0.76,0.18 0.18,0.78 0.32,1 0.72,0.74'],
};

// Continuous ellipse rather than eight sharp vertices for round stroke glyphs.
HERSHEY.O = [Array.from({length:49}, (_,i) => { const a=i*Math.PI*2/48-Math.PI/2; return `${(0.5+0.5*Math.cos(a)).toFixed(5)},${(0.5+0.5*Math.sin(a)).toFixed(5)}`; }).join(' ')];
HERSHEY['0'] = HERSHEY.O;

// Single-stroke Cyrillic fallback for pen plotting; original Latin fonts remain selectable.
Object.entries({А:'A',В:'B',Е:'E',К:'K',М:'M',Н:'H',О:'O',Р:'P',С:'C',Т:'T',Х:'X'}).forEach(([letter, latin]) => { HERSHEY[letter] = HERSHEY[latin]; });
Object.assign(HERSHEY, {
  Б:['1,0 0,0 0,1 0.7,1 1,0.75 0.7,0.5 0,0.5'],
  Г:['0,1 0,0 1,0'], Д:['0,1 0.2,0.85 0.35,0 0.8,0 0.8,0.85 1,1','0,1 1,1','0,1 0,1.15','1,1 1,1.15'],
  Ё:[...HERSHEY.E,'0.25,-0.12 0.27,-0.1','0.7,-0.12 0.72,-0.1'],
  Ж:['0,0 1,1','1,0 0,1','0.5,0 0.5,1'], З:HERSHEY['3'],
  И:['0,0 0,1 1,0 1,1'], Й:['0,0 0,1 1,0 1,1','0.25,-0.2 0.5,-0.1 0.75,-0.2'],
  Л:['0,1 0.3,0 1,0 1,1'], П:['0,1 0,0 1,0 1,1'],
  У:['0,0 0.5,0.5 1,0','1,0 0.35,1 0,1'],
  Ф:['0.5,-0.1 0.5,1.1','0.5,0.1 0.1,0.2 0,0.5 0.1,0.8 0.5,0.9 0.9,0.8 1,0.5 0.9,0.2 0.5,0.1'],
  Ц:['0,0 0,1 1,1 1,0','1,1 1,1.15'], Ч:['0,0 0,0.5 1,0.5','1,0 1,1'],
  Ш:['0,0 0,1 1,1 1,0','0.5,0 0.5,1'], Щ:['0,0 0,1 1,1 1,0','0.5,0 0.5,1','1,1 1,1.15'],
  Ъ:['0,0 0.3,0 0.3,1 0.75,1 1,0.75 0.75,0.5 0.3,0.5'],
  Ы:['0,0 0,1 0.4,1 0.6,0.75 0.4,0.5 0,0.5','1,0 1,1'],
  Ь:['0,0 0,1 0.7,1 1,0.75 0.7,0.5 0,0.5'],
  Э:['0,0.15 0.3,0 0.7,0 1,0.3 1,0.7 0.7,1 0.3,1 0,0.85','0.4,0.5 1,0.5'],
  Ю:['0,0 0,1','0,0.5 0.4,0.5','0.7,0 0.4,0.2 0.4,0.8 0.7,1 1,0.8 1,0.2 0.7,0'],
  Я:['1,1 1,0 0.3,0 0,0.25 0.3,0.5 1,0.5','0.5,0.5 0,1'],
});

const DEFAULT_HERSHEY_FONT = 'simplex';
const LEGACY_FONT_OPTIONS = {
  simplex: { label: 'Hershey Simplex', slant: 0, weight: 1, width: 1, gap: 0 },
  duplex: { label: 'Hershey Duplex', slant: 0, weight: 2, width: 1, gap: 0 },
  italic: { label: 'Hershey Italic', slant: -0.18, weight: 1, width: 1, gap: 0 },
  condensed: { label: 'Hershey Condensed', slant: 0, weight: 1, width: 0.72, gap: 0.1 },
  wide: { label: 'Hershey Wide', slant: 0, weight: 1, width: 1.22, gap: 0 },
  shadow: { label: 'Plotter Shadow', slant: 0, weight: 2, width: 1, gap: 0.08 },
};
const REAL_HERSHEY_FONT_KEYS = ['futural', 'futuram', 'timesr', 'timesi', 'timesrb', 'scripts', 'scriptc', 'cursive', 'gothiceng', 'markers'];
const FONT_OPTIONS = {
  caveat: {label:'Caveat · рукописный / handwriting'},
  arial: { label: 'Arial · Liberation Sans' },
  'times-new-roman': { label: 'Times New Roman · Liberation Serif' },
  ...LEGACY_FONT_OPTIONS,
  ...Object.fromEntries(REAL_HERSHEY_FONT_KEYS
    .filter((key) => hersheyFonts[key])
    .map((key) => [key, { label: `Real ${hersheyFonts[key].name}` }])),
};
const isLegacyFont = (fontKey) => Boolean(LEGACY_FONT_OPTIONS[fontKey]);

const normalizeTextForGlyphs = (text) => normalizeEmojiText(text)
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-');

const getHersheyChar = (char, fontKey = DEFAULT_HERSHEY_FONT) => {
  if (emojiGlyphs[char]) return {paths:emojiGlyphs[char],width:25,isEmoji:true};
  if (standardFonts[fontKey]) return standardFonts[fontKey][char] || null;
  if (isLegacyFont(fontKey) || /[А-ЯЁа-яё]/.test(char)) {
    const legacyGlyph = HERSHEY[char.toUpperCase()];
    const style = LEGACY_FONT_OPTIONS[fontKey] || LEGACY_FONT_OPTIONS.simplex;
    return legacyGlyph ? { legacyGlyph, width: 10 * style.width, strokeWidth: 10 * style.width, slant: style.slant } : null;
  }
  const font = hersheyFonts[fontKey] || hersheyFonts.futural;
  if (!font || char === ' ' || char === '\n') return null;
  const data = font.chars?.[char.charCodeAt(0) - 33];
  if (data?.d) return { ...data, width: Number(data.o) || 10 };
  return null;
};

const unsupportedTextChars = (items) => {
  const unsupported = new Set();
  items.forEach((item) => {
    [...normalizeTextForGlyphs(item.text)].forEach((char) => {
      if (char !== ' ' && char !== '\n' && !getHersheyChar(char, item.fontKey)) unsupported.add(char);
    });
  });
  return [...unsupported];
};

const compressedTextItems = (items) => items.filter((item) => {
  if (item.fontSizePt) return false;
  const visibleChars = Math.max(1, ...normalizeTextForGlyphs(formatTextBlock(item)).split('\n').map((line) => [...line].filter((char) => char !== ' ').length));
  return item.object.w / visibleChars < MIN_TEXT_CHAR_WIDTH_MM;
});

const defaultSettings = {
  preset: 'a1',
  bedWidth: 256,
  bedHeight: 256,
  paperWidth: 210,
  paperHeight: 297,
  paperFormat: 'A4',
  scale: 1,
  penUpZ: 10,
  penLiftMm: 5,
  toolKey: 'pencil',
  toolProfiles: {},
  liftRevision: 1,
  penDownZ: 1,
  safeZ: 10,
  feedrate: 1500,
  travelSpeed: 1500,
  speedPercent: 5,
  turboMode: false,
  orientationRevision: 2,
  motionRevision: 1,
  zFeedrate: 1200,
  originX: 23,
  originY: 0,
  parkX: 0,
  parkY: 256,
  penTipOffsetX: 0,
  penTipOffsetY: 30,
  mountRevision: 1,
  penOffsetX: 0,
  penOffsetY: 0,
  mirrorOutputX: false,
  mirrorOutputY: true,
  homeBeforePlot: true,
  penProtrusion: 5,
  springTravel: 20,
};

const defaultObject = { x: 58, y: 88, w: 140, h: 54, angle: 0 };
const colors = ['#101827', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#2563eb'];
const HOSTED_MODE = import.meta.env.VITE_HOSTED_MODE === '1';
const PRINTER_API = import.meta.env.VITE_PRINTER_API_URL || 'http://127.0.0.1:5426';
const printerFetch = (url, options = {}) => fetch(url, { ...options, ...(HOSTED_MODE ? { targetAddressSpace: 'loopback' } : {}) });
const PRINTER_STORAGE_KEY = 'a1-plotter-printer-config';
const DRAW_MIN_DISTANCE_MM = 1.2;
const DRAW_MAX_POINTS_PER_STROKE = 900;
const MIN_TEXT_CHAR_WIDTH_MM = 5;

const loadPrinterConfig = () => {
  try {
    const saved = localStorage.getItem(PRINTER_STORAGE_KEY);
    if (!saved) return { host: '', serial: '', accessCode: '' };
    return { host: '', serial: '', accessCode: '', ...JSON.parse(saved) };
  } catch {
    return { host: '', serial: '', accessCode: '' };
  }
};

const getMqttEntrySummary = (entry) => {
  const payload = entry.payload || {};
  const print = payload.print;
  if (print?.command === 'gcode_line') {
    const line = String(print.param || '').trim().split(/\r?\n/)[0] || '(blank line)';
    return {
      title: 'G-code line',
      detail: line.length > 90 ? `${line.slice(0, 90)}...` : line,
      sequence: print.sequence_id,
    };
  }
  if (print?.command) {
    return {
      title: print.command,
      detail: print.param || print.reason || print.result || 'Printer command',
      sequence: print.sequence_id,
    };
  }
  if (payload.print?.gcode_state) {
    return { title: 'Printer state', detail: payload.print.gcode_state, sequence: payload.print.sequence_id };
  }
  if (payload.print) return { title: 'Printer report', detail: Object.keys(payload.print).slice(0, 5).join(', '), sequence: payload.print.sequence_id };
  return { title: entry.direction === 'out' ? 'Outgoing payload' : 'Printer report', detail: Object.keys(payload).slice(0, 5).join(', ') || 'JSON payload' };
};

const prettyMqttPayload = (payload) => JSON.stringify(payload, null, 2);

const stripLineNumber = (line) => line.replace(/^N\d+\s+/i, '');
const cleanGCodeLine = (line) => stripLineNumber(line).split(';')[0].trim();


const createTextItem = (id, index = 0) => ({
  id,
  text: index === 0 ? 'BERETS PLOT' : `TEXT ${index + 1}`,
  fontKey: DEFAULT_HERSHEY_FONT,
  fontSizePt: 12,
  lineSpacing: 1,
  align: 'left',
  object: {
    ...defaultObject,
    x: defaultObject.x + index * 10,
    y: defaultObject.y + index * 14,
  },
});

const rotatePoint = (x, y, cx, cy, angleDeg) => {
  const angle = (angleDeg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: cy + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
};

const transformLocalPoint = (point, object) => {
  const cx = object.x + object.w / 2;
  const cy = object.y + object.h / 2;
  return rotatePoint(object.x + point.x, object.y + point.y, cx, cy, object.angle);
};

const parseStroke = (stroke, x, y, w, h) => stroke.split(' ').map((pair) => {
  const [px, py] = pair.split(',').map(Number);
  return { x: x + px * w, y: y + py * h };
});

const makeLegacyTextPaths = (text, object, fontKey = DEFAULT_HERSHEY_FONT) => {
  const font = LEGACY_FONT_OPTIONS[fontKey] || LEGACY_FONT_OPTIONS.simplex;
  const chars = [...normalizeTextForGlyphs(text).toUpperCase()];
  if (!chars.length) return [];
  const charW = object.w / Math.max(chars.length, 1);
  return chars.flatMap((char, index) => {
    if (char === ' ') return [];
    const glyph = HERSHEY[char];
    if (!glyph) return [];
    const glyphWidth = charW * 0.72 * font.width;
    const left = index * charW + charW * (0.14 + font.gap);
    const strokes = glyph.map((stroke) => {
      const local = parseStroke(stroke, left, object.h * 0.1, glyphWidth, object.h * 0.8).map((point) => ({
        x: point.x + (point.y - object.h * 0.5) * font.slant,
        y: point.y,
      }));
      return local.map((point) => transformLocalPoint(point, object));
    });

    if (font.weight === 1) return strokes.map((stroke) => stroke.map((point) => ({ ...point, source: 'text' })));

    const offset = Math.max(0.55, charW * 0.018);
    return [
      ...strokes,
      ...strokes.map((stroke) => stroke.map((point) => ({ x: point.x + offset, y: point.y + offset }))),
    ].map((stroke) => stroke.map((point) => ({ ...point, source: 'text' })));
  });
};

const parseHersheyPathData = (d, offsetX, offsetY) => {
  const tokens = d.match(/[MmLlZz]|-?\d*\.?\d+/g) || [];
  const paths = [];
  let path = [];
  let command = null;
  let index = 0;

  const readPoint = () => {
    if (index + 1 >= tokens.length || Number.isNaN(Number(tokens[index])) || Number.isNaN(Number(tokens[index + 1]))) return null;
    const point = { x: Number(tokens[index]) + offsetX, y: Number(tokens[index + 1]) + offsetY };
    index += 2;
    return point;
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[MmLlZz]$/.test(token)) {
      command = token.toUpperCase();
      index += 1;
      if (command === 'Z') {
        if (path.length) paths.push(path);
        path = [];
      }
      continue;
    }

    const point = readPoint();
    if (!point) {
      index += 1;
      continue;
    }

    if (command === 'M') {
      if (path.length) paths.push(path);
      path = [point];
      command = 'L';
    } else {
      path.push(point);
    }
  }

  if (path.length) paths.push(path);
  return paths.filter((item) => item.length > 1);
};

const glyphToRawPaths = (charData, offsetX, offsetY) => {
  if (charData.paths) return charData.paths.map(path => path.map(p => ({ x: p.x + offsetX, y: p.y + offsetY })));
  if (charData.legacyGlyph) {
    return charData.legacyGlyph.map((stroke) => parseStroke(stroke, 0, 0, charData.strokeWidth || 10, 22).map((point) => ({x:offsetX + point.x + (point.y - 11) * (charData.slant || 0), y:offsetY + point.y})));
  }
  return parseHersheyPathData(charData.d, offsetX, offsetY);
};

const makeTextPaths = (text, object, fontKey = DEFAULT_HERSHEY_FONT, item = null) => {
  if (item?.fontSizePt) {
    const result = layoutDocument({...item,text:normalizeTextForGlyphs(item.text)}, (char) => {
      const data = getHersheyChar(char, fontKey);
      if (!data) return null;
      let paths = glyphToRawPaths(data, 0, standardFonts[fontKey] && !data.isEmoji ? 17.6 : 0);
      if (item.bold || fontKey === 'duplex') paths = [...paths, ...paths.map(path => path.map(p => ({...p,x:p.x+0.45})))];
      if (item.italic) paths = paths.map(path => path.map(p => ({...p,x:p.x+(22-p.y)*0.18})));
      return {width: data.width * (standardFonts[fontKey] ? 1 : 1.68), paths};
    });
    return result.paths.map(path => path.map(p => ({...transformLocalPoint(p, object), source: 'text'})));
  }
  // Use the shared multiline layout for both Latin and Cyrillic stroke glyphs.

  const chars = [...normalizeTextForGlyphs(text)];
  if (!chars.length) return [];

  const rawPaths = [];
  let cursorX = 0;
  let cursorY = 0;
  const advanceScale = standardFonts[fontKey] ? 1 : 1.68;
  const lineHeight = 28;
  const spaceWidth = 10 * advanceScale;

  chars.forEach((char) => {
    if (char === '\n') {
      cursorX = 0;
      cursorY += lineHeight;
      return;
    }
    if (char === ' ') {
      cursorX += spaceWidth;
      return;
    }

    const charData = getHersheyChar(char, fontKey);
    if (!charData) return;
    const glyphPaths = glyphToRawPaths(charData, cursorX, cursorY);
    rawPaths.push(...glyphPaths);
    if (fontKey === 'duplex' || fontKey === 'shadow') rawPaths.push(...glyphPaths.map((path) => path.map((point) => ({ ...point, x: point.x + 0.5 }))));
    cursorX += charData.width * advanceScale;
  });

  const boundsPoints = rawPaths.flat();
  if (!boundsPoints.length) return [];
  const minX = Math.min(...boundsPoints.map((point) => point.x));
  const maxX = Math.max(...boundsPoints.map((point) => point.x));
  const minY = Math.min(...boundsPoints.map((point) => point.y));
  const maxY = Math.max(...boundsPoints.map((point) => point.y));
  const rawWidth = Math.max(maxX - minX, 1);
  const rawHeight = Math.max(maxY - minY, 1);
  const padding = Math.min(object.w, object.h) * 0.06;
  const targetWidth = Math.max(object.w - padding * 2, 1);
  const targetHeight = Math.max(object.h - padding * 2, 1);
  const scale = Math.min(targetWidth / rawWidth, targetHeight / rawHeight);
  const fittedWidth = rawWidth * scale;
  const fittedHeight = rawHeight * scale;
  const left = padding + (targetWidth - fittedWidth) / 2;
  const top = padding + (targetHeight - fittedHeight) / 2;

  return rawPaths.map((path) => path.map((point) => transformLocalPoint({
    x: left + (point.x - minX) * scale,
    y: top + (point.y - minY) * scale,
  }, object)).map((point) => ({ ...point, source: 'text' })));
};

const makeCalibrationPaths = (settings) => {
  const w = Math.min(50, settings.paperWidth);
  const h = Math.min(50, settings.paperHeight);
  const cx = settings.bedWidth / 2;
  const cy = settings.bedHeight / 2;
  const x = cx - w / 2;
  const y = cy - h / 2;
  return [
    [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }],
    [{ x, y }, { x: x + w, y: y + h }],
    [{ x: x + w, y }, { x, y: y + h }],
    [{ x: x + w / 2, y }, { x: x + w / 2, y: y + h }],
    [{ x, y: y + h / 2 }, { x: x + w, y: y + h / 2 }],
    [{ x: x + w + 8, y }, { x: x + w + 8, y: y + 16 }],
    [{ x: x + w + 2, y: y + 8 }, { x: x + w + 14, y: y + 8 }],
  ];
};

const cleanPaths = (paths) => (Array.isArray(paths) ? paths : [])
  .filter((path) => Array.isArray(path) && path.length > 0)
  .map((path) => path.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y)))
  .filter((path) => path.length > 0);

const applySettings = (paths, settings, { mirrorOutput = true } = {}) => cleanPaths(paths).map((path) => path.map((point) => {
  const scaled = { x: settings.originX + (point.x - settings.originX) * settings.scale, y: settings.originY + (point.y - settings.originY) * settings.scale };
  return mirrorOutput ? orientPlotPoint(scaled, settings) : scaled;
}));

const penToNozzlePoint = (point, settings) => ({
  x: point.x - settings.penTipOffsetX + settings.penOffsetX,
  y: point.y - settings.penTipOffsetY + settings.penOffsetY,
});

const getReachableBounds = reachablePenBounds;

const clampPaperToReachableArea = normalizePaper;

const toPathData = (path) => cleanPaths([path])[0]?.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ') || '';

const estimateDistance = (paths) => cleanPaths(paths).reduce((total, path) => total + path.slice(1).reduce((sum, point, index) => {
  const previous = path[index];
  return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
}, 0), 0);

const playbackPathsAtProgress = (paths, progress) => {
  const cleaned = cleanPaths(paths);
  const target = estimateDistance(cleaned) * progress;
  const out = [];
  let drawn = 0;

  for (const path of cleaned) {
    if (path.length < 2) continue;
    const nextPath = [path[0]];
    for (let index = 1; index < path.length; index += 1) {
      const previous = path[index - 1];
      const current = path[index];
      const segmentLength = distance(previous, current);
      if (drawn + segmentLength <= target) {
        nextPath.push(current);
        drawn += segmentLength;
        continue;
      }
      const remaining = Math.max(0, target - drawn);
      if (remaining > 0 && segmentLength > 0) {
        const t = remaining / segmentLength;
        nextPath.push({
          x: previous.x + (current.x - previous.x) * t,
          y: previous.y + (current.y - previous.y) * t,
        });
      }
      if (nextPath.length > 1) out.push(nextPath);
      return out;
    }
    if (nextPath.length > 1) out.push(nextPath);
  }

  return out;
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const simplifyPath = (path, tolerance = 0.002) => {
  if (path.length <= 2) return path;
  const simplified = [path[0]];
  let anchor = path[0];
  for (let index = 1; index < path.length - 1; index += 1) {
    const point = path[index];
    if (distance(anchor, point) >= tolerance) {
      simplified.push(point);
      anchor = point;
    }
  }
  simplified.push(path[path.length - 1]);
  return simplified;
};

const traceEdgePolylines = (sampleWidth, sampleHeight, isEdge, maxPaths = 4000) => {
  const keyFor = (x, y) => `${x},${y}`;
  const edgePixels = new Set();
  for (let y = 1; y < sampleHeight - 1; y += 1) {
    for (let x = 1; x < sampleWidth - 1; x += 1) {
      if (isEdge(x, y)) edgePixels.add(keyFor(x, y));
    }
  }

  const visited = new Set();
  const paths = [];
  const neighbors = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  edgePixels.forEach((startKey) => {
    if (visited.has(startKey) || paths.length >= maxPaths) return;
    const [startX, startY] = startKey.split(',').map(Number);
    const stack = [[startX, startY]];
    const component = [];
    visited.add(startKey);

    while (stack.length) {
      const [x, y] = stack.pop();
      component.push([x, y]);
      neighbors.forEach(([dx, dy]) => {
        const nextKey = keyFor(x + dx, y + dy);
        if (edgePixels.has(nextKey) && !visited.has(nextKey)) {
          visited.add(nextKey);
          stack.push([x + dx, y + dy]);
        }
      });
    }

    if (component.length < 3) return;
    const cx = component.reduce((sum, point) => sum + point[0], 0) / component.length;
    const cy = component.reduce((sum, point) => sum + point[1], 0) / component.length;
    const path = component
      .sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx))
      .map(([x, y]) => ({ x: x / sampleWidth, y: y / sampleHeight }));
    if (distance(path[0], path[path.length - 1]) < 0.08) path.push(path[0]);
    paths.push(simplifyPath(path, 0.003));
  });

  return paths;
};

const segmentKey = (a, b, precision = 1) => {
  const p1 = `${a.x.toFixed(precision)},${a.y.toFixed(precision)}`;
  const p2 = `${b.x.toFixed(precision)},${b.y.toFixed(precision)}`;
  return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
};

const removeDuplicateSegments = (paths) => {
  const seen = new Set();
  const cleaned = [];

  cleanPaths(paths).forEach((path) => {
    const rebuilt = [path[0]];
    for (let index = 1; index < path.length; index += 1) {
      const previous = path[index - 1];
      const current = path[index];
      if (distance(previous, current) < 0.05) continue;
      const key = segmentKey(previous, current);
      if (seen.has(key)) {
        if (rebuilt.length > 1) {
          cleaned.push([...rebuilt]);
          rebuilt.length = 0;
        }
        rebuilt.push(current);
        continue;
      }
      seen.add(key);
      if (rebuilt.length === 0) rebuilt.push(previous);
      rebuilt.push(current);
    }
    if (rebuilt.length > 1) cleaned.push(rebuilt);
  });

  return cleaned;
};

const optimizePaths = (paths) => {
  const remaining = removeDuplicateSegments(paths).filter((path) => path.length > 1).map((path) => [...path]);
  const ordered = [];
  let pen = { x: 0, y: 0 };
  while (remaining.length) {
    let bestIndex = 0;
    let bestReverse = false;
    let bestDistance = Infinity;
    remaining.forEach((path, index) => {
      const startDistance = distance(pen, path[0]);
      const endDistance = distance(pen, path[path.length - 1]);
      if (startDistance < bestDistance) {
        bestIndex = index;
        bestReverse = false;
        bestDistance = startDistance;
      }
      if (endDistance < bestDistance) {
        bestIndex = index;
        bestReverse = true;
        bestDistance = endDistance;
      }
    });
    const [next] = remaining.splice(bestIndex, 1);
    const path = bestReverse ? next.reverse() : next;
    ordered.push(path);
    pen = path[path.length - 1];
  }
  return ordered;
};

const orderPathsForExport = (paths, { preserveOrder = false } = {}) => {
  if (preserveOrder) return cleanPaths(paths).filter((path) => path.length > 1);
  const cleaned = removeDuplicateSegments(paths).filter((path) => path.length > 1);
  return optimizePaths(cleaned);
};

const makeHatchPaths = (settings, angle = 0, spacing = 6) => {
  const paths = [];
  const x0 = settings.originX;
  const y0 = settings.originY;
  const w = settings.paperWidth;
  const h = settings.paperHeight;
  if (angle === 90) {
    for (let x = x0; x <= x0 + w; x += spacing) paths.push([{ x, y: y0 }, { x, y: y0 + h }]);
    return paths;
  }
  if (angle === 45) {
    for (let i = -h; i < w; i += spacing) paths.push([{ x: x0 + Math.max(i, 0), y: y0 + Math.max(-i, 0) }, { x: x0 + Math.min(w, i + h), y: y0 + Math.min(h, h - Math.max(i, 0)) }]);
    return paths;
  }
  for (let y = y0; y <= y0 + h; y += spacing) paths.push([{ x: x0, y }, { x: x0 + w, y }]);
  return paths;
};

const makeSpiralPaths = (settings) => {
  const cx = settings.originX + settings.paperWidth / 2;
  const cy = settings.originY + settings.paperHeight / 2;
  const maxR = Math.min(settings.paperWidth, settings.paperHeight) * 0.42;
  const points = [];
  for (let t = 0; t < Math.PI * 18; t += 0.18) {
    const r = (t / (Math.PI * 18)) * maxR;
    points.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  }
  return [points];
};

const makeFlowPaths = (settings) => {
  const paths = [];
  for (let row = 0; row < 18; row += 1) {
    const y = settings.originY + 12 + row * (settings.paperHeight - 24) / 17;
    const path = [];
    for (let x = settings.originX + 10; x <= settings.originX + settings.paperWidth - 10; x += 6) {
      path.push({ x, y: y + Math.sin(x * 0.08 + row * 0.7) * 7 + Math.sin(x * 0.025) * 4 });
    }
    paths.push(path);
  }
  return paths;
};

const makeContourPaths = (settings) => {
  const paths = [];
  const cx = settings.originX + settings.paperWidth / 2;
  const cy = settings.originY + settings.paperHeight / 2;
  for (let ring = 1; ring <= 10; ring += 1) {
    const points = [];
    const base = ring * Math.min(settings.paperWidth, settings.paperHeight) / 24;
    for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.18) {
      const r = base + Math.sin(a * 5 + ring) * 3 + Math.cos(a * 3) * 2;
      points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    paths.push(points);
  }
  return paths;
};

const shapeToPaths = (shape) => {
  const { type, x, y, rotation, radius, width, height, outerRadius, innerRadius } = shape;
  const segments = 64;
  if (type === 'circle') {
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push({ x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius });
    }
    return [pts];
  }
  if (type === 'rect') {
    const hw = width / 2;
    const hh = height / 2;
    const corners = [
      { x: x - hw, y: y - hh },
      { x: x + hw, y: y - hh },
      { x: x + hw, y: y + hh },
      { x: x - hw, y: y + hh },
      { x: x - hw, y: y - hh },
    ];
    return [rotation ? corners.map((p) => rotatePoint(p.x, p.y, x, y, rotation)) : corners];
  }
  if (type === 'star') {
    const pts = [];
    const n = 5;
    for (let i = 0; i < n * 2; i++) {
      const a = (i * Math.PI) / n - Math.PI / 2;
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    }
    pts.push({ x: pts[0].x, y: pts[0].y });
    return [rotation ? pts.map((p) => rotatePoint(p.x, p.y, x, y, rotation)) : pts];
  }
  if (type === 'line') {
    const halfLen = (shape.length || 20) / 2;
    const p1 = { x: x - halfLen, y: y };
    const p2 = { x: x + halfLen, y: y };
    if (rotation) {
      return [[rotatePoint(p1.x, p1.y, x, y, rotation), rotatePoint(p2.x, p2.y, x, y, rotation)]];
    }
    return [[p1, p2]];
  }
  if (type === 'hexagon') {
    const r = shape.radius || 12;
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    }
    return [rotation ? pts.map((p) => rotatePoint(p.x, p.y, x, y, rotation)) : pts];
  }
  return [];
};

const shapeBoundingBox = (shape) => {
  const paths = shapeToPaths(shape);
  const pts = paths.flat();
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

const computeDragShape = (type, start, pt) => {
  const dx = pt.x - start.x;
  const dy = pt.y - start.y;
  const dist = Math.hypot(dx, dy);
  if (type === 'circle') {
    return { type: 'circle', x: start.x, y: start.y, radius: Math.max(1, dist), rotation: 0 };
  }
  if (type === 'rect') {
    const x = Math.min(start.x, pt.x);
    const y = Math.min(start.y, pt.y);
    const w = Math.abs(pt.x - start.x);
    const h = Math.abs(pt.y - start.y);
    return { type: 'rect', x: x + w / 2, y: y + h / 2, width: Math.max(1, w), height: Math.max(1, h), rotation: 0 };
  }
  if (type === 'star') {
    const r = Math.max(1, dist);
    return { type: 'star', x: start.x, y: start.y, outerRadius: r, innerRadius: Math.max(0.5, r * 0.47), rotation: 0 };
  }
  if (type === 'line') {
    const len = Math.max(1, dist);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return { type: 'line', x: (start.x + pt.x) / 2, y: (start.y + pt.y) / 2, length: len, rotation: Math.round(angle) };
  }
  if (type === 'hexagon') {
    return { type: 'hexagon', x: start.x, y: start.y, radius: Math.max(1, dist), rotation: 0 };
  }
  return null;
};

const normalizePathsToObjectLocal = (paths) => {
  const points = paths.flat();
  if (!points.length) return [];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  return paths.map((path) => path.map((point) => ({
    x: (point.x - minX) / w,
    y: (point.y - minY) / h,
  })));
};

const sampleSvgGeometry = (element, steps = 160) => {
  if (!element.getTotalLength) return [];
  const total = element.getTotalLength();
  if (!Number.isFinite(total) || total <= 0) return [];
  const count = Math.max(2, Math.min(steps, Math.ceil(total / 2)));
  const path = [];
  for (let i = 0; i <= count; i += 1) {
    const point = element.getPointAtLength((total * i) / count);
    path.push({ x: point.x, y: point.y });
  }
  return path;
};

const editorDraft = (() => { try { const data = JSON.parse(localStorage.getItem('berets-editor-draft') || 'null'); return validateProject(data) ? data : null; } catch { return null; } })();

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('berets-theme') || 'dark');
  const [language, setLanguage] = useState(() => localStorage.getItem('berets-language') || 'ru');
  const [showTravel, setShowTravel] = useState(false);
  const [nozzleOpen, setNozzleOpen] = useState(false);
  const [canvasFocus, setCanvasFocus] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [projectMessage, setProjectMessage] = useState('');
  const t = (key) => translate(language, key);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('berets-theme', theme); }, [theme]);
  useEffect(() => { document.documentElement.lang = language; localStorage.setItem('berets-language', language); }, [language]);

  const [mode, setMode] = useState('text');
  const [photoMode, setPhotoMode] = useState('image');
  const [textItems, setTextItems] = useState(() => editorDraft?.textItems.map(item => ({fontSizePt:12, lineSpacing:1, align:'left', ...item})) || [createTextItem('text-1')]);
  const [selectedTextId, setSelectedTextId] = useState('text-1');
  const [previewUrl, setPreviewUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [traceThreshold, setTraceThreshold] = useState(130);
  const [traceSpacing, setTraceSpacing] = useState(3);
  const [traceDetail, setTraceDetail] = useState(280);
  const [traceInvert, setTraceInvert] = useState(false);
  const [traceMode, setTraceMode] = useState('hatching');
  const [svgName, setSvgName] = useState('');
  const [importedSvgPaths, setImportedSvgPaths] = useState(() => editorDraft?.importedSvgPaths || []);
  const [svgFillPaths, setSvgFillPaths] = useState(() => editorDraft?.svgFillPaths || []);
  const [fillHoles, setFillHoles] = useState(false);
  const [qrText, setQrText] = useState('https://example.com');
  const [qrStyle, setQrStyle] = useState('dots');
  const [qrFilled, setQrFilled] = useState(false);
  const [qrPaths, setQrPaths] = useState(() => editorDraft?.qrPaths || []);
  const [patternType, setPatternType] = useState('hatching');
  const [drawPaths, setDrawPaths] = useState(() => editorDraft?.drawPaths || []);
  const [imageLocalPaths, setImageLocalPaths] = useState(() => editorDraft?.imageLocalPaths || []);
  const [layers, setLayers] = useState(() => editorDraft?.layers || []);
  const [objectVisibility, setObjectVisibility] = useState({
    text: true,
    image: true,
    svg: true,
    qr: true,
    draw: true,
    generated: true,
    shapes: true,
  });
  const [settings, setSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('berets-nozzle-profile-v2') || localStorage.getItem('berets-nozzle-profile-v1') || '{}');
      if (!saved.paperFormat) Object.assign(saved, { paperFormat: 'A4', paperWidth: 210, paperHeight: 297, originX: 23, originY: 0 });
      return clampPaperToReachableArea(upgradePlotProfile(saved, defaultSettings));
    } catch { return clampPaperToReachableArea({...defaultSettings, ...speedProfile(defaultSettings.speedPercent)}); }
  });
  const [object, setObject] = useState(() => editorDraft?.object || defaultObject);
  const [backendEnabled, setBackendEnabled] = useState(!HOSTED_MODE);
  const [printerConfig, setPrinterConfig] = useState(loadPrinterConfig);
  const [printerStatus, setPrinterStatus] = useState({ connected: false, lastReport: null });
  const [printerMessage, setPrinterMessage] = useState('');
  const [printerError, setPrinterError] = useState('');
  useEffect(() => {
    if (!backendEnabled) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await printerFetch(`${PRINTER_API}/api/printer/status`);
        const data = await response.json();
        if (!cancelled && data.ok) {
          setPrinterStatus(data);
          if (!data.connected) setCalibrationStep('idle');
        }
      } catch { if (!cancelled) { setPrinterStatus({ connected: false }); setCalibrationStep('idle'); } }
    };
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [backendEnabled]);

  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [preflightMessage, setPreflightMessage] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [printerDetailsOpen, setPrinterDetailsOpen] = useState(false);
  const [motionOpen, setMotionOpen] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState('idle');
  const [plotBusy, setPlotBusy] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const operationLock = useRef(false);
  useEffect(() => { localStorage.setItem('berets-nozzle-profile-v2', JSON.stringify(settings)); }, [settings]);
  const zConfirmed = false;
  const sendConfirmed = true;
  const [tapToMoveActive, setTapToMoveActive] = useState(false);
  const [tapToMoveMarker, setTapToMoveMarker] = useState(null);
  const [toolheadFanOn, setToolheadFanOn] = useState(false);
  const [homeBeforeDirectSend] = useState(false);
  const [preserveZZero] = useState(false);
  const [bambuSafetyHeader, setBambuSafetyHeader] = useState(true);
  const [lineNumbersEnabled, setLineNumbersEnabled] = useState(false);
  const [lineDelayMs, setLineDelayMs] = useState(80);
  const [preparedJob, setPreparedJob] = useState(null);
  const [mqttViewerOpen, setMqttViewerOpen] = useState(false);
  const [mqttLogEntries, setMqttLogEntries] = useState([]);
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState({ message: '', latestVersion: '', updateAvailable: false });
  const [updateBusy, setUpdateBusy] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [playbackOpen, setPlaybackOpen] = useState(false);
  const [playbackPlaying, setPlaybackPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [shapes, setShapes] = useState(() => editorDraft?.shapes || []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem('berets-editor-draft', JSON.stringify({ format: 'berets-plot', version: 1, settings, mode, textItems, shapes, layers, drawPaths, importedSvgPaths, svgFillPaths, imageLocalPaths, object, qrPaths, objectVisibility })); } catch { /* File export remains available if browser storage is full. */ }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [settings, mode, textItems, shapes, layers, drawPaths, importedSvgPaths, svgFillPaths, imageLocalPaths, object, qrPaths, objectVisibility]);
  const [selectedShapeId, setSelectedShapeId] = useState(null);
  const [activeTool, setActiveTool] = useState('none');
  const [tempShape, setTempShape] = useState(null);
  const mqttLastId = useRef(0);
  const mqttLogRef = useRef(null);
  const dragMode = useRef(null);
  const shapeDragStart = useRef(null);
  const dragStart = useRef({ x: 0, y: 0, object: defaultObject, settings: defaultSettings, textItems: [], textId: null });
  const activeDrawPath = useRef(null);
  const activeDrawIndex = useRef(null);
  const drawFrame = useRef(null);
  const tapToMoveMarkerTimeout = useRef(null);
  const autoDiscoveryTried = useRef(false);
  const selectedText = textItems.find((item) => item.id === selectedTextId) || textItems[0];
  const unsupportedChars = useMemo(() => unsupportedTextChars(textItems), [textItems]);
  const compressedTexts = useMemo(() => compressedTextItems(textItems), [textItems]);

  const textPaths = useMemo(() => textItems.flatMap((item) => makeTextPaths(formatTextBlock(item), item.object, item.fontKey, item)), [textItems]);
  const svgPaths = useMemo(() => [...importedSvgPaths, ...svgFillPaths]
    .map((path) => path.map((point) => transformLocalPoint({
      x: point.x * object.w,
      y: point.y * object.h,
    }, object))), [importedSvgPaths, object, svgFillPaths]);
  const transformedQrPaths = useMemo(() => {
    const size = Math.min(object.w, object.h);
    const offsetX = (object.w - size) / 2;
    const offsetY = (object.h - size) / 2;
    return qrPaths.map((path) => path.map((point) => transformLocalPoint({
      x: offsetX + point.x * size,
      y: offsetY + point.y * size,
    }, object)));
  }, [object, qrPaths]);
  const imagePaths = useMemo(() => (
    imageLocalPaths.map((path) => path.map((point) => transformLocalPoint({
      x: point.x * object.w,
      y: point.y * object.h,
    }, object)))
  ), [imageLocalPaths, object]);
  const generatedModePaths = useMemo(() => {
    if (mode === 'patterns') {
      if (patternType === 'spiral') return makeSpiralPaths(settings);
      if (patternType === 'flow') return makeFlowPaths(settings);
      if (patternType === 'contour') return makeContourPaths(settings);
      if (patternType === 'crosshatch') return [...makeHatchPaths(settings, 0, traceSpacing), ...makeHatchPaths(settings, 90, traceSpacing)];
      return makeHatchPaths(settings, patternType === 'diagonal' ? 45 : 0, traceSpacing);
    }
    if (mode === 'calibrate') return makeCalibrationPaths(settings);
    return [];
  }, [mode, patternType, settings, traceSpacing]);
  const shapePaths = useMemo(() => shapes.flatMap(shapeToPaths), [shapes]);
  const projectPaths = useMemo(() => cleanPaths([
    ...(objectVisibility.text ? textPaths : []),
    ...(objectVisibility.image ? imagePaths : []),
    ...(objectVisibility.svg ? svgPaths : []),
    ...(objectVisibility.qr ? transformedQrPaths : []),
    ...(objectVisibility.draw ? drawPaths : []),
    ...(objectVisibility.generated ? generatedModePaths : []),
    ...(objectVisibility.shapes ? shapePaths : []),
  ]), [drawPaths, generatedModePaths, imagePaths, objectVisibility, shapePaths, svgPaths, textPaths, transformedQrPaths]);
  const workingPaths = useMemo(() => {
    if (mode === 'text') return textPaths;
    if (mode === 'photos' && photoMode === 'image') return imagePaths;
    if (mode === 'photos' && photoMode === 'svg') return svgPaths;
    if (mode === 'qr') return transformedQrPaths;
    if (mode === 'draw') return cleanPaths(drawPaths);
    if (mode === 'shapes') return shapePaths;
    return generatedModePaths;
  }, [drawPaths, generatedModePaths, imagePaths, mode, photoMode, shapePaths, svgPaths, textPaths, transformedQrPaths]);

  const enabledLayers = useMemo(() => layers.filter((layer) => layer.enabled).sort((a, b) => a.order - b.order), [layers]);
  const exportSourcePaths = useMemo(() => composeScenePaths(layers, projectPaths), [layers, projectPaths]);
  const logicalPreviewPaths = useMemo(() => applySettings(exportSourcePaths, settings, { mirrorOutput: false }), [exportSourcePaths, settings]);
  const exportPaths = useMemo(() => orderPathsForExport(applySettings(exportSourcePaths, settings), { preserveOrder: true }), [exportSourcePaths, mode, settings]);
  const stats = useMemo(() => ({
    paths: exportPaths.length,
    points: exportPaths.reduce((sum, path) => sum + path.length, 0),
    distance: estimateDistance(exportPaths),
  }), [exportPaths]);
  const objectRows = useMemo(() => [
    { key: 'text', label: 'Text', count: textPaths.length },
    { key: 'image', label: 'Image', count: imagePaths.length },
    { key: 'svg', label: 'SVG', count: svgPaths.length },
    { key: 'qr', label: 'QR', count: transformedQrPaths.length },
    { key: 'draw', label: 'Drawing', count: drawPaths.length },
    { key: 'generated', label: 'Generated', count: generatedModePaths.length },
    { key: 'shapes', label: 'Shapes', count: shapes.length },
  ], [drawPaths.length, generatedModePaths.length, imagePaths.length, shapes.length, svgPaths.length, textPaths.length, transformedQrPaths.length]);
  const playbackSourcePaths = exportPaths;
  const compiledPreview = useMemo(() => { try { return { ...compilePlot(exportPaths, settings), error: '' }; } catch (error) { return { segments: [], seconds: 0, error: error.message }; } }, [exportPaths, settings]);
  const simulated = useMemo(() => samplePlot(compiledPreview.segments, playbackProgress), [compiledPreview, playbackProgress]);
  const displayMotionPoint = (point, draw = true) => {
    const penPoint = { x: point.x + settings.penTipOffsetX - settings.penOffsetX, y: point.y + settings.penTipOffsetY - settings.penOffsetY };
    const logical = orientPlotPoint(penPoint, settings);
    return draw ? logical : {x:logical.x - settings.penTipOffsetX + settings.penOffsetX, y:logical.y - settings.penTipOffsetY + settings.penOffsetY};
  };

  const playbackPreviewPaths = useMemo(() => playbackPathsAtProgress(playbackSourcePaths, playbackProgress), [playbackSourcePaths, playbackProgress]);

  const sliceSignature = useMemo(() => JSON.stringify({
    paths: exportPaths.map((path) => path.map((point) => [Number(point.x.toFixed(2)), Number(point.y.toFixed(2))])),
    settings: {
      safeZ: settings.safeZ,
      penUpZ: settings.penUpZ,
      penDownZ: settings.penDownZ,
      feedrate: settings.feedrate,
      travelSpeed: settings.travelSpeed,
      turboMode: settings.turboMode,
      zFeedrate: settings.zFeedrate,
      parkX: settings.parkX,
      parkY: settings.parkY,
      penTipOffsetX: settings.penTipOffsetX,
      penTipOffsetY: settings.penTipOffsetY,
      penOffsetX: settings.penOffsetX,
      penOffsetY: settings.penOffsetY,
      mirrorOutputX: settings.mirrorOutputX,
      mirrorOutputY: settings.mirrorOutputY,
    },
    homeBeforeDirectSend,
    zConfirmed,
    preserveZZero,
    bambuSafetyHeader,
    lineNumbersEnabled,
  }), [bambuSafetyHeader, exportPaths, homeBeforeDirectSend, lineNumbersEnabled, preserveZZero, settings.feedrate, settings.mirrorOutputX, settings.mirrorOutputY, settings.parkX, settings.parkY, settings.penDownZ, settings.penOffsetX, settings.penOffsetY, settings.penTipOffsetX, settings.penTipOffsetY, settings.penUpZ, settings.safeZ, settings.travelSpeed, settings.turboMode, settings.zFeedrate, zConfirmed]);
  const preparedJobIsFresh = preparedJob?.signature === sliceSignature;
  const unreachableZones = useMemo(() => unreachablePenZones(settings), [settings.bedHeight, settings.bedWidth, settings.penTipOffsetX, settings.penTipOffsetY, settings.penOffsetX, settings.penOffsetY]);

  const handlePresetChange = (presetKey) => {
    const preset = PRESETS[presetKey];
    setSettings((current) => clampPaperToReachableArea({
      ...current,
      preset: presetKey,
      bedWidth: preset.bedWidth,
      bedHeight: preset.bedHeight,
      paperWidth: preset.paperWidth,
      paperHeight: preset.paperHeight,
      ...speedProfile(settings.speedPercent, settings.turboMode),
      parkY: preset.bedHeight,
    }));
  };

  const handleSettingChange = (key, value) => {
    setSettings((current) => clampPaperToReachableArea({
      ...current,
      preset: ['bedWidth', 'bedHeight'].includes(key) ? 'custom' : current.preset,
      [key]: value,
    }));
  };

  const addWorkingLayer = () => {
    if (!workingPaths.length) return;
    const layer = {
      id: crypto.randomUUID(),
      name: `${mode} ${layers.length + 1}`,
      type: mode,
      color: colors[layers.length % colors.length],
      enabled: true,
      order: layers.length,
      paths: workingPaths,
    };
    setLayers((current) => [...current, layer]);
  };

  const updateLayer = (id, patch) => {
    setLayers((current) => current.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)));
  };

  const moveLayer = (id, direction) => {
    setLayers((current) => {
      const sorted = [...current].sort((a, b) => a.order - b.order);
      const index = sorted.findIndex((layer) => layer.id === id);
      const swapIndex = index + direction;
      if (swapIndex < 0 || swapIndex >= sorted.length) return current;
      [sorted[index], sorted[swapIndex]] = [sorted[swapIndex], sorted[index]];
      return sorted.map((layer, order) => ({ ...layer, order }));
    });
  };

  const updateTextItem = (id, patch) => {
    setTextItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const updateTextObject = (id, nextObject) => {
    setTextItems((current) => current.map((item) => (item.id === id ? { ...item, object: nextObject } : item)));
  };

  const addTextItem = () => {
    const id = crypto.randomUUID();
    const next = createTextItem(id, textItems.length);
    setTextItems((current) => [...current, next]);
    setSelectedTextId(id);
  };

  const removeSelectedText = () => {
    if (textItems.length <= 1) return;
    setTextItems((current) => {
      const next = current.filter((item) => item.id !== selectedTextId);
      setSelectedTextId(next[0].id);
      return next;
    });
  };

  const traceImage = (url, threshold = traceThreshold, spacing = traceSpacing, modeName = traceMode, detail = traceDetail, invert = traceInvert) => {
    const image = new Image();
    image.onload = () => {
      const sampleWidth = detail;
      const sampleHeight = Math.max(1, Math.round((image.height / image.width) * sampleWidth));
      const canvas = document.createElement('canvas');
      canvas.width = sampleWidth;
      canvas.height = sampleHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, sampleWidth, sampleHeight);
      context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
      const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
      const darkAt = (x, y) => {
        const i = (Math.max(0, Math.min(sampleHeight - 1, y)) * sampleWidth + Math.max(0, Math.min(sampleWidth - 1, x))) * 4;
        const luminance = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
        const dark = invert ? luminance > threshold : luminance < threshold;
        return dark && pixels[i + 3] > 20;
      };
      const luminanceAt = (x, y) => {
        const i = (Math.max(0, Math.min(sampleHeight - 1, y)) * sampleWidth + Math.max(0, Math.min(sampleWidth - 1, x))) * 4;
        const luminance = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
        return invert ? 255 - luminance : luminance;
      };
      const localPaths = [];
      const pixelSizeMm = Math.max(object.h / sampleHeight, 0.03);
      const step = Math.max(1, Math.round(spacing / pixelSizeMm));

      if (modeName === 'stipple') {
        for (let y = 0; y < sampleHeight; y += step) {
          for (let x = 0; x < sampleWidth; x += step) {
            if (darkAt(x, y)) localPaths.push([{ x: x / sampleWidth, y: y / sampleHeight }, { x: (x + 0.8) / sampleWidth, y: (y + 0.8) / sampleHeight }]);
          }
        }
      } else if (modeName === 'connected-outline') {
        const edgeLimit = Math.max(18, 255 - threshold);
        localPaths.push(...traceEdgePolylines(sampleWidth, sampleHeight, (x, y) => {
          const thresholdEdge = darkAt(x, y) && (!darkAt(x + 1, y) || !darkAt(x - 1, y) || !darkAt(x, y + 1) || !darkAt(x, y - 1));
          const gx = Math.abs(luminanceAt(x + 1, y) - luminanceAt(x - 1, y));
          const gy = Math.abs(luminanceAt(x, y + 1) - luminanceAt(x, y - 1));
          return thresholdEdge || gx + gy > edgeLimit;
        }));
      } else if (modeName === 'fine-outline') {
        const edgeLimit = Math.max(18, 255 - threshold);
        for (let y = 1; y < sampleHeight - 1; y += 1) {
          for (let x = 1; x < sampleWidth - 1; x += 1) {
            const gx = Math.abs(luminanceAt(x + 1, y) - luminanceAt(x - 1, y));
            const gy = Math.abs(luminanceAt(x, y + 1) - luminanceAt(x, y - 1));
            if (gx + gy > edgeLimit) localPaths.push([{ x: x / sampleWidth, y: y / sampleHeight }, { x: (x + 0.9) / sampleWidth, y: y / sampleHeight }]);
          }
        }
      } else if (modeName === 'outline') {
        for (let y = 1; y < sampleHeight - 1; y += 1) {
          for (let x = 1; x < sampleWidth - 1; x += 1) {
            const edge = darkAt(x, y) && (!darkAt(x + 1, y) || !darkAt(x - 1, y) || !darkAt(x, y + 1) || !darkAt(x, y - 1));
            if (edge) localPaths.push([{ x: x / sampleWidth, y: y / sampleHeight }, { x: (x + 0.9) / sampleWidth, y: y / sampleHeight }]);
          }
        }
      } else {
        const diagonal = modeName === 'sketch';
        for (let y = 0; y < sampleHeight; y += step) {
          let runStart = null;
          for (let x = 0; x < sampleWidth; x += 1) {
            const dark = darkAt(x, y);
            if (dark && runStart === null) runStart = x;
            if ((!dark || x === sampleWidth - 1) && runStart !== null) {
              const runEnd = dark ? x : x - 1;
              if (runEnd - runStart > 2) {
                localPaths.push([
                  { x: runStart / sampleWidth, y: y / sampleHeight },
                  { x: runEnd / sampleWidth, y: (y + (diagonal ? step : 0)) / sampleHeight },
                ]);
              }
              runStart = null;
            }
          }
        }
      }

      setImageLocalPaths(localPaths);
    };
    image.src = url;
  };

  const handleDocumentFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportBusy(true);
    try {
      if (file.size > 10_000_000) throw new Error(t('File is too large'));
      if (file.name.toLowerCase().endsWith('.docx')) {
        const { default: mammoth } = await import('mammoth/mammoth.browser');
        const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
        const doc = new DOMParser().parseFromString(result.value, 'text/html');
        const paragraphs = [...doc.querySelectorAll('p,li')].filter((node) => !node.closest('li') || node.tagName === 'LI').map((node) => node.tagName === 'LI' ? `- ${node.textContent.trim()}` : node.textContent.trim()).filter(Boolean);
        const text = paragraphs.join('\n');
        if (!text) throw new Error(t('No text found'));
        const item = { ...createTextItem(crypto.randomUUID()), text, object: { x: settings.originX + 15, y: settings.originY + 20, w: Math.min(175, settings.paperWidth - 30), h: Math.min(170, Math.max(12, paragraphs.length * 8)), angle: 0 } };
        setTextItems([item]); setSelectedTextId(item.id); setMode('text');
        setProjectMessage(t('Word text imported. Review layout before plotting.'));
      } else if (file.name.toLowerCase().endsWith('.txt')) {
        const item = { ...createTextItem(crypto.randomUUID()), text: await file.text(), object: { x: settings.originX + 15, y: 20, w: 170, h: 70, angle: 0 } };
        setTextItems([item]); setSelectedTextId(item.id); setMode('text');
      } else { handleAssetFile(event); }
    } catch (error) { setProjectMessage(error.message); }
    finally { setImportBusy(false); event.target.value = ''; }
  };

  const handleAssetFile = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
      file.text().then((text) => importSvg(text, file.name));
      return;
    }
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setImageName(file.name);
      setPhotoMode('image');
      setMode('photos');
      const image = new Image();
      image.onload = () => {
        const width = Math.min(90, settings.paperWidth - 30);
        const height = Math.min(140, width * image.height / image.width);
        setObject({ x: settings.originX + 30, y: settings.originY + 70, w: height * image.width / image.height, h: height, angle: 0 });
        traceImage(url);
      };
      image.onerror = () => setProjectMessage(t('Cannot read image'));
      image.src = url;
    }
  };

  const importSvg = (source, name) => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tempSvg.setAttribute('width', '0');
    tempSvg.setAttribute('height', '0');
    tempSvg.style.position = 'absolute';
    tempSvg.style.opacity = '0';
    document.body.appendChild(tempSvg);

    const paths = [];
    doc.querySelectorAll('path,line,polyline,polygon,rect,circle,ellipse').forEach((node) => {
      const element = document.createElementNS('http://www.w3.org/2000/svg', node.tagName.toLowerCase());
      [...node.attributes].forEach((attr) => element.setAttribute(attr.name, attr.value));
      if (node.tagName.toLowerCase() === 'line') element.setAttribute('d', `M ${node.getAttribute('x1') || 0} ${node.getAttribute('y1') || 0} L ${node.getAttribute('x2') || 0} ${node.getAttribute('y2') || 0}`);
      tempSvg.appendChild(element);
      const sampled = sampleSvgGeometry(element);
      if (sampled.length) paths.push(sampled);
    });

    const fillPaths = fillHoles ? makeSvgFillPaths(doc, tempSvg) : [];
    document.body.removeChild(tempSvg);
    setSvgName(name);
    setImportedSvgPaths(normalizePathsToObjectLocal(paths));
    setSvgFillPaths(normalizePathsToObjectLocal(fillPaths));
    setPhotoMode('svg');
    setMode('photos');
  };

  const makeSvgFillPaths = (doc, tempSvg) => {
    const fillPaths = [];
    doc.querySelectorAll('path,rect,circle,ellipse,polygon').forEach((node) => {
      const element = document.createElementNS('http://www.w3.org/2000/svg', node.tagName.toLowerCase());
      [...node.attributes].forEach((attr) => element.setAttribute(attr.name, attr.value));
      tempSvg.appendChild(element);
      if (!element.getBBox || !element.isPointInFill) return;
      const box = element.getBBox();
      for (let y = box.y; y <= box.y + box.height; y += traceSpacing) {
        let runStart = null;
        for (let x = box.x; x <= box.x + box.width; x += 2) {
          const inside = element.isPointInFill(new DOMPoint(x, y));
          if (inside && runStart === null) runStart = x;
          if ((!inside || x >= box.x + box.width - 2) && runStart !== null) {
            const runEnd = inside ? x : x - 2;
            if (runEnd - runStart > 2) fillPaths.push([{ x: runStart, y }, { x: runEnd, y }]);
            runStart = null;
          }
        }
      }
    });
    return fillPaths;
  };

  const generateQr = async () => {
    const qr = QRCode.create(qrText || ' ', { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const moduleSize = 1 / size;
    const paths = [];
    const fillModule = (x, y) => {
      const fillLines = qrStyle === 'rounded'
        ? ['0.32,0.24 0.68,0.24', '0.22,0.38 0.78,0.38', '0.2,0.5 0.8,0.5', '0.22,0.62 0.78,0.62', '0.32,0.76 0.68,0.76']
        : ['0,0.18 1,0.18', '0,0.34 1,0.34', '0,0.5 1,0.5', '0,0.66 1,0.66', '0,0.82 1,0.82'];
      fillLines.forEach((line) => paths.push(parseStroke(line, x, y, moduleSize, moduleSize)));
    };
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (!qr.modules.get(row, col)) continue;
        const x = col * moduleSize;
        const y = row * moduleSize;
        if (qrStyle === 'dots') {
          paths.push(parseStroke('0.2,0.5 0.8,0.5', x, y, moduleSize, moduleSize));
        } else if (qrStyle === 'rounded') {
          paths.push(parseStroke('0.2,0.2 0.8,0.2 0.8,0.8 0.2,0.8 0.2,0.2', x, y, moduleSize, moduleSize));
          if (qrFilled) fillModule(x, y);
        } else {
          paths.push(parseStroke('0,0 1,0 1,1 0,1 0,0', x, y, moduleSize, moduleSize));
          if (qrFilled) fillModule(x, y);
        }
      }
    }
    setQrPaths(paths);
  };

  const svgPointFromEvent = (event) => {
    const svg = document.getElementById('build-plate-svg');
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const mapped = point.matrixTransform(matrix.inverse());
    return { x: mapped.x, y: mapped.y };
  };

  const accurateSvgPoint = (event) => {
    const svg = document.getElementById('build-plate-svg');
    const ctm = svg.getScreenCTM();
    if (!ctm) return svgPointFromEvent(event);
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const svgP = pt.matrixTransform(ctm.inverse());
    return { x: svgP.x, y: svgP.y };
  };

  const handleTapToMove = async (point) => {
    if (operationLock.current || printerStatus.streaming) return;
    const bounds = getReachableBounds(settings);
    const clamped = {
      x: Math.max(bounds.minX, Math.min(bounds.maxX, point.x)),
      y: Math.max(bounds.minY, Math.min(bounds.maxY, point.y)),
    };
    const nozzle = penToNozzlePoint(clamped, settings);
    setTapToMoveMarker(clamped);
    if (tapToMoveMarkerTimeout.current) clearTimeout(tapToMoveMarkerTimeout.current);
    tapToMoveMarkerTimeout.current = setTimeout(() => setTapToMoveMarker(null), 1500);
    await callPrinterApi('/api/printer/move-absolute', {
      x: nozzle.x, y: nozzle.y, z: settings.penUpZ,
      feedrate: settings.travelSpeed, confirmed: zConfirmed,
    });
  };

  const handlePointerDown = (event) => {
    const point = svgPointFromEvent(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tapToMoveActive && printerStatus.connected) {
      const svg = document.getElementById('build-plate-svg');
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const pt = svg.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        const svgP = pt.matrixTransform(ctm.inverse());
        handleTapToMove({ x: svgP.x, y: svgP.y });
      }
      return;
    }
    if (mode === 'draw') {
      const pt = accurateSvgPoint(event);
      activeDrawPath.current = [pt];
      setDrawPaths((paths) => {
        activeDrawIndex.current = paths.length;
        return [...paths, [pt]];
      });
      return;
    }
    if (event.target.dataset.handle?.startsWith('paper-resize-')) {
      if (!presetMenuOpen) return;
      dragMode.current = event.target.dataset.handle;
      dragStart.current = { x: point.x, y: point.y, settings };
      return;
    }
    const shapeId = event.target.dataset.shapeId;
    if (shapeId && mode === 'shapes' && activeTool === 'none') {
      setSelectedShapeId(shapeId);
      const shape = shapes.find((s) => s.id === shapeId);
      if (!shape) return;
      if (event.target.dataset.handle === 'shape-rotate') dragMode.current = 'shape-rotate';
      else if (event.target.dataset.handle?.startsWith('shape-scale-')) dragMode.current = event.target.dataset.handle;
      else dragMode.current = 'shape-move';
      dragStart.current = { x: point.x, y: point.y, shape: { ...shape } };
      return;
    }
    if (mode === 'shapes' && activeTool !== 'none') {
      const pt = accurateSvgPoint(event);
      shapeDragStart.current = { x: pt.x, y: pt.y };
      dragMode.current = 'shape-create';
      return;
    }
    if (event.target.dataset.paper === 'true') {
      if (!presetMenuOpen) return;
      dragMode.current = 'paper';
      dragStart.current = {
        x: point.x,
        y: point.y,
        object,
        settings,
        textItems,
        textId: null,
      };
      return;
    }
    const textId = event.target.dataset.textId;
    const textObject = textItems.find((item) => item.id === textId)?.object || selectedText?.object || defaultObject;
    if (mode === 'text' && textId) setSelectedTextId(textId);
    if (event.target.dataset.handle?.startsWith('resize')) dragMode.current = event.target.dataset.handle;
    else if (event.target.dataset.handle === 'rotate') dragMode.current = 'rotate';
    else if (textId || event.target.dataset.asset === 'true') dragMode.current = 'move';
    else return;
    dragStart.current = {
      x: point.x,
      y: point.y,
      object: mode === 'text' ? textObject : object,
      textId: mode === 'text' ? (textId || selectedText?.id) : null,
    };
  };

  const handlePointerMove = (event) => {
    if (tapToMoveActive) return;
    const point = svgPointFromEvent(event);
    if (mode === 'draw' && activeDrawPath.current) {
      const pt = accurateSvgPoint(event);
      const path = activeDrawPath.current;
      const previous = path[path.length - 1];
      if (!previous || distance(previous, pt) < DRAW_MIN_DISTANCE_MM || path.length >= DRAW_MAX_POINTS_PER_STROKE) return;
      path.push(pt);
      if (drawFrame.current) return;
      drawFrame.current = requestAnimationFrame(() => {
        drawFrame.current = null;
        setDrawPaths((paths) => {
          const next = [...paths];
          const index = activeDrawIndex.current;
          if (index !== null && next[index]) next[index] = [...activeDrawPath.current];
          return next;
        });
      });
      return;
    }
    if (dragMode.current === 'shape-create') {
      const pt = accurateSvgPoint(event);
      setTempShape(computeDragShape(activeTool, shapeDragStart.current, pt));
      return;
    }
    if (!dragMode.current) return;
    const start = dragStart.current;
    if (dragMode.current === 'paper') {
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      const nextSettings = clampPaperToReachableArea({
        ...start.settings,
        originX: start.settings.originX + dx,
        originY: start.settings.originY + dy,
      });
      const { originX, originY } = nextSettings;
      const clampedDx = originX - start.settings.originX;
      const clampedDy = originY - start.settings.originY;
      setSettings((current) => ({ ...current, originX, originY }));
      setObject({ ...start.object, x: start.object.x + clampedDx, y: start.object.y + clampedDy });
      setTextItems(start.textItems.map((item) => ({
        ...item,
        object: { ...item.object, x: item.object.x + clampedDx, y: item.object.y + clampedDy },
      })));
      return;
    }
    if (dragMode.current?.startsWith('paper-resize-')) {
      const p = accurateSvgPoint(event);
      const s = start.settings;
      const corner = dragMode.current;
      let ox = s.originX;
      let oy = s.originY;
      let pw = s.paperWidth;
      let ph = s.paperHeight;
      const right = s.originX + s.paperWidth;
      const bottom = s.originY + s.paperHeight;

      if (corner === 'paper-resize-br') {
        pw = Math.max(10, p.x - ox);
        ph = Math.max(10, p.y - oy);
      } else if (corner === 'paper-resize-bl') {
        pw = Math.max(10, right - p.x);
        ox = right - pw;
        ph = Math.max(10, p.y - oy);
      } else if (corner === 'paper-resize-tr') {
        ph = Math.max(10, bottom - p.y);
        oy = bottom - ph;
        pw = Math.max(10, p.x - ox);
      } else if (corner === 'paper-resize-tl') {
        pw = Math.max(10, right - p.x);
        ph = Math.max(10, bottom - p.y);
        ox = right - pw;
        oy = bottom - ph;
      }

      const next = clampPaperToReachableArea({ ...s, originX: ox, originY: oy, paperWidth: pw, paperHeight: ph });
      setSettings((current) => ({
        ...current,
        originX: next.originX,
        originY: next.originY,
        paperWidth: next.paperWidth,
        paperHeight: next.paperHeight,
      }));
      return;
    }
    if (dragMode.current === 'shape-move') {
      const pt = accurateSvgPoint(event);
      setShapes((current) => current.map((s) => s.id === start.shape.id ? { ...s, x: start.shape.x + pt.x - start.x, y: start.shape.y + pt.y - start.y } : s));
      return;
    }
    if (dragMode.current?.startsWith('shape-scale-')) {
      const pt = accurateSvgPoint(event);
      const shape = start.shape;
      const bb = shapeBoundingBox(start.shape);
      const corner = dragMode.current;

      if (shape.type === 'circle' || shape.type === 'hexagon') {
        const d = Math.hypot(pt.x - shape.x, pt.y - shape.y);
        setShapes((c) => c.map((s) => s.id === shape.id ? { ...s, radius: Math.max(3, d) } : s));
      } else if (shape.type === 'rect') {
        let nw, nh, nx, ny;
        if (corner === 'shape-scale-br') {
          nw = Math.max(5, pt.x - bb.x); nh = Math.max(5, pt.y - bb.y);
          nx = bb.x + nw / 2; ny = bb.y + nh / 2;
        } else if (corner === 'shape-scale-tl') {
          nw = Math.max(5, (bb.x + bb.w) - pt.x); nh = Math.max(5, (bb.y + bb.h) - pt.y);
          nx = pt.x + nw / 2; ny = pt.y + nh / 2;
        } else if (corner === 'shape-scale-tr') {
          nw = Math.max(5, pt.x - bb.x); nh = Math.max(5, (bb.y + bb.h) - pt.y);
          nx = bb.x + nw / 2; ny = pt.y + nh / 2;
        } else {
          nw = Math.max(5, (bb.x + bb.w) - pt.x); nh = Math.max(5, pt.y - bb.y);
          nx = pt.x + nw / 2; ny = bb.y + nh / 2;
        }
        setShapes((c) => c.map((s) => s.id === shape.id ? { ...s, x: nx, y: ny, width: nw, height: nh } : s));
      } else if (shape.type === 'star') {
        const d = Math.hypot(pt.x - shape.x, pt.y - shape.y);
        const ratio = (shape.innerRadius || 7) / (shape.outerRadius || 15);
        setShapes((c) => c.map((s) => s.id === shape.id ? { ...s, outerRadius: Math.max(5, d), innerRadius: Math.max(2, d * ratio) } : s));
      } else if (shape.type === 'line') {
        const a = Math.atan2(pt.y - shape.y, pt.x - shape.x) * (180 / Math.PI);
        const len = Math.hypot(pt.x - shape.x, pt.y - shape.y) * 2;
        setShapes((c) => c.map((s) => s.id === shape.id ? { ...s, length: Math.max(5, len), rotation: Math.round(a) } : s));
      }
      return;
    }
    if (dragMode.current === 'shape-rotate') {
      const pt = accurateSvgPoint(event);
      const shape = start.shape;
      const angle = Math.atan2(pt.y - shape.y, pt.x - shape.x) * (180 / Math.PI) + 90;
      setShapes((current) => current.map((s) => s.id === shape.id ? { ...s, rotation: Math.round(angle) } : s));
      return;
    }
    const commitObject = (nextObject) => {
      if (mode === 'text' && start.textId) updateTextObject(start.textId, nextObject);
      else setObject(nextObject);
    };
    if (dragMode.current === 'move') commitObject({ ...start.object, x: Math.max(0, start.object.x + point.x - start.x), y: Math.max(0, start.object.y + point.y - start.y) });
    if (dragMode.current?.startsWith('resize')) {
      const local = rotatePoint(point.x, point.y, start.object.x + start.object.w / 2, start.object.y + start.object.h / 2, -start.object.angle);
      const corner = dragMode.current === 'resize' ? 'br' : dragMode.current.split('-')[1];
      commitObject(resizeObject(start.object, local, corner));
    }
    if (dragMode.current === 'rotate') {
      const cx = start.object.x + start.object.w / 2;
      const cy = start.object.y + start.object.h / 2;
      commitObject({ ...start.object, angle: Math.atan2(point.y - cy, point.x - cx) * (180 / Math.PI) });
    }
  };

  const handlePointerUp = (event) => {
    if (tapToMoveActive) return;
    if (dragMode.current === 'shape-create') {
      const start = shapeDragStart.current;
      const pt = event ? accurateSvgPoint(event) : start;
      const shape = computeDragShape(activeTool, start, pt);
      if (shape) {
        shape.id = crypto.randomUUID();
        setShapes((current) => [...current, shape]);
        setSelectedShapeId(shape.id);
      }
      setTempShape(null);
      setActiveTool('none');
      dragMode.current = null;
      shapeDragStart.current = null;
      return;
    }
    dragMode.current = null;
    if (drawFrame.current) {
      cancelAnimationFrame(drawFrame.current);
      drawFrame.current = null;
    }
    if (activeDrawPath.current && activeDrawIndex.current !== null) {
      const finalPath = [...activeDrawPath.current];
      const finalIndex = activeDrawIndex.current;
      setDrawPaths(paths => commitDrawPath(paths, finalIndex, finalPath));
    }
    activeDrawPath.current = null;
    activeDrawIndex.current = null;
  };

  const clearDrawing = () => {
    if (drawFrame.current) {
      cancelAnimationFrame(drawFrame.current);
      drawFrame.current = null;
    }
    activeDrawPath.current = null;
    activeDrawIndex.current = null;
    setDrawPaths([]);
  };

  const clearEverything = () => {
    if (drawFrame.current) {
      cancelAnimationFrame(drawFrame.current);
      drawFrame.current = null;
    }
    activeDrawPath.current = null;
    activeDrawIndex.current = null;
    setTextItems([{ ...createTextItem('text-1'), text: '' }]);
    setSelectedTextId('text-1');
    setPreviewUrl('');
    setImageName('');
    setImageLocalPaths([]);
    setSvgName('');
    setImportedSvgPaths([]);
    setSvgFillPaths([]);
    setQrPaths([]);
    setDrawPaths([]);
    setShapes([]);
    setSelectedShapeId(null);
    setTempShape(null);
    setActiveTool('none');
    setLayers([]);
    setObjectVisibility({ text: true, image: true, svg: true, qr: true, draw: true, generated: true, shapes: true });
    setPreparedJob(null);
    setPreflightMessage('');
  };

  const clearObjectGroup = (key) => {
    if (key === 'text') {
      const resetText = createTextItem('text-1');
      setTextItems([{ ...resetText, text: '' }]);
      setSelectedTextId('text-1');
    }
    if (key === 'image') {
      setPreviewUrl('');
      setImageName('');
      setImageLocalPaths([]);
    }
    if (key === 'svg') {
      setSvgName('');
      setImportedSvgPaths([]);
      setSvgFillPaths([]);
    }
    if (key === 'qr') setQrPaths([]);
    if (key === 'draw') setDrawPaths([]);
    if (key === 'shapes') { setShapes([]); setSelectedShapeId(null); setTempShape(null); setActiveTool('none'); }
    if (key === 'generated') setMode('text');
    setPreparedJob(null);
    setPreflightMessage('');
  };

  const saveProject = () => {
    downloadFile(JSON.stringify({ format: 'berets-plot', version: 1, settings, mode, textItems, shapes, layers, drawPaths, importedSvgPaths, svgFillPaths, imageLocalPaths, object, qrPaths, objectVisibility }, null, 2), 'project.berets.json', 'application/json');
  };
  const openProject = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error(t('Invalid project file'));
      const data = JSON.parse(await file.text());
      if (!validateProject(data)) throw new Error(t('Invalid project file'));
      const nextSettings = clampPaperToReachableArea(upgradePlotProfile(data.settings, defaultSettings));
      if (!PRESETS[nextSettings.preset] || ![nextSettings.bedWidth, nextSettings.bedHeight].every((n) => Number.isFinite(n) && n > 0 && n <= 1000)) throw new Error(t('Invalid project file'));
      const pathKeys = ['drawPaths', 'importedSvgPaths', 'svgFillPaths', 'imageLocalPaths', 'qrPaths'];
      for (const key of pathKeys) if (data[key] && (!Array.isArray(data[key]) || data[key].some((path) => !Array.isArray(path) || path.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))))) throw new Error(t('Invalid project file'));
      setSettings(nextSettings); setTextItems(data.textItems); setSelectedTextId(data.textItems[0]?.id || null);
      setShapes(data.shapes); setLayers(Array.isArray(data.layers) ? data.layers : []);
      setDrawPaths(data.drawPaths || []); setImportedSvgPaths(data.importedSvgPaths || []); setSvgFillPaths(data.svgFillPaths || []); setImageLocalPaths(data.imageLocalPaths || []); setQrPaths(data.qrPaths || []);
      if (data.object) setObject(data.object);
      if (data.objectVisibility) setObjectVisibility(data.objectVisibility);
      setMode(['text', 'photos', 'qr', 'patterns', 'draw', 'calibrate', 'shapes'].includes(data.mode) ? data.mode : 'text');
      setPreparedJob(null); setPreflightMessage(''); setProjectMessage(t('Project loaded'));
    } catch (error) { setProjectMessage(error.message); }
    event.target.value = '';
  };

  const exportSvg = () => {
    const paths = exportPaths.map((path) => `  <path d="${toPathData(path)}" fill="none" stroke="#111827" stroke-width="0.35"/>`).join('\n');
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${settings.bedWidth}mm" height="${settings.bedHeight}mm" viewBox="0 0 ${settings.bedWidth} ${settings.bedHeight}">\n  <rect x="${settings.originX}" y="${settings.originY}" width="${settings.paperWidth}" height="${settings.paperHeight}" fill="white" stroke="#94a3b8" stroke-width="0.5"/>\n${paths}\n</svg>`;
    downloadFile(svg, 'plotter-design.svg', 'image/svg+xml');
  };

  const exportTracedImageSvg = () => {
    const paths = imageLocalPaths
      .map((path) => path.map((point) => ({ x: point.x * object.w, y: point.y * object.h })))
      .map((path) => `  <path d="${toPathData(path)}" fill="none" stroke="#111827" stroke-width="0.35"/>`)
      .join('\n');
    const filename = imageName ? `${imageName.replace(/\.[^.]+$/, '')}-traced.svg` : 'traced-image.svg';
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${object.w}mm" height="${object.h}mm" viewBox="0 0 ${object.w} ${object.h}">\n${paths}\n</svg>`;
    downloadFile(svg, filename, 'image/svg+xml');
  };

  const exportGCode = () => {
    try { downloadFile(buildPlotGCode(), 'berets-plot.gcode', 'text/plain'); } catch (error) { setPreflightMessage(error.message); }
  };

  const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const addLineNumbers = (gcode) => {
    let lineNumber = 10;
    return gcode.split('\n').map((line) => {
      if (!cleanGCodeLine(line)) return line;
      const numbered = `N${lineNumber} ${line}`;
      lineNumber += 10;
      return numbered;
    }).join('\n');
  };

  const buildPlotGCode = ({ paths = exportPaths, jobSettings = settings } = {}) => paths.length ? compilePlot(paths, jobSettings).gcode : '';

  const callPrinterApi = async (path, body = null) => {
    try {
      const response = await printerFetch(`${PRINTER_API}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(response.status === 413
          ? (language === 'ru' ? 'Задание превышает допустимый размер отправки.' : 'The job exceeds the upload size limit.')
          : (language === 'ru' ? `Сервер вернул неожиданный ответ (HTTP ${response.status}). Обнови страницу.` : `Unexpected server response (HTTP ${response.status}). Refresh the page.`));
      }
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || data.validation?.errors?.join(' ') || 'Printer API request failed.');
      if (body) setPrinterError('');
      setPrinterMessage(data.message || (data.filename ? `Started ${data.filename} by file mode.` : (data.sentLineCount ? `${t('Commands sent')} · ${data.sentLineCount}` : t('Printer command accepted.'))));
      return data;
    } catch (error) {
      const message = language === 'ru' ? error.message.replace('Printer command timeout.', 'Принтер не ответил. Проверь сеть и подключись заново.').replace('Printer is not connected.', 'Принтер не подключён. Нажми «Подключить».') : error.message;
      setPrinterError(message);
      setPrinterMessage(message);
      return null;
    }
  };

  const updatePrinterConfig = (patch) => {
    setPrinterConfig((current) => {
      const next = { ...current, ...patch };
      localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const forgetPrinterConfig = () => {
    localStorage.removeItem(PRINTER_STORAGE_KEY);
    setPrinterConfig({ host: '', serial: '', accessCode: '' });
    setPrinterMessage('Saved printer details cleared.');
  };

  const refreshPrinterStatus = async () => {
    const data = await callPrinterApi('/api/printer/status');
    if (data) {
      setPrinterStatus(data);
      if (!data.connected) setCalibrationStep('idle');
      setPrinterMessage(data.connected ? t('Connected') : (data.lastError || t('Not connected')));
      if (data.connected) { setPrinterDetailsOpen(false); if (!printerStatus.connected) setPrinterError(''); }
    }
  };

  const connectPrinter = async () => {
    const data = await callPrinterApi('/api/printer/connect', printerConfig);
    if (data) setTimeout(refreshPrinterStatus, 900);
  };

  const discoverPrinters = async ({ quiet = false } = {}) => {
    if (!printerConfig.accessCode && !quiet) {
      setPrinterMessage('Enter your LAN access code first, then discover printers.');
      return null;
    }
    setDiscoveryBusy(true);
    if (!quiet) setPrinterMessage('Searching for Bambu printers on your network...');
    const data = await callPrinterApi('/api/printer/discover', {
      serial: printerConfig.serial,
      accessCode: printerConfig.accessCode,
      autoConnect: true,
    });
    setDiscoveryBusy(false);
    const discovered = data?.connectedPrinter || data?.selectedPrinter;
    if (discovered) {
      updatePrinterConfig({
        host: discovered.host,
        serial: discovered.serial || printerConfig.serial,
      });
    }
    if (data?.connectedPrinter) {
      setTimeout(refreshPrinterStatus, 900);
    }
    return data;
  };

  const disconnectPrinter = async () => {
    const data = await callPrinterApi('/api/printer/disconnect', {});
    if (data) {
      setCalibrationStep('idle');
      setPrinterStatus({ connected: false, lastReport: null });
      setPrinterDetailsOpen(true);
    }
  };

  const jogPrinter = (move) => {
    callPrinterApi('/api/printer/jog', { ...move, feedrate: move.z ? 300 : settings.travelSpeed, confirmed: zConfirmed });
  };

  const toggleToolheadFan = async () => {
    const nextFanState = !toolheadFanOn;
    const data = await callPrinterApi('/api/printer/toolhead-fan', { on: nextFanState });
    if (data) setToolheadFanOn(nextFanState);
  };

  const sendPlotToPrinter = async () => {
    if (operationLock.current || !printerStatus.connected) return;
    setPrinterError('');
    const job = slicePlot();
    if (!job) return;
    operationLock.current = true;
    setPlotBusy(true);
    try {
      const result = await callPrinterApi('/api/printer/send-gcode', {
        gcode: job.gcode, confirmed: true, allowNegativeZ: false,
        allowHome: true, method: 'file', startDelayMs: 0,
      });
      if (result) setPrinterMessage(result.cancelled ? (language === 'ru' ? 'Загрузка отменена. Запуск не отправлен.' : 'Upload cancelled. Start was not sent.') : (result.started ? (language === 'ru' ? 'Задание запущено на принтере.' : 'Printer started the job.') : (language === 'ru' ? 'Файл на карте, но начало рисования не подтверждено. Проверь экран принтера. Повторно не отправляй.' : 'File uploaded, but start is unconfirmed. Check the printer screen before sending again.')));
    } finally { setPlotBusy(false); operationLock.current = false; }
  };

  const slicePlot = () => {
    const paths = exportPaths.map((path) => path.map((point) => ({ x: point.x, y: point.y })));
    const jobSettings = { ...settings };
    let gcode;
    try { gcode = buildPlotGCode({
      homeBeforePlot: homeBeforeDirectSend,
      paths,
      jobSettings,
      useLineNumbers: false,
      useBambuSafetyHeader: bambuSafetyHeader,
    }); } catch (error) { setPreflightMessage(error.message); return null; }
    const validation = validateGCodeLocally(gcode, {
      allowNegativeZ: zConfirmed,
      allowHome: true,
    });
    const geometryErrors = plotGeometryErrors(paths, jobSettings);
    if (geometryErrors.length) { validation.ok = false; validation.errors.push(...geometryErrors); }
    const textSummary = mode === 'text' ? `Text: ${textItems.map((item) => normalizeTextForGlyphs(item.text)).join(' | ')}. ` : '';
    const nextJob = {
      gcode,
      validation,
      pathCount: paths.length,
      createdAt: new Date().toLocaleTimeString(),
      signature: sliceSignature,
      summary: `${validation.lineCount} ${t('G-code lines')} · ${paths.length} ${t('strokes')}. ${validation.ok ? t('Ready to send') : validation.errors.at(-1)}`,
    };
    setPreparedJob(nextJob);
    setPreflightMessage(nextJob.summary);
    return validation.ok ? nextJob : null;
  };

  const preflightPlot = () => {
    slicePlot();
  };

  const refreshMqttLog = useCallback(async ({ reset = false } = {}) => {
    const since = reset ? 0 : mqttLastId.current;
    const data = await callPrinterApi(`/api/printer/mqtt-log?since=${since}`);
    mqttLastId.current = data.lastId || mqttLastId.current;
    if (reset) setMqttLogEntries(data.entries || []);
    else if (data.entries?.length) setMqttLogEntries((current) => [...current, ...data.entries].slice(-250));
  }, []);

  const clearMqttLog = async () => {
    const data = await callPrinterApi('/api/printer/mqtt-log/clear', {});
    mqttLastId.current = data.lastId || 0;
    setMqttLogEntries([]);
  };

  const checkForUpdates = async () => {
    setUpdateBusy(true);
    setUpdateStatus((current) => ({ ...current, message: 'Checking GitHub...' }));
    try {
      const response = await printerFetch(`${PRINTER_API}/api/app/check-update`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Update check failed.');
      setUpdateStatus({
        latestVersion: data.latestVersion,
        updateAvailable: data.updateAvailable,
        message: data.updateAvailable
          ? `Update available: v${data.latestVersion}`
          : `You are up to date at v${data.currentVersion}.`,
      });
    } catch (error) {
      setUpdateStatus({ latestVersion: '', updateAvailable: false, message: error.message });
    } finally {
      setUpdateBusy(false);
    }
  };

  const updateApp = async () => {
    setUpdateBusy(true);
    setUpdateStatus((current) => ({ ...current, message: 'Installing update...' }));
    try {
      const response = await printerFetch(`${PRINTER_API}/api/app/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Update failed.');
      setUpdateStatus({
        latestVersion: data.latestVersion,
        updateAvailable: false,
        message: data.message || 'Updated. Restarting BERETS Plot...',
      });
    } catch (error) {
      setUpdateStatus((current) => ({ ...current, message: error.message }));
      setUpdateBusy(false);
    }
  };

  useEffect(() => {
    if (!backendEnabled || !mqttViewerOpen) return undefined;
    refreshMqttLog({ reset: true });
    const interval = window.setInterval(() => refreshMqttLog(), 1000);
    return () => window.clearInterval(interval);
  }, [backendEnabled, mqttViewerOpen, refreshMqttLog]);

  useEffect(() => {
    if (!backendEnabled || autoDiscoveryTried.current || printerStatus.connected) return;
    if (!printerConfig.serial || !printerConfig.accessCode) return;
    autoDiscoveryTried.current = true;
    let cancelled = false;
    const run = async () => {
      setDiscoveryBusy(true);
      try {
        const statusResponse = await printerFetch(`${PRINTER_API}/api/printer/status`);
        const status = await statusResponse.json();
        if (cancelled) return;
        if (status.connected) {
          setPrinterStatus(status);
          setPrinterDetailsOpen(false);
          return;
        }
        if (printerConfig.host) {
          await callPrinterApi('/api/printer/connect', printerConfig);
          return;
        }
        const response = await printerFetch(`${PRINTER_API}/api/printer/discover`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serial: printerConfig.serial, accessCode: printerConfig.accessCode, autoConnect: true }),
        });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok || !data.ok) throw new Error(data.error || 'Printer discovery failed.');
        if (body) setPrinterError('');
      setPrinterMessage(data.message || 'Printer discovery finished.');
        const discovered = data.connectedPrinter || data.selectedPrinter;
        if (discovered) {
          updatePrinterConfig({
            host: discovered.host,
            serial: discovered.serial || printerConfig.serial,
          });
        }
        if (data.connectedPrinter) {
          setTimeout(async () => {
            const statusResponse = await printerFetch(`${PRINTER_API}/api/printer/status`);
            const statusData = await statusResponse.json();
            if (statusData.ok) {
              setPrinterStatus(statusData);
              setPrinterMessage(statusData.connected ? 'Printer connected.' : (statusData.lastError || 'Printer not connected.'));
              if (statusData.connected) setPrinterDetailsOpen(false);
            }
          }, 900);
        }
      } catch (error) {
        if (!cancelled) setPrinterMessage(error.message);
      } finally {
        if (!cancelled) setDiscoveryBusy(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [backendEnabled, printerConfig.accessCode, printerConfig.serial, printerStatus.connected]);

  useEffect(() => {
    setSettings((current) => {
      const clamped = clampPaperToReachableArea(current);
      if (
        clamped.originX === current.originX
        && clamped.originY === current.originY
        && clamped.paperWidth === current.paperWidth
        && clamped.paperHeight === current.paperHeight
      ) return current;
      return clamped;
    });
  }, [settings.bedHeight, settings.bedWidth, settings.originX, settings.originY, settings.paperHeight, settings.paperWidth, settings.penTipOffsetX, settings.penTipOffsetY]);

  useEffect(() => {
    if (!mqttViewerOpen || !mqttLogRef.current) return;
    mqttLogRef.current.scrollTop = mqttLogRef.current.scrollHeight;
  }, [mqttLogEntries, mqttViewerOpen]);

  useEffect(() => {
    if (!playbackPlaying) return undefined;
    const interval = window.setInterval(() => {
      setPlaybackProgress((current) => {
        const next = current + 0.01;
        if (next >= 1) {
          setPlaybackPlaying(false);
          return 1;
        }
        return next;
      });
    }, 45);
    return () => window.clearInterval(interval);
  }, [playbackPlaying]);

  useEffect(() => {
    if (!printerStatus.connected) setTapToMoveActive(false);
  }, [printerStatus.connected]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-cluster">
          <div className="brand-menu">
            <button className="brand-button" onClick={() => setBrandMenuOpen((open) => !open)}>
              <span className="brand-mark" aria-hidden="true" /><span className="brand-name">BERETS <small>PLOT</small></span>
            </button>
            {brandMenuOpen && (
              <div className="brand-popover">
                <div>
                  <h2>BERETS Plot</h2>
                  <p>Version {packageInfo.version}</p>
                </div>
                <p>{t('Based on Plotter Studio by Shahid Mahmood. MIT license.')}</p>
                <p>{t('Local workspace · experimental hardware support')}</p>
              </div>
            )}
          </div>
          <div className="preset-menu">
            <button onClick={() => setPresetMenuOpen((open) => !open)}>{PRESETS[settings.preset].label}</button>
            {presetMenuOpen && (
              <div className="preset-popover">
                <label><span>{t("Printer")}</span><select value={settings.preset} onChange={(event) => handlePresetChange(event.target.value)}>{Object.entries(PRESETS).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}</select></label>
                <div className="settings-grid compact">
                  <NumberInput label={t("Bed W")} value={formatBedSize(settings.bedWidth)} onChange={(value) => handleSettingChange('bedWidth', value)} />
                  <NumberInput label={t("Bed H")} value={formatBedSize(settings.bedHeight)} onChange={(value) => handleSettingChange('bedHeight', value)} />
                  <NumberInput label={t("Paper W")} value={formatMM(settings.paperWidth)} onChange={(value) => handleSettingChange('paperWidth', value)} />
                  <NumberInput label={t("Paper H")} value={formatMM(settings.paperHeight)} onChange={(value) => handleSettingChange('paperHeight', value)} />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="topbar-actions">
          <select className="language-select" aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="ru">RU</option><option value="en">EN</option></select>
          <button className="theme-button" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} aria-label={t('Switch theme')}>{theme === 'dark' ? '◐' : '◑'}</button>
          <button className="icon-button" onClick={() => setAdvancedOpen((open) => !open)} title={t("Advanced")}>⚙</button>
          {advancedOpen && <button onClick={() => setMqttViewerOpen(true)}>MQTT</button>}
          <label className="project-open">{t('Open project')}<input type="file" accept=".json" onChange={openProject} /></label>
          <button onClick={saveProject}>{t('Save project')}</button>
          <button onClick={addWorkingLayer} disabled={!workingPaths.length}>{t("Add Layer")}</button>
          <div className="export-menu">
            <button className="primary-action" onClick={() => setExportMenuOpen((open) => !open)}>{t("Export")}</button>
            {exportMenuOpen && (
              <div className="export-popover">
                <button onClick={() => { exportSvg(); setExportMenuOpen(false); }} disabled={!exportPaths.length}>{t("SVG")}</button>
                <button onClick={() => { exportGCode(); setExportMenuOpen(false); }} disabled={!exportPaths.length}>G-code</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {mqttViewerOpen && (
        <div className="mqtt-overlay" role="dialog" aria-modal="true" aria-label="MQTT command log">
          <section className="mqtt-panel">
            <div className="mqtt-header">
              <div>
                <h2>MQTT Commands</h2>
                <p>{mqttLogEntries.length} recent entries</p>
              </div>
              <div className="mqtt-actions">
                <button onClick={() => refreshMqttLog({ reset: true })}>{t("Refresh")}</button>
                <button onClick={clearMqttLog}>{t("Clear")}</button>
                <button onClick={() => setMqttViewerOpen(false)}>{t("Close")}</button>
              </div>
            </div>
            <div className="mqtt-log" ref={mqttLogRef}>
              {mqttLogEntries.length === 0 && <p className="muted">No MQTT traffic captured yet.</p>}
              {mqttLogEntries.map((entry) => {
                const summary = getMqttEntrySummary(entry);
                return (
                  <article key={entry.id} className={`mqtt-entry ${entry.direction}`}>
                    <div className="mqtt-entry-row">
                      <span className="mqtt-badge">{entry.direction === 'out' ? 'OUT' : 'IN'}</span>
                      <span className="mqtt-time">{new Date(entry.time).toLocaleTimeString()}</span>
                      <div className="mqtt-summary">
                        <strong>{summary.title}</strong>
                        <span>{summary.detail}</span>
                      </div>
                      {summary.sequence && <span className="mqtt-sequence">#{summary.sequence}</span>}
                    </div>
                    <details>
                      <summary>Raw JSON</summary>
                      <div className="mqtt-topic">{entry.topic}</div>
                      <pre>{prettyMqttPayload(entry.payload)}</pre>
                    </details>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {playbackOpen && (
        <div className="mqtt-overlay" role="dialog" aria-modal="true" aria-label="Plot playback preview">
          <section className="playback-panel">
            <div className="mqtt-header">
              <div>
                <h2>{t("Plot Playback")}</h2>
                <p>{Math.round(playbackProgress * 100)}% · {playbackSourcePaths.length} {t('strokes')} · {Math.round(estimateDistance(playbackSourcePaths))} mm</p>
              </div>
              <div className="mqtt-actions">
                <button onClick={() => setPlaybackPlaying((playing) => !playing)}>{t(playbackPlaying ? 'Pause' : 'Play')}</button>
                <button onClick={() => { setPlaybackPlaying(false); setPlaybackProgress(0); }}>{t("Restart")}</button>
                <button onClick={() => { setPlaybackPlaying(false); setPlaybackOpen(false); }}>{t("Close")}</button>
              </div>
            </div>
            <div className="playback-body">
              <svg viewBox={`0 0 ${settings.bedWidth} ${settings.bedHeight}`} className="playback-svg">
                <rect width={settings.bedWidth} height={settings.bedHeight} fill={theme === 'dark' ? '#171b20' : '#e5e9ee'} />
                <rect x={settings.originX} y={settings.originY} width={settings.paperWidth} height={settings.paperHeight} fill="#fbfbf7" stroke="#14b8a6" strokeWidth="0.8" strokeDasharray="3 2" />
                {compiledPreview.segments.map((segment, index) => <line key={`ghost-${index}`} x1={displayMotionPoint(segment.from, segment.draw).x} y1={displayMotionPoint(segment.from, segment.draw).y} x2={displayMotionPoint(segment.to, segment.draw).x} y2={displayMotionPoint(segment.to, segment.draw).y} stroke={segment.draw ? '#64748b' : '#cd7246'} strokeWidth="0.35" strokeDasharray={segment.draw ? undefined : '2 2'} opacity="0.35" />)}
                {[...simulated.completed, ...(simulated.current ? [simulated.current] : [])].map((segment, index) => <line key={`played-${index}`} x1={displayMotionPoint(segment.from, segment.draw).x} y1={displayMotionPoint(segment.from, segment.draw).y} x2={displayMotionPoint(segment.to, segment.draw).x} y2={displayMotionPoint(segment.to, segment.draw).y} stroke={segment.draw ? '#008b70' : '#e28b45'} strokeWidth={segment.draw ? '0.8' : '0.4'} strokeDasharray={segment.draw ? undefined : '2 2'} />)}
                {simulated.position && <circle cx={displayMotionPoint(simulated.position, false).x} cy={displayMotionPoint(simulated.position, false).y} r="2.5" fill={simulated.draw ? '#008b70' : '#e28b45'} stroke="white" strokeWidth="0.6" />}

              </svg>
              <p className="simulation-readout">{t('Nozzle')} · X {simulated.position?.x.toFixed(1) || '0'} · Y {simulated.position?.y.toFixed(1) || '0'} · Z {simulated.position?.z.toFixed(1) || settings.penUpZ} mm · {simulated.draw ? t('Drawing') : t('Travel')}</p>
              <input aria-label={t('Playback position')} type="range" min="0" max="100" value={Math.round(playbackProgress * 100)} onChange={(event) => { setPlaybackPlaying(false); setPlaybackProgress(Number(event.target.value) / 100); }} />
            </div>
          </section>
        </div>
      )}

      {projectMessage && <div className="project-message" role="status">{projectMessage}<button onClick={() => setProjectMessage('')}>×</button></div>}
      <section className={`workspace ${canvasFocus ? 'canvas-focus' : ''}`}>
        <aside className="panel controls-panel">
          <div className="mode-tabs">
            {['text', 'photos', 'qr', 'patterns', 'draw', 'calibrate', 'shapes'].map((item) => (
              <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{t(item)}</button>
            ))}
          </div>

          {mode === 'text' && (
            <div className="control-group">
              <h2>{t("Document")}</h2>
              <div className="text-list">
                {textItems.map((item, index) => (
                  <button key={item.id} className={item.id === selectedText?.id ? 'active' : ''} onClick={() => setSelectedTextId(item.id)}>
                    {item.text || `Text ${index + 1}`}
                  </button>
                ))}
              </div>
              <div className="button-row">
                <button onClick={addTextItem}>{t("Add Text")}</button>
                <button onClick={removeSelectedText} disabled={textItems.length <= 1}>{t("Remove")}</button>
              </div>
              <label className="text-editor-label"><span>{t('Text')}</span><textarea rows="7" value={selectedText?.text || ''} placeholder={t('Write your text…')} onChange={(event) => updateTextItem(selectedText.id, { text: event.target.value })} /></label>
              <div className="format-bar" aria-label={t('Text formatting')}>
                <button title={t('Bold')} className={selectedText?.bold || selectedText?.fontKey === 'duplex' ? 'active' : ''} onClick={() => updateTextItem(selectedText.id, {fontSizePt:selectedText.fontSizePt || 12, bold:!selectedText.bold, ...(selectedText.fontKey==='duplex'?{fontKey:'simplex',bold:false}:{})})}><b>B</b></button>
                {['italic','underline','strike'].map((key,index) => <button key={key} title={language === 'ru' ? ['Курсив','Подчёркивание','Зачёркивание'][index] : ['Italic','Underline','Strikethrough'][index]} className={selectedText?.[key] ? 'active' : ''} onClick={() => updateTextItem(selectedText.id, {fontSizePt:selectedText.fontSizePt || 12,[key]:!selectedText[key]})}>{['𝘐','U̲','S̶'][index]}</button>)}
                <button className={!selectedText?.listStyle ? 'active' : ''} onClick={() => updateTextItem(selectedText.id, { listStyle: null })} title={t('Paragraph')}>¶</button>
                <button className={selectedText?.listStyle === 'bullets' ? 'active' : ''} onClick={() => updateTextItem(selectedText.id, { listStyle: 'bullets' })} title={t('Bulleted list')}>• ≡</button>
                <button className={selectedText?.listStyle === 'numbered' ? 'active' : ''} onClick={() => updateTextItem(selectedText.id, { listStyle: 'numbered' })} title={t('Numbered list')}>1. ≡</button>
              </div>
              <label><span>{t('Font')}</span><select value={selectedText?.fontKey || DEFAULT_HERSHEY_FONT} onChange={(event) => updateTextItem(selectedText.id, { fontKey: event.target.value })}>{Object.entries(FONT_OPTIONS).map(([key, font]) => <option key={key} value={key}>{font.label}</option>)}</select></label>
              <div className="word-format-grid">
                <NumberInput label={language === 'ru' ? 'Размер · пт' : 'Size · pt'} value={selectedText?.fontSizePt || 12} step="1" onChange={value => updateTextItem(selectedText.id, {fontSizePt: Math.max(1, Math.min(200, value))})} />
                <label><span>{language === 'ru' ? 'Межстрочный' : 'Line spacing'}</span><select value={selectedText?.lineSpacing || 1} onChange={e => updateTextItem(selectedText.id, {fontSizePt:selectedText.fontSizePt || 12,lineSpacing:Number(e.target.value)})}>{[1,1.15,1.5,2,2.5,3].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label><span>{language === 'ru' ? 'Выравнивание' : 'Alignment'}</span><select value={selectedText?.align || 'left'} onChange={e => updateTextItem(selectedText.id, {fontSizePt:selectedText.fontSizePt || 12,align:e.target.value})}>{[['left','Слева','Left'],['center','По центру','Center'],['right','Справа','Right'],['justify','По ширине','Justify']].map(([value,ru,en]) => <option key={value} value={value}>{language === 'ru' ? ru : en}</option>)}</select></label>
                <NumberInput label={language === 'ru' ? 'Отступ слева · пт' : 'Left indent · pt'} value={selectedText?.indentPt || 0} onChange={value => updateTextItem(selectedText.id, {fontSizePt:selectedText.fontSizePt || 12,indentPt:Math.max(0,value)})} />
                <NumberInput label={language === 'ru' ? 'Перед абзацем · пт' : 'Before paragraph · pt'} value={selectedText?.paragraphBeforePt || 0} onChange={value => updateTextItem(selectedText.id, {fontSizePt:selectedText.fontSizePt || 12,paragraphBeforePt:Math.max(0,value)})} />
                <NumberInput label={language === 'ru' ? 'После абзаца · пт' : 'After paragraph · pt'} value={selectedText?.paragraphAfterPt || 0} onChange={value => updateTextItem(selectedText.id, {fontSizePt:selectedText.fontSizePt || 12,paragraphAfterPt:Math.max(0,value)})} />
                <NumberInput label={language === 'ru' ? 'Межбуквенный · пт' : 'Letter spacing · pt'} step="0.1" value={selectedText?.letterSpacingPt || 0} onChange={value => updateTextItem(selectedText.id, {fontSizePt:selectedText.fontSizePt || 12,letterSpacingPt:Math.max(0,value)})} />
              </div>
              <p className="editor-hint">{t('Move on the page. Drag corners to resize.')}</p>
              <label className="import-tile">{importBusy ? t('Importing…') : t('Import Word / image')}<small>DOCX · TXT · PNG · JPG · SVG</small><input type="file" accept=".docx,.txt,.png,.jpg,.jpeg,.webp,.svg" onChange={handleDocumentFile} disabled={importBusy} /></label>
              {unsupportedChars.length > 0 && (
                <p className="warning compact-warning">Unsupported text characters skipped: {unsupportedChars.join(' ')}</p>
              )}
              {compressedTexts.length > 0 && (
                <p className="warning compact-warning">{language === 'ru' ? 'Текст слишком сжат. Увеличь ширину блока или сократи строку.' : 'Text is too compressed. Increase the block width or shorten the line.'}</p>
              )}
              
            </div>
          )}

          {mode === 'photos' && (
            <div className="control-group">
<h2>{t('Images')}</h2>
              <label className="import-tile">{t('Import Word / image')}<small>DOCX · TXT · PNG · JPG · SVG</small><input type="file" accept=".docx,.txt,.png,.jpg,.jpeg,.webp,.svg" onChange={handleDocumentFile} /></label>
              <div className="sub-tabs">
                <button className={photoMode === 'image' ? 'active' : ''} onClick={() => setPhotoMode('image')}>{t("Image")}</button>
                <button className={photoMode === 'svg' ? 'active' : ''} onClick={() => setPhotoMode('svg')}>{t("SVG")}</button>
              </div>
              {photoMode === 'image' && (
                <details className="trace-options"><summary>{t('Image settings')}</summary>
                  <h3 className="subheading">Image to SVG</h3>
                  <label className="file-drop"><span>{imageName || 'Upload raster image'}</span><input type="file" accept="image/*" onChange={handleAssetFile} /></label>
                  <label><span>Mode</span><select value={traceMode} onChange={(event) => { const value = event.target.value; setTraceMode(value); if (previewUrl) traceImage(previewUrl, traceThreshold, traceSpacing, value, traceDetail, traceInvert); }}><option value="connected-outline">Connected outline</option><option value="fine-outline">Fine outline</option><option value="outline">Threshold outline</option><option value="sketch">Sketch</option><option value="hatching">{t("Hatching")}</option><option value="stipple">Stipple</option></select></label>
                  <label><span>Threshold {traceThreshold}</span><input type="range" min="20" max="245" value={traceThreshold} onChange={(event) => { const value = Number(event.target.value); setTraceThreshold(value); if (previewUrl) traceImage(previewUrl, value, traceSpacing, traceMode, traceDetail, traceInvert); }} /></label>
                  <label><span>Spacing {traceSpacing.toFixed(1)} mm</span><input type="range" min="0.2" max="14" step="0.1" value={traceSpacing} onChange={(event) => { const value = Number(event.target.value); setTraceSpacing(value); if (previewUrl) traceImage(previewUrl, traceThreshold, value, traceMode, traceDetail, traceInvert); }} /></label>
                  <label><span>Detail {traceDetail}px</span><input type="range" min="120" max="900" step="20" value={traceDetail} onChange={(event) => { const value = Number(event.target.value); setTraceDetail(value); if (previewUrl) traceImage(previewUrl, traceThreshold, traceSpacing, traceMode, value, traceInvert); }} /></label>
                  <label className="toggle-row"><input type="checkbox" checked={traceInvert} onChange={(event) => { const value = event.target.checked; setTraceInvert(value); if (previewUrl) traceImage(previewUrl, traceThreshold, traceSpacing, traceMode, traceDetail, value); }} /><span>Invert image</span></label>
                  <div className="image-vector-preview">
                    <svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet">
                      {previewUrl && <image href={previewUrl} x="0" y="0" width="1" height="1" opacity="0.18" preserveAspectRatio="xMidYMid meet" />}
                      {imageLocalPaths.slice(0, 6000).map((path, index) => <path key={index} d={toPathData(path)} fill="none" stroke="#67e8f9" strokeWidth="0.003" strokeLinecap="round" strokeLinejoin="round" />)}
                    </svg>
                  </div>
                  <div className="button-row">
                    <button onClick={() => previewUrl && traceImage(previewUrl, traceThreshold, traceSpacing, traceMode, traceDetail, traceInvert)} disabled={!previewUrl}>{t("Refresh Trace")}</button>
                    <button onClick={exportTracedImageSvg} disabled={!imageLocalPaths.length}>{t("Download SVG")}</button>
                  </div>
                  <p className="muted">{imageLocalPaths.length ? `${imageLocalPaths.length} vector strokes generated. Lower spacing and raise detail for finer output.` : 'Upload an image and adjust the sliders until the vector preview looks right.'}</p>
                </details>
              )}
              {photoMode === 'svg' && (
                <>
                  <label className="file-drop"><span>{svgName || 'Import SVG'}</span><input type="file" accept=".svg,image/svg+xml" onChange={handleAssetFile} /></label>
                  <label className="toggle-row"><input type="checkbox" checked={fillHoles} onChange={(event) => { setFillHoles(event.target.checked); if (!event.target.checked) setSvgFillPaths([]); }} /><span>Add hatch fills on import</span></label>
                  <p className="muted">Parses paths, lines, polygons, rects, circles, and ellipses. Hatch fills add scanlines inside filled shapes.</p>
                </>
              )}
            </div>
          )}

          {mode === 'qr' && (
            <div className="control-group">
              <h2>QR Code</h2>
              <label><span>{t("Content")}</span><input value={qrText} onChange={(event) => setQrText(event.target.value)} /></label>
              <label><span>{t("Style")}</span><select value={qrStyle} onChange={(event) => setQrStyle(event.target.value)}><option value="square">{t("Square")}</option><option value="rounded">{t("Rounded outline")}</option><option value="dots">{t("Dots")}</option></select></label>
              {qrStyle !== 'dots' && (
                <button className={qrFilled ? 'active-toggle' : ''} onClick={() => setQrFilled((filled) => !filled)}>
                  {qrFilled ? 'Filled modules on' : 'Fill modules'}
                </button>
              )}
              <button onClick={generateQr}>{t("Generate QR Paths")}</button>
            </div>
          )}

          {mode === 'patterns' && (
            <div className="control-group">
              <h2>{t("Generative Patterns")}</h2>
              <label><span>{t("Pattern")}</span><select value={patternType} onChange={(event) => setPatternType(event.target.value)}><option value="hatching">{t("Hatching")}</option><option value="crosshatch">{t("Crosshatch")}</option><option value="diagonal">{t("Diagonal hatch")}</option><option value="spiral">{t("Spiral")}</option><option value="flow">{t("Flow lines")}</option><option value="contour">{t("Contour lines")}</option></select></label>
              <label><span>Spacing {traceSpacing} mm</span><input type="range" min="2" max="14" value={traceSpacing} onChange={(event) => setTraceSpacing(Number(event.target.value))} /></label>
            </div>
          )}

          {mode === 'draw' && <div className="control-group"><h2>{t("Freehand")}</h2><p className="muted">{t("Draw directly on the preview. Strokes are simplified as you draw to keep the app responsive.")}</p><button onClick={clearDrawing}>{t("Clear drawing")}</button></div>}
          {mode === 'calibrate' && <div className="control-group"><h2>{t("Calibration + Offset")}</h2><p className="muted">{t("Exports a 50 mm square, diagonals, center lines, and an offset crosshair.")}</p></div>}

          {mode === 'shapes' && (
            <div className="control-group">
              <h2>{t("Shapes")}</h2>
              <p className="muted">{t("Select to edit. Use tools above to add shapes.")}</p>
              <div className="shape-tool-palette">
                <button className={activeTool === 'circle' ? 'active' : ''} onClick={() => setActiveTool(activeTool === 'circle' ? 'none' : 'circle')} title="Circle">
                  <svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
                </button>
                <button className={activeTool === 'rect' ? 'active' : ''} onClick={() => setActiveTool(activeTool === 'rect' ? 'none' : 'rect')} title="Rectangle">
                  <svg viewBox="0 0 20 20" width="20" height="20"><rect x="3" y="4" width="14" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" rx="1"/></svg>
                </button>
                <button className={activeTool === 'star' ? 'active' : ''} onClick={() => setActiveTool(activeTool === 'star' ? 'none' : 'star')} title="Star">
                  <svg viewBox="0 0 20 20" width="20" height="20"><polygon points="10,1.5 12.6,7.2 19,7.8 14.3,12 15.6,18.5 10,15.2 4.4,18.5 5.7,12 1,7.8 7.4,7.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                </button>
                <button className={activeTool === 'line' ? 'active' : ''} onClick={() => setActiveTool(activeTool === 'line' ? 'none' : 'line')} title="Line">
                  <svg viewBox="0 0 20 20" width="20" height="20"><line x1="2" y1="18" x2="18" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
                <button className={activeTool === 'hexagon' ? 'active' : ''} onClick={() => setActiveTool(activeTool === 'hexagon' ? 'none' : 'hexagon')} title="Hexagon">
                  <svg viewBox="0 0 20 20" width="20" height="20"><polygon points="10,2 17.5,6.5 17.5,15.5 10,20 2.5,15.5 2.5,6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
                </button>
              </div>
              {selectedShapeId && (() => {
                const sel = shapes.find((s) => s.id === selectedShapeId);
                if (!sel) return null;
                return (
                  <>
                    <div className="settings-grid compact">
                      <NumberInput label="X" value={Math.round(sel.x)} onChange={(v) => setShapes((current) => current.map((s) => s.id === sel.id ? { ...s, x: v } : s))} />
                      <NumberInput label="Y" value={Math.round(sel.y)} onChange={(v) => setShapes((current) => current.map((s) => s.id === sel.id ? { ...s, y: v } : s))} />
                      <NumberInput label={t("Rotation")} value={Math.round(sel.rotation)} onChange={(v) => setShapes((current) => current.map((s) => s.id === sel.id ? { ...s, rotation: v } : s))} />
                    </div>
                    {sel.type === 'circle' && <NumberInput label={t("Radius")} value={formatMM(sel.radius)} onChange={(v) => setShapes((current) => current.map((s) => s.id === sel.id ? { ...s, radius: v } : s))} step="1" />}
                    {sel.type === 'rect' && (
                      <div className="settings-grid compact">
                        <NumberInput label={t("Width")} value={formatMM(sel.width)} onChange={(v) => setShapes((current) => current.map((s) => s.id === sel.id ? { ...s, width: v } : s))} step="1" />
                        <NumberInput label={t("Height")} value={formatMM(sel.height)} onChange={(v) => setShapes((current) => current.map((s) => s.id === sel.id ? { ...s, height: v } : s))} step="1" />
                      </div>
                    )}
                    {sel.type === 'star' && (
                      <div className="settings-grid compact">
                        <NumberInput label="Outer R" value={formatMM(sel.outerRadius)} onChange={(v) => setShapes((current) => current.map((s) => s.id === sel.id ? { ...s, outerRadius: v } : s))} step="1" />
                        <NumberInput label="Inner R" value={formatMM(sel.innerRadius)} onChange={(v) => setShapes((current) => current.map((s) => s.id === sel.id ? { ...s, innerRadius: v } : s))} step="1" />
                      </div>
                    )}
                    {sel.type === 'line' && <NumberInput label={t("Length")} value={Math.round(sel.length || 20)} onChange={(v) => setShapes((c) => c.map((s) => s.id === sel.id ? { ...s, length: v } : s))} />}
                    {sel.type === 'hexagon' && <NumberInput label={t("Radius")} value={formatMM(sel.radius)} onChange={(v) => setShapes((current) => current.map((s) => s.id === sel.id ? { ...s, radius: v } : s))} step="1" />}
                    <button className="danger-action" onClick={() => {
                      setShapes((current) => current.filter((s) => s.id !== selectedShapeId));
                      setSelectedShapeId(null);
                    }}>{t("Delete Shape")}</button>
                  </>
                );
              })()}
            </div>
          )}

          <div className="control-group objects-control">
            <h2>{t("Objects")}</h2>
            <div className="object-list">
              {objectRows.filter((row) => row.count > 0).map((row) => (
                <div className="object-row" key={row.key}>
                  <label className="toggle-row">
                    <input type="checkbox" checked={objectVisibility[row.key]} onChange={(event) => setObjectVisibility((current) => ({ ...current, [row.key]: event.target.checked }))} />
                    <span>{t(row.label)}</span>
                  </label>
                  <span>{row.count}</span>
                  <button onClick={() => clearObjectGroup(row.key)} disabled={!row.count}>{t("Clear")}</button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="preview-panel">
          <div className="preview-header">
            <div className="canvas-heading"><h2>{t("Page preview")}</h2><button className="canvas-expand" onClick={() => setCanvasFocus((focused) => !focused)} title={t(canvasFocus ? 'Exit full view' : 'Expand page')}>{canvasFocus ? '↙' : '↗'}</button><p>{formatBedSize(settings.bedWidth)} x {formatBedSize(settings.bedHeight)} {t('mm bed')} · {formatMM(settings.paperWidth)} x {formatMM(settings.paperHeight)} {t('mm paper')}</p></div>
            <div className="stats">
              <label className="toggle-row"><input type="checkbox" checked={showTravel} onChange={(event) => setShowTravel(event.target.checked)} /><span>{t('Travel')}</span></label>
              <span>{stats.paths} {t('strokes')}</span>
              <span>{stats.points} {t('points')}</span>
              <span>{Math.round(stats.distance)} mm</span>
            </div>
          </div>
          <svg id="build-plate-svg" viewBox={`-18 -18 ${Math.max(settings.bedWidth, settings.originX + settings.paperWidth) + 36} ${Math.max(settings.bedHeight, settings.originY + settings.paperHeight) + 36}`} className={`build-plate ${tapToMoveActive && printerStatus.connected ? 'build-plate-tap-active' : ''} ${mode === 'shapes' && activeTool !== 'none' ? 'build-plate-shape-place' : ''}`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
            <text x={settings.bedWidth / 2} y="-7" textAnchor="middle" className="dimension-label">{settings.bedWidth} mm · {t('Textured plate')}</text>
            <text x={settings.originX + settings.paperWidth / 2} y={settings.originY + settings.paperHeight + 11} textAnchor="middle" className="dimension-label">{settings.paperFormat || 'Paper'} · {settings.paperWidth} × {settings.paperHeight} mm</text>
            <defs>
              <linearGradient id="plate-sheen" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#22272a" />
                <stop offset="48%" stopColor="#171b1d" />
                <stop offset="100%" stopColor="#252a2d" />
              </linearGradient>
              <pattern id="plate-texture" width="7" height="7" patternUnits="userSpaceOnUse">
                <rect width="7" height="7" fill="transparent" />
                <path d="M0 7 L7 0" stroke="#2f3639" strokeWidth="0.35" opacity="0.55" />
                <circle cx="1.5" cy="1.5" r="0.35" fill="#3c4548" opacity="0.5" />
              </pattern>
              <pattern id="plate-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#5b676b" strokeWidth="0.22" opacity="0.72" />
              </pattern>
              <pattern id="plate-grid-major" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#7d8b8f" strokeWidth="0.45" opacity="0.72" />
              </pattern>
            </defs>
            <rect width={settings.bedWidth} height={settings.bedHeight} rx="4" fill="url(#plate-sheen)" stroke="#3f494d" strokeWidth="1.2" />
            <rect width={settings.bedWidth} height={settings.bedHeight} rx="4" fill="url(#plate-texture)" opacity="0.95" />
            <rect width={settings.bedWidth} height={settings.bedHeight} rx="4" fill="url(#plate-grid)" />
            <rect width={settings.bedWidth} height={settings.bedHeight} rx="4" fill="url(#plate-grid-major)" />

            <line x1={settings.bedWidth / 2} y1="8" x2={settings.bedWidth / 2} y2={settings.bedHeight - 8} stroke="#14b8a6" strokeWidth="0.55" opacity="0.85" />
            <line x1="8" y1={settings.bedHeight / 2} x2={settings.bedWidth - 8} y2={settings.bedHeight / 2} stroke="#14b8a6" strokeWidth="0.55" opacity="0.85" />
            <circle cx={settings.bedWidth / 2} cy={settings.bedHeight / 2} r="5" fill="none" stroke="#14b8a6" strokeWidth="0.55" opacity="0.9" />
            {[0, 50, 100, 150, 200, 250].filter((tick) => tick <= settings.bedWidth).map((tick) => (
              <text key={`x-${tick}`} x={Math.max(8, Math.min(settings.bedWidth - 12, tick))} y="13" fill="#c9d2d5" fontSize="5" textAnchor="middle">{tick}</text>
            ))}
            {[50, 100, 150, 200, 250].filter((tick) => tick <= settings.bedHeight).map((tick) => (
              <text key={`y-${tick}`} x="9" y={tick + 1.5} fill="#c9d2d5" fontSize="5" textAnchor="middle">{tick}</text>
            ))}
            <rect data-paper="true" x={settings.originX} y={settings.originY} width={settings.paperWidth} height={settings.paperHeight} fill="#fbfbf7" fillOpacity="1" stroke="#14b8a6" strokeWidth="0.9" strokeDasharray="3 2" className={presetMenuOpen ? 'paper-rect paper-rect-move' : 'paper-rect'} />
            {unreachableZones.map((zone, index) => (
              <g key={`unreachable-${index}`} className="unreachable-zone" pointerEvents="none">
                <rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} />
                {zone.width > 14 && zone.height > 14 && (
                  <text x={zone.x + zone.width / 2} y={zone.y + zone.height / 2} textAnchor="middle" dominantBaseline="middle">
                    {t('Pen unreachable')}
                  </text>
                )}
              </g>
            ))}
            {settings.originY + settings.paperHeight > getReachableBounds(settings).maxY && <g pointerEvents="none"><rect x={settings.originX} y={getReachableBounds(settings).maxY} width={settings.paperWidth} height={settings.originY + settings.paperHeight - getReachableBounds(settings).maxY} fill="#ef8c7c" opacity="0.10" /><line x1={settings.originX} x2={settings.originX + settings.paperWidth} y1={getReachableBounds(settings).maxY} y2={getReachableBounds(settings).maxY} stroke="#c77466" strokeDasharray="2 2" strokeWidth="0.5" /><text x={settings.originX + settings.paperWidth / 2} y={getReachableBounds(settings).maxY + 9} textAnchor="middle" fontSize="3.5" fill="#ac6559">{t('Outside drawing area')}</text></g>}
            {showTravel && logicalPreviewPaths.slice(1).map((path, index) => { const previous = logicalPreviewPaths[index].at(-1); return <line key={`travel-${index}`} x1={previous.x} y1={previous.y} x2={path[0].x} y2={path[0].y} stroke="#c06b3a" strokeWidth="0.45" strokeDasharray="2 2" opacity="0.55" pointerEvents="none" />; })}
            {presetMenuOpen && (
              <>
                <circle data-handle="paper-resize-tl" cx={settings.originX} cy={settings.originY} r="4.5" fill="#14b8a6" className="paper-resize-handle-tl" />
                <circle data-handle="paper-resize-tr" cx={settings.originX + settings.paperWidth} cy={settings.originY} r="4.5" fill="#14b8a6" className="paper-resize-handle-tr" />
                <circle data-handle="paper-resize-bl" cx={settings.originX} cy={settings.originY + settings.paperHeight} r="4.5" fill="#14b8a6" className="paper-resize-handle-bl" />
                <circle data-handle="paper-resize-br" cx={settings.originX + settings.paperWidth} cy={settings.originY + settings.paperHeight} r="4.5" fill="#14b8a6" className="paper-resize-handle-br" />
              </>
            )}
            {previewUrl && mode === 'photos' && photoMode === 'image' && <image href={previewUrl} x={object.x} y={object.y} width={object.w} height={object.h} opacity="0.16" preserveAspectRatio="xMidYMid meet" />}
            {enabledLayers.map((layer) => layer.paths.map((path, index) => <path key={`${layer.id}-${index}`} d={toPathData(applySettings([path], settings, { mirrorOutput: false })[0])} fill="none" stroke={layer.color} strokeWidth="0.75" strokeLinecap="round" strokeLinejoin="round" />))}
            {composeScenePaths(layers.map(layer => ({...layer, enabled:false})), projectPaths).map((path, index) => <path key={`live-${index}`} d={toPathData(applySettings([path], settings, { mirrorOutput: false })[0])} fill="none" stroke="#0f766e" strokeWidth="0.75" strokeLinecap="round" strokeLinejoin="round" />)}
            {mode === 'text' && textItems.map((item) => (
              <g key={item.id} transform={`rotate(${item.object.angle} ${item.object.x + item.object.w / 2} ${item.object.y + item.object.h / 2})`}>
                <rect
                  data-text-id={item.id}
                  x={item.object.x}
                  y={item.object.y}
                  width={item.object.w}
                  height={item.object.h}
                  fill="transparent"
                  className="selection-box"
                  stroke={item.id === selectedText?.id ? '#b45309' : '#0f766e'}
                  strokeWidth={item.id === selectedText?.id ? 1.4 : 0.8}
                  strokeDasharray="4 2"
                />
                {item.id === selectedText?.id && (
                  <>
                    {['tl','tr','bl','br'].map((corner) => <rect key={corner} data-text-id={item.id} data-handle={`resize-${corner}`} x={item.object.x + (corner.includes('r') ? item.object.w : 0) - 2} y={item.object.y + (corner.includes('b') ? item.object.h : 0) - 2} width="4" height="4" rx="0.8" className="resize-handle" />)}
                    <circle data-text-id={item.id} data-handle="rotate" cx={item.object.x + item.object.w / 2} cy={item.object.y - 10} r="4" fill="#b45309" />
                  </>
                )}
              </g>
            ))}
            {(['photos', 'qr'].includes(mode)) && <g transform={`rotate(${object.angle} ${object.x + object.w / 2} ${object.y + object.h / 2})`}><rect data-asset="true" x={object.x} y={object.y} width={object.w} height={object.h} fill="transparent" stroke="#0f766e" strokeWidth="1" strokeDasharray="4 2" />{['tl','tr','bl','br'].map((corner) => <rect key={corner} data-handle={`resize-${corner}`} x={object.x + (corner.includes('r') ? object.w : 0) - 2} y={object.y + (corner.includes('b') ? object.h : 0) - 2} width="4" height="4" rx="0.8" className="resize-handle" />)}<circle data-handle="rotate" cx={object.x + object.w / 2} cy={object.y - 10} r="4" fill="#b45309" /></g>}
            {mode === 'shapes' && shapes.map((shape) => {
              const isSelected = shape.id === selectedShapeId;
              const paths = shapeToPaths(shape);
              const bb = shapeBoundingBox(shape);
              return (
                <g key={shape.id}>
                  {paths.map((path, i) => (
                    <path key={i} d={toPathData(path)} fill="none" stroke={isSelected ? '#b45309' : '#0f766e'} strokeWidth={isSelected ? '0.9' : '0.75'} strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                  {isSelected && (
                    <>
                      <rect data-shape-id={shape.id} x={bb.x} y={bb.y} width={bb.w} height={bb.h} fill="transparent" className="shape-drag-body" />
                      <rect x={bb.x} y={bb.y} width={bb.w} height={bb.h} fill="none" stroke="#b45309" strokeWidth="0.6" strokeDasharray="2 2" />
                      <circle data-shape-id={shape.id} data-handle="shape-scale-tl" cx={bb.x} cy={bb.y} r="3.5" fill="#14b8a6" className="shape-scale-handle-tl" />
                      <circle data-shape-id={shape.id} data-handle="shape-scale-tr" cx={bb.x + bb.w} cy={bb.y} r="3.5" fill="#14b8a6" className="shape-scale-handle-tr" />
                      <circle data-shape-id={shape.id} data-handle="shape-scale-bl" cx={bb.x} cy={bb.y + bb.h} r="3.5" fill="#14b8a6" className="shape-scale-handle-bl" />
                      <circle data-shape-id={shape.id} data-handle="shape-scale-br" cx={bb.x + bb.w} cy={bb.y + bb.h} r="3.5" fill="#14b8a6" className="shape-scale-handle-br" />
                      <circle data-shape-id={shape.id} data-handle="shape-rotate" cx={shape.x} cy={bb.y - 10} r="4" fill="#b45309" />
                    </>
                  )}
                  {!isSelected && (
                    <rect data-shape-id={shape.id} x={bb.x} y={bb.y} width={bb.w} height={bb.h} fill="transparent" />
                  )}
                </g>
              );
            })}
            {mode === 'shapes' && tempShape && (() => {
              const paths = shapeToPaths(tempShape);
              const bb = shapeBoundingBox(tempShape);
              return (
                <g opacity="0.7" style={{ pointerEvents: 'none' }}>
                  {paths.map((path, i) => (
                    <path key={i} d={toPathData(path)} fill="none" stroke="#67e8f9" strokeWidth="0.9" strokeDasharray="3 2" strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                  <rect x={bb.x} y={bb.y} width={bb.w} height={bb.h} fill="none" stroke="#67e8f9" strokeWidth="0.5" strokeDasharray="2 2" />
                </g>
              );
            })()}
            {tapToMoveMarker && (
              <g className="tap-move-marker">
                <circle cx={tapToMoveMarker.x} cy={tapToMoveMarker.y} r="4" fill="none" stroke="#f59e0b" strokeWidth="0.8" />
                <line x1={tapToMoveMarker.x - 8} y1={tapToMoveMarker.y} x2={tapToMoveMarker.x + 8} y2={tapToMoveMarker.y} stroke="#f59e0b" strokeWidth="0.7" />
                <line x1={tapToMoveMarker.x} y1={tapToMoveMarker.y - 8} x2={tapToMoveMarker.x} y2={tapToMoveMarker.y + 8} stroke="#f59e0b" strokeWidth="0.7" />
              </g>
            )}
            {mode === 'shapes' && activeTool !== 'none' && (
              <rect x="0" y="0" width={settings.bedWidth} height={settings.bedHeight} fill="transparent" style={{ pointerEvents: 'all' }} />
            )}
          </svg>
        </section>

        <aside className="panel settings-panel">
          <div className="control-group">
            <div className="inspector-heading"><h2>{t('Print job')}</h2><span className={`connection-dot ${printerStatus.connected ? 'online' : ''}`} title={t(printerStatus.connected ? 'Connected' : 'Not connected')} /></div>
            {HOSTED_MODE && <div className="hosted-note"><p>{language === 'ru' ? 'Редактор работает без установки. Для отправки на принтер нужна локальная программа BERETS Plot.' : 'The editor needs no installation. Sending to a printer requires the local BERETS Plot app.'}</p><button onClick={exportGCode} disabled={!exportPaths.length}>{language === 'ru' ? 'Скачать G-code' : 'Download G-code'}</button>{!backendEnabled && <button className="quiet-button" onClick={() => {setBackendEnabled(true);setPrinterDetailsOpen(true);}}>{language === 'ru' ? 'Подключить локальную программу' : 'Connect local app'}</button>}</div>}
            {backendEnabled && <button className="quiet-button" onClick={() => setPrinterDetailsOpen((open) => !open)}>{t(printerStatus.connected ? 'Printer connected' : 'Connect printer')} <span>↗</span></button>}
            {backendEnabled && (printerDetailsOpen || !printerStatus.connected) && <div className="connection-form">
              <input aria-label={t('Printer IP')} value={printerConfig.host} onChange={(event) => updatePrinterConfig({host:event.target.value})} placeholder={t('Printer IP')} />
              <input aria-label={t('Serial / Device ID')} value={printerConfig.serial} onChange={(event) => updatePrinterConfig({serial:event.target.value})} placeholder={t('Serial / Device ID')} />
              <input aria-label={t('LAN Access Code')} type="password" value={printerConfig.accessCode} onChange={(event) => updatePrinterConfig({accessCode:event.target.value})} placeholder={t('LAN Access Code')} />
              <button onClick={connectPrinter} disabled={plotBusy}>{t('Connect')}</button>
            </div>}
            <div className="paper-profile"><label><span>{t('Paper')}</span><select value={settings.paperFormat || 'Custom'} onChange={(event) => { const name=event.target.value; const dimensions=name==='A4'?[210,297]:name==='A5'?[148,210]:[settings.paperWidth,settings.paperHeight]; setSettings((current)=>({...current,paperFormat:name,paperWidth:dimensions[0],paperHeight:dimensions[1],originX:Math.max(0,(current.bedWidth-dimensions[0])/2),originY:0})); }}><option>A4</option><option>A5</option><option value="Custom">{t('Custom')}</option></select></label></div>
            <label><span>{language === 'ru' ? 'Инструмент' : 'Tool'}</span><select value={settings.toolKey || 'pencil'} onChange={e => setSettings(current => switchTool(current,e.target.value))}>{[['pen','Ручка','Pen'],['marker','Маркер','Marker'],['pencil','Карандаш','Pencil']].map(([key,ru,en]) => <option key={key} value={key}>{language === 'ru' ? ru : en}</option>)}</select></label>
            <button className="quiet-button" onClick={() => setNozzleOpen((open) => !open)}>{t('Nozzle settings')} <span>{nozzleOpen ? '−' : '+'}</span></button>
            {nozzleOpen && <div className="machine-profile">
              <div className="settings-grid">
                <NumberInput label={language === 'ru' ? 'Отрыв карандаша · мм' : 'Pen clearance · mm'} min="1" step="1" value={settings.penLiftMm} onChange={(value) => setSettings((current) => { const penLiftMm=Math.max(1,value); const penUpZ=Math.max(current.penDownZ,current.penProtrusion || 5)+penLiftMm; return {...current,penLiftMm,penUpZ,safeZ:penUpZ,toolProfiles:{...current.toolProfiles,[current.toolKey||'pencil']:{penLiftMm}}}; })} />
              </div>
            </div>}
            <div className="speed-control">
              <button type="button" className={`turbo-toggle${settings.turboMode ? ' is-active' : ''}`} aria-pressed={Boolean(settings.turboMode)} disabled={plotBusy || printerStatus.streaming} onClick={() => setSettings(current => ({...current, ...speedProfile(current.speedPercent, !current.turboMode)}))}>
                <span>{language === 'ru' ? 'Турбо' : 'Turbo'}</span><small>{settings.turboMode ? (language === 'ru' ? '166% · штрихи' : '166% · strokes') : (language === 'ru' ? 'Выключен' : 'Off')}</small>
              </button>
              <label htmlFor="plot-speed">{t('Speed')} <output>{settings.turboMode ? 100 : settings.speedPercent}%</output></label>
              <input id="plot-speed" aria-label={t('Speed')} type="range" min="1" max="100" step="1" value={settings.turboMode ? 100 : settings.speedPercent} disabled={plotBusy || printerStatus.streaming || settings.turboMode} onChange={(event) => setSettings((current) => ({...current,...speedProfile(event.target.value, current.turboMode)}))} />
              <div className="speed-caption"><span>{language === 'ru' ? 'Штрихи' : 'Drawing'}: {settings.feedrate / 60} {t('mm/s')}</span><span>{language === 'ru' ? 'Переезды' : 'Travel'}: {settings.travelSpeed / 60} {t('mm/s')}</span></div>
            </div>
            <div className="job-summary">
              <span>{t('Strokes')} <strong>{stats.paths}</strong></span>
              <span>{t('Drawing')} <strong>{Math.round(stats.distance)} mm</strong></span>
              <span>{language === 'ru' ? 'Примерное время' : 'Estimated time'} <strong>{Math.max(1, Math.ceil(compiledPreview.seconds / 60))} {t('min')}</strong></span>
            </div>
            {compiledPreview.error && <p className="warning compact-warning">{compiledPreview.error}</p>}
            <button className="primary-action draw-now" onClick={sendPlotToPrinter} disabled={!printerStatus.connected || !exportPaths.length || plotBusy || printerStatus.streaming || !!compiledPreview.error}>{printerStatus.streaming ? (language === 'ru' ? 'Задание уже отправляется' : 'Job is already streaming') : plotBusy ? t('Sending…') : t('Home & draw')}</button>
            <button onClick={() => { setPlaybackProgress(0); setPlaybackOpen(true); }} disabled={!exportPaths.length}>{t('Simulate toolpath')}</button>
            <button className="danger-action" onClick={async () => { const result = await callPrinterApi('/api/printer/cancel-stream', {}); if (result) { setPlotBusy(false); operationLock.current = false; await refreshPrinterStatus(); } }} disabled={!plotBusy && !printerStatus.streaming}>{language === 'ru' ? 'Отменить отправку' : 'Cancel sending'}</button>
            
            {printerMessage && !printerError && <p className="status-line" role="status">{printerMessage}</p>}
            {printerError && <p className="warning compact-warning" role="alert">{printerError}</p>}
            {printerStatus.streaming ? <p className="status-line">{language === 'ru' ? 'Предыдущее задание ещё активно. Дождись завершения или нажми «Отменить отправку», если оно зависло.' : 'The previous job is still active. Wait for completion or press Stop if it is stuck.'}</p> : !printerStatus.connected ? <p className="status-line">{t('Not connected')}</p> : preflightMessage ? <p className="status-line">{preflightMessage}</p> : null}
            <div className="button-row">
              <button onClick={() => callPrinterApi('/api/printer/pause', {})} disabled={!printerStatus.connected}>{t('Pause')}</button>
              <button onClick={() => callPrinterApi('/api/printer/resume', {})} disabled={!printerStatus.connected}>{t('Resume')}</button>
            </div>
            <button className="danger-action" onClick={() => callPrinterApi('/api/printer/stop', {})} disabled={!printerStatus.connected}>{t('Stop plot')}</button>
            {advancedOpen && <>
              <button onClick={preflightPlot} disabled={!exportPaths.length}>{t('Inspect G-code')}</button>
              <label><span>{(language === 'ru' ? 'Интервал пакетов' : 'Batch interval')} · {lineDelayMs} ms</span><input type="range" min="80" max="1200" step="20" value={lineDelayMs} onChange={(event) => setLineDelayMs(Number(event.target.value))} /></label>
              <div className="button-row"><button onClick={() => jogPrinter({ z: 1 })} disabled={!printerStatus.connected || plotBusy}>Z +1</button><button onClick={() => jogPrinter({ z: 10 })} disabled={!printerStatus.connected || plotBusy}>Z +10</button></div>
            </>}

          </div>

          {advancedOpen && <div className="control-group">
            <h2>{t("Motion + Offset")}</h2>
            <button className="collapse-button" onClick={() => setMotionOpen((open) => !open)}>
              {t(motionOpen ? 'Hide Motion Settings' : 'Show Motion Settings')}
            </button>
            {motionOpen && (
              <div className="collapsible-section">
                <div className="settings-grid">
                  <NumberInput label={t("Scale")} step="0.1" value={settings.scale} onChange={(value) => handleSettingChange('scale', value)} />
                  <NumberInput label={t("Pen up Z")} step="0.1" value={settings.penUpZ} onChange={(value) => handleSettingChange('penUpZ', value)} />
                  <NumberInput label={t("Pen down Z")} step="0.1" value={settings.penDownZ} onChange={(value) => handleSettingChange('penDownZ', value)} />
                  
                  <NumberInput label={t("Origin X")} value={formatBedSize(settings.originX)} onChange={(value) => handleSettingChange('originX', value)} />
                  <NumberInput label={t("Origin Y")} value={formatBedSize(settings.originY)} onChange={(value) => handleSettingChange('originY', value)} />
                  <NumberInput label={t("Tip off X")} step="0.1" value={settings.penTipOffsetX} onChange={(value) => handleSettingChange('penTipOffsetX', value)} />
                  <NumberInput label={t("Tip off Y")} step="0.1" value={settings.penTipOffsetY} onChange={(value) => handleSettingChange('penTipOffsetY', value)} />
                  <NumberInput label={t("Fine off X")} step="0.1" value={settings.penOffsetX} onChange={(value) => handleSettingChange('penOffsetX', value)} />
                  <NumberInput label={t("Fine off Y")} step="0.1" value={settings.penOffsetY} onChange={(value) => handleSettingChange('penOffsetY', value)} />
                  <NumberInput label={t("Park X")} value={formatBedSize(settings.parkX)} onChange={(value) => handleSettingChange('parkX', value)} />
                  <NumberInput label={t("Park Y")} value={formatBedSize(settings.parkY)} onChange={(value) => handleSettingChange('parkY', value)} />
                </div>

                <label className="toggle-row"><input type="checkbox" checked={settings.mirrorOutputX} onChange={(event) => handleSettingChange('mirrorOutputX', event.target.checked)} /><span>{t("Fix left-right flip")}</span></label>
                <label className="toggle-row"><input type="checkbox" checked={settings.mirrorOutputY} onChange={(event) => handleSettingChange('mirrorOutputY', event.target.checked)} /><span>{t("Fix top-bottom flip")}</span></label>
                <label className="toggle-row"><input type="checkbox" checked={bambuSafetyHeader} onChange={(event) => setBambuSafetyHeader(event.target.checked)} /><span>{t("Bambu safety header")}</span></label>
                <label className="toggle-row"><input type="checkbox" checked={lineNumbersEnabled} onChange={(event) => setLineNumbersEnabled(event.target.checked)} /><span>{t("Line-number G-code")}</span></label>
              </div>
            )}
          </div>}

          {layers.length > 0 && <div className="control-group">
            <h2>{t("Layers")}</h2>
            {layers.length === 0 && <p className="muted">{t("Add the current design as a layer to compose multi-pen plots.")}</p>}
            {[...layers].sort((a, b) => a.order - b.order).map((layer) => (
              <div className="layer-row" key={layer.id}>
                <input type="checkbox" checked={layer.enabled} onChange={(event) => updateLayer(layer.id, { enabled: event.target.checked })} />
                <input type="color" value={layer.color} onChange={(event) => updateLayer(layer.id, { color: event.target.value })} />
                <span>{layer.name}</span>
                <button onClick={() => moveLayer(layer.id, -1)}>{t("Up")}</button>
                <button onClick={() => moveLayer(layer.id, 1)}>{t("Down")}</button>
                <button onClick={() => setLayers((current) => current.filter((item) => item.id !== layer.id))}>{t("Remove")}</button>
              </div>
            ))}
          </div>}
        </aside>
      </section>
    </main>
  );
}

const formatMM = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v;
  return Number(v.toFixed(2));
};

const formatBedSize = (v) => Math.round(v);

function NumberInput({ label, value, onChange, step = 1, min }) {
  return <label><span>{label}</span><input type="number" min={min} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export default App;
