export const MAX_XY_SPEED_MM_S = 500;
export const DRAW_SPEED_MULTIPLIER = 1.66;
export function speedProfile(percent) {
  const speedPercent = Math.max(1, Math.min(100, Number(percent) || 5));
  const travelSpeed = Math.round(MAX_XY_SPEED_MM_S * 60 * speedPercent / 100);
  return { speedPercent, feedrate: Math.round(travelSpeed * DRAW_SPEED_MULTIPLIER), travelSpeed };
}
export function upgradePlotProfile(saved, defaults = {}) {
  const next = { ...defaults, ...saved };
  if (!saved.orientationRevision) {
    next.mirrorOutputX = true; next.mirrorOutputY = true;
    next.speedPercent = 5; next.orientationRevision = 1;
  }
  if (saved.orientationRevision !== 2) {
    next.mirrorOutputX = false;
    next.orientationRevision = 2;
  }
  if (saved.motionRevision !== 1) {
    next.penUpZ = 10; next.safeZ = 10; next.zFeedrate = 1200; next.motionRevision = 1;
  }
  if (saved.mountRevision !== 1) {
    next.penTipOffsetY = Math.abs(next.penTipOffsetY ?? 30);
    next.mountRevision = 1;
  }
  if (saved.liftRevision !== 1) {
    next.penLiftMm = Math.max(1, (next.penUpZ || 1) - (next.penProtrusion || 5));
    next.liftRevision = 1;
  }
  next.penUpZ = Math.max(next.penDownZ || 1, next.penProtrusion || 5) + Math.max(1,next.penLiftMm || 1);
  next.safeZ = Math.max(next.penUpZ, next.safeZ);
  return { ...next, ...speedProfile(next.speedPercent) };
}
export function reachablePenBounds(settings) {
  const dx=settings.penTipOffsetX-settings.penOffsetX;
  const dy=settings.penTipOffsetY-settings.penOffsetY;
  return {minX:Math.max(0,dx),minY:Math.max(0,dy),maxX:Math.min(settings.bedWidth,settings.bedWidth+dx),maxY:Math.min(settings.bedHeight,settings.bedHeight+dy)};
}
// Use the same compensated bounds for preview shading and motion validation.
export function unreachablePenZones(settings) {
  const b = reachablePenBounds(settings);
  return [
    { x: 0, y: 0, width: settings.bedWidth, height: b.minY },
    { x: 0, y: b.maxY, width: settings.bedWidth, height: settings.bedHeight - b.maxY },
    { x: 0, y: b.minY, width: b.minX, height: b.maxY - b.minY },
    { x: b.maxX, y: b.minY, width: settings.bedWidth - b.maxX, height: b.maxY - b.minY },
  ].filter(zone => zone.width > 0 && zone.height > 0);
}
export function orientPlotPoint(point, settings) {
  const scale = settings.scale || 1;
  const bounds=reachablePenBounds(settings);
  const xMin = Math.max(settings.originX, bounds.minX);
  const yMin = Math.max(settings.originY, bounds.minY);
  const xMax = Math.min(settings.originX + settings.paperWidth * scale, bounds.maxX);
  const yMax = Math.min(settings.originY + settings.paperHeight * scale, bounds.maxY);
  return { ...point, x: settings.mirrorOutputX ? xMin + xMax - point.x : point.x, y: settings.mirrorOutputY ? yMin + yMax - point.y : point.y };
}
