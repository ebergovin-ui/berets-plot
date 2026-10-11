import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transferFileJob} from '../server/fileJob.js';
const setup=()=>{
 const calls=[],controller=new AbortController();
 const ftp={access:async()=>calls.push('access'),uploadFrom:async(stream,path)=>{let data='';for await(const bytes of stream)data+=bytes;assert.equal(data,'G28\n');calls.push(path);},size:async()=>4,close:()=>calls.push('close')};
 return {calls,controller,ftp,params:{gcode:'G28\n',filename:'test.gcode',ftp,access:{},signal:controller.signal,start:async()=>calls.push('start')}};
};
test('whole G-code file is uploaded and checked before one start command',async()=>{
 const s=setup();const result=await transferFileJob(s.params);
 assert.equal(result.bytes,4);assert.ok(s.calls.indexOf('/cache/test.gcode')<s.calls.indexOf('start'));
});
test('truncated transfer never starts the printer',async()=>{
 const s=setup();s.ftp.size=async()=>2;
 await assert.rejects(transferFileJob(s.params),/size mismatch/);assert.ok(!s.calls.includes('start'));
});
test('cancel during upload never starts the printer',async()=>{
 const s=setup();s.ftp.uploadFrom=async()=>s.controller.abort();
 assert.equal((await transferFileJob(s.params)).cancelled,true);assert.ok(!s.calls.includes('start'));
});
test('binary project archive is uploaded intact and dispatch result is preserved',async()=>{
 const s=setup(), bytes=Buffer.from([0x50,0x4b,0x03,0x04,0xff,0x00]);
 s.params.gcode=bytes;
 s.ftp.uploadFrom=async(stream)=>{const chunks=[];for await(const data of stream)chunks.push(data);assert.deepEqual(Buffer.concat(chunks),bytes);};
 s.ftp.size=async()=>bytes.length;
 s.params.start=async()=>({started:true,state:'PREPARE'});
 assert.equal((await transferFileJob(s.params)).started,true);
});
