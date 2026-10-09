export async function transferFileJob({gcode,filename,ftp,access,start,signal,remotePath=`/cache/${filename}`}) {
 const cancel=()=>ftp.close();signal.addEventListener('abort',cancel,{once:true});
 try {
  if(signal.aborted)return {cancelled:true};
  await ftp.access(access);
  if(signal.aborted)return {cancelled:true};
  const bytes=Buffer.byteLength(gcode);
  const {Readable}=await import('node:stream');
  await ftp.uploadFrom(Readable.from([Buffer.from(gcode)]),remotePath);
  if(signal.aborted)return {cancelled:true};
  if(await ftp.size(remotePath)!==bytes)throw new Error('Uploaded file size mismatch. Printer was not started.');
  if(signal.aborted)return {cancelled:true};
  await start(filename);
  return {cancelled:false,bytes};
 } catch(error) {if(signal.aborted)return {cancelled:true};throw error;}
 finally {signal.removeEventListener('abort',cancel);ftp.close();}
}
