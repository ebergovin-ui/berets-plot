export function plotGeometryErrors(paths, settings, preserveZZero = true) {
  const errors = [];
  const withinBed = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= settings.bedWidth && y <= settings.bedHeight;
  if (!paths.length || paths.some((path) => path.length < 2)) errors.push('Нет линий для рисования.');
  if (paths.flat().some((point) => !withinBed(point.x - settings.penTipOffsetX + settings.penOffsetX, point.y - settings.penTipOffsetY + settings.penOffsetY))) errors.push('Рисунок выходит за пределы движения сопла. Уменьши или передвинь его.');
  if (paths.flat().some(point => !withinBed(point.x, point.y))) errors.push('Траектория карандаша выходит за пределы стола. Передвинь рисунок в доступную область.');
  if (!withinBed(settings.parkX, settings.parkY)) errors.push('Позиция парковки выходит за пределы стола.');
  if (![settings.penDownZ, settings.penUpZ, settings.safeZ].every(Number.isFinite) || settings.penDownZ < 0 || settings.penUpZ < settings.penDownZ || settings.penUpZ < 1 || settings.safeZ < settings.penUpZ || settings.safeZ > 20) errors.push('Проверь высоту ручки: 0 ≤ рисование ≤ переезд ≤ безопасная высота ≤ 20 мм; переезд от 1 мм.');
  if (!Number.isFinite(settings.feedrate) || settings.feedrate<=0 || settings.feedrate>49800 || !Number.isFinite(settings.travelSpeed) || settings.travelSpeed<=0 || settings.travelSpeed>30000) errors.push('Проверь скорость рисования и переездов.');
  if (settings.zFeedrate !== undefined && (!Number.isFinite(settings.zFeedrate) || settings.zFeedrate <= 0 || settings.zFeedrate > 1200)) errors.push('Скорость Z должна быть больше 0 и не выше 20 мм/с.');
  return errors;
}
