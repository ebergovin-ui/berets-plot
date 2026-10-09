export function formatTextBlock(item) {
  const limit = Math.max(8, Math.floor(item.object.w / 3.2));
  return item.text.split('\n').map((paragraph, index) => {
    const prefix = item.listStyle === 'numbered' ? `${index + 1}. ` : item.listStyle === 'bullets' ? '- ' : '';
    if (!paragraph.trim()) return '';
    const result = [];
    let line = prefix;
    const continuation = ' '.repeat(prefix.length);
    for (const word of paragraph.trim().split(/\s+/)) {
      const pieces = [...word].reduce((parts, letter) => { if (!parts.length || parts.at(-1).length >= limit - prefix.length) parts.push(''); parts[parts.length - 1] += letter; return parts; }, []);
      for (const piece of pieces) {
        if (line.trim() && line !== prefix && (line + ' ' + piece).length > limit) { result.push(line); line = continuation; }
        line += (line.trim() && line !== prefix ? ' ' : '') + piece;
      }
    }
    if (line.trim()) result.push(line);
    return result.join('\n');
  }).join('\n');
}
