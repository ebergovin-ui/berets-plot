const finitePoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const pathsValid = (paths) => Array.isArray(paths) && paths.every((path) => Array.isArray(path) && path.length <= 100000 && path.every(finitePoint));
export function validateProject(data) {
  if (!data || data.format !== 'berets-plot' || data.version !== 1 || !data.settings || !Array.isArray(data.textItems) || !Array.isArray(data.shapes)) return false;
  if (data.textItems.some((item) => !item || typeof item.id !== 'string' || typeof item.text !== 'string' || typeof item.fontKey !== 'string' || !item.object || !['x','y','w','h','angle'].every((key) => Number.isFinite(item.object[key])))) return false;
  if (data.shapes.some((shape) => !shape || typeof shape.id !== 'string' || !['circle','rect','star','line','hexagon'].includes(shape.type) || !finitePoint(shape))) return false;
  for (const key of ['drawPaths','importedSvgPaths','svgFillPaths','imageLocalPaths','qrPaths']) if (data[key] !== undefined && !pathsValid(data[key])) return false;
  if (data.layers !== undefined && (!Array.isArray(data.layers) || data.layers.some((layer) => !layer || !pathsValid(layer.paths) || !Number.isFinite(layer.order) || typeof layer.name !== 'string'))) return false;
  if (data.object && !['x','y','w','h','angle'].every((key) => Number.isFinite(data.object[key]))) return false;
  return true;
}
