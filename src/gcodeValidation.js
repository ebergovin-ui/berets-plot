import { isNativeSpeedLine } from './nativeSpeed.js';
const BLOCKED_GCODE_PATTERNS = [
  /^M109\b/i,
  /^M190\b/i,
  /^M106\b/i,
  /\bE-?\d/i,
];
const ALLOWED_GCODE_COMMANDS = /^(G0|G1|G4|G21|G28|G90|G91|G92|M2|M17|M18|M84|M104|M107|M140|M220|M221|M400)\b/i;

const cleanGCodeLine = line => line.replace(/^N\d+\s+/i, '').split(';')[0].trim();
const isUnsafeSafetyCommand = (line) => (
  (/^M104\b/i.test(line) && !/^M104\s+S0(\s|$)/i.test(line))
  || (/^M140\b/i.test(line) && !/^M140\s+S0(\s|$)/i.test(line))
  || (/^M221\b/i.test(line) && !/^M221\s+S(0|100)(\s|$)/i.test(line))
);

const homesZ = (line) => /^G28(\s*$|\s+(?=.*\bZ\b))/i.test(line);

export const validateGCodeLocally = (gcode, { allowNegativeZ = false, allowHome = false } = {}) => {
  const errors = [];
  const executableLines = gcode.split(/\r?\n/).filter((line) => cleanGCodeLine(line));

  executableLines.forEach((line, index) => {
    const cleaned = cleanGCodeLine(line);
    if (!ALLOWED_GCODE_COMMANDS.test(cleaned) && !isNativeSpeedLine(cleaned)) errors.push(`Line ${index + 1}: unsupported command "${cleaned}"`);
    if (BLOCKED_GCODE_PATTERNS.some((pattern) => pattern.test(cleaned))) errors.push(`Line ${index + 1}: blocked command "${cleaned}"`);
    if (isUnsafeSafetyCommand(cleaned)) errors.push(`Line ${index + 1}: unsafe safety command "${cleaned}"`);
    if (/^G28\b/i.test(cleaned) && !allowHome && homesZ(cleaned)) errors.push(`Line ${index + 1}: Z homing is disabled for direct send`);
    const zMatch = cleaned.match(/\bZ(-?\d+(\.\d+)?)/i);
    if (zMatch && Number(zMatch[1]) < 0 && !allowNegativeZ) errors.push(`Line ${index + 1}: negative Z requires confirmation`);
  });

  return {
    ok: errors.length === 0,
    errors,
    lineCount: executableLines.length,
    byteCount: new TextEncoder().encode(gcode).byteLength,
  };
};

