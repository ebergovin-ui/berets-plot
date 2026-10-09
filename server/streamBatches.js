// Bound lookahead and MQTT payload size; keep consecutive motion commands together.
export function batchGCodeLines(lines, maxBytes = 4096, maxLines = 96) {
 const batches=[]; let batch=[], bytes=0;
 const flush=()=>{if(batch.length) batches.push(batch); batch=[];bytes=0;};
 for(const line of lines) {
  const size=Buffer.byteLength(line+'\n');
  if(batch.length && (bytes+size>maxBytes || batch.length>=maxLines)) flush();
  batch.push(line);bytes+=size;
  if(/^(G28|M400)\b/i.test(line)) flush();
 }
 flush();return batches;
}
