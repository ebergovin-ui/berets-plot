export function waitForStream(promise, signal) {
 if(signal.aborted) return Promise.resolve(false);
 return new Promise((resolve,reject)=>{
  const cancel=()=>{cleanup();resolve(false);};
  const cleanup=()=>signal.removeEventListener('abort',cancel);
  signal.addEventListener('abort',cancel,{once:true});
  Promise.resolve(promise).then(value=>{cleanup();resolve(signal.aborted?false:value);},error=>{cleanup();if(signal.aborted)resolve(false);else reject(error);});
 });
}
export function cancelStream(stream) {
 if(!stream)return;
 stream.abort=true;stream.paused=false;stream.controller.abort();
}
