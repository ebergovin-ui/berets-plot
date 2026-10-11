import { moveSeconds } from './motionTiming.js';
import { plotGeometryErrors } from './plotSafety.js';

export function compilePlot(paths, settings) {
  const errors = plotGeometryErrors(paths, settings);
  if (errors.length) throw new Error(errors.join(' '));
  const zFeedrate = settings.turboMode ? 1200 : (settings.zFeedrate ?? 600);
  const f = (n) => Number(n).toFixed(2);
  const nozzle = (p) => ({ x: p.x - settings.penTipOffsetX + settings.penOffsetX, y: p.y - settings.penTipOffsetY + settings.penOffsetY });
  const lines = ['; BERETS Plot — nozzle coordinates, millimetres', '; Home before every job. No G92 / no pen-zero calibration.', 'M104 S0', 'M140 S0', 'M107', 'M17', 'M220 S100', 'G21', 'G90', 'G28', 'M400', `G0 Z${f(settings.penUpZ)} F${Math.round(zFeedrate)}`, 'M400'];
  const segments = [];
  let current = { x: 0, y: 0, z: settings.penUpZ };
  const move = (target, draw, feed) => {
    const from = { ...current };
    const to = { ...current, ...target };
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    segments.push({ from, to, draw, seconds: moveSeconds(length, feed, target.z !== undefined ? 100 : 2000) });
    current = to;
    lines.push(`${draw ? 'G1' : 'G0'} ${Object.entries(target).map(([axis, n]) => `${axis.toUpperCase()}${f(n)}`).join(' ')} F${Math.round(feed)}`);
  };
  for (const path of paths) {
    const first = nozzle(path[0]);
    move({ x: first.x, y: first.y }, false, settings.travelSpeed);
    move({ z: settings.penDownZ }, false, zFeedrate);
    for (const point of path.slice(1)) move(nozzle(point), true, settings.feedrate);
    move({ z: settings.penUpZ }, false, zFeedrate);
  }
  move({ x: settings.parkX, y: settings.parkY }, false, settings.travelSpeed);
  lines.push('M400', '; Job commands complete');
  return { gcode: `${lines.join('\n')}\n`, segments, seconds: 35 + segments.reduce((sum, s) => sum + s.seconds, 0) };
}

export function samplePlot(segments, progress) {
  const seconds = segments.reduce((sum, s) => sum + s.seconds, 0);
  let remaining = Math.max(0, Math.min(1, progress)) * seconds;
  const completed = [];
  for (const segment of segments) {
    if (remaining >= segment.seconds) { completed.push(segment); remaining -= segment.seconds; continue; }
    const fraction = segment.seconds ? remaining / segment.seconds : 1;
    const position = Object.fromEntries(['x', 'y', 'z'].map((axis) => [axis, segment.from[axis] + (segment.to[axis] - segment.from[axis]) * fraction]));
    return { completed, current: { ...segment, to: position }, position, draw: segment.draw };
  }
  return { completed, current: null, position: segments.at(-1)?.to, draw: false };
}
