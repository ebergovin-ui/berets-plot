// Stored layers and live editor objects are both part of the scene.
// Do not draw a saved snapshot again through its still-open editor object.
export function composeScenePaths(layers, livePaths) {
  const ordered = [...layers].sort((a, b) => a.order - b.order);
  const key = path => JSON.stringify(path.map(({x,y}) => [x,y]));
  const stored = new Set(ordered.flatMap(layer => layer.paths.map(key)));
  return [
    ...ordered.filter(layer => layer.enabled).flatMap(layer => layer.paths),
    ...livePaths.filter(path => !stored.has(key(path))),
  ];
}

export function commitDrawPath(paths, index, stroke) {
  const next = [...paths];
  if (index === null || index < 0 || index >= next.length) return next;
  if (stroke.length < 2) next.splice(index, 1);
  else next[index] = [...stroke];
  return next;
}
