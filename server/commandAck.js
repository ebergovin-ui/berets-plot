export function waitForCommandAck(client,sequence,signal,timeoutMs=15000,command='gcode_line') {
 return new Promise((resolve,reject)=>{
  let timer;
  const cleanup=()=>{clearTimeout(timer);client.removeListener('message',message);signal.removeEventListener('abort',cancel);};
  const cancel=()=>{cleanup();resolve(false);};
  const message=(_,bytes)=>{
   let report;try{report=JSON.parse(bytes.toString()).print;}catch{return;}
   if((report?.command && report.command!==command)||String(report.sequence_id)!==String(sequence))return;
   cleanup();if(report.result==='success')resolve(true);else reject(new Error(`Printer rejected command: ${report.reason||report.result||'unknown'}`));
  };
  if(signal.aborted){resolve(false);return;}
  client.on('message',message);signal.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>{cleanup();reject(new Error('Printer did not acknowledge the packet. Sending stopped; do not automatically retry.'));},timeoutMs);
 });
}
