export function normalizePaper(settings) {
  return {
    ...settings,
    paperWidth: Math.max(10, Math.min(1000, Number(settings.paperWidth) || 210)),
    paperHeight: Math.max(10, Math.min(1000, Number(settings.paperHeight) || 297)),
    originX: Math.max(0, Math.min(settings.bedWidth - Math.min(settings.paperWidth, settings.bedWidth), settings.originX)),
    originY: Math.max(0, Math.min(settings.bedHeight - Math.min(settings.paperHeight, settings.bedHeight), settings.originY)),
  };
}
export function resizeObject(object, point, corner) {
  const right = object.x + object.w, bottom = object.y + object.h;
  const left = corner.includes('l') ? Math.min(point.x, right - 8) : object.x;
  const top = corner.includes('t') ? Math.min(point.y, bottom - 4) : object.y;
  const nextRight = corner.includes('r') ? Math.max(point.x, left + 8) : right;
  const nextBottom = corner.includes('b') ? Math.max(point.y, top + 4) : bottom;
  return { ...object, x: left, y: top, w: nextRight - left, h: nextBottom - top };
}
