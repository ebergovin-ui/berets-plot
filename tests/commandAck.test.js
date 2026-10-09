import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {waitForCommandAck} from '../server/commandAck.js';
import {createCommandClock} from '../src/motionTiming.js';
test('only the matching printer response advances the stream',async()=>{
 const client=new EventEmitter(),controller=new AbortController();
 const pending=waitForCommandAck(client,'42',controller.signal);
 client.emit('message','report',Buffer.from(JSON.stringify({print:{command:'gcode_line',sequence_id:'41',result:'success'}})));
 client.emit('message','report',Buffer.from(JSON.stringify({print:{command:'gcode_line',sequence_id:'42',result:'success'}})));
 assert.equal(await pending,true);assert.equal(client.listenerCount('message'),0);
});
test('missing replies and rejection stop the stream instead of skipping packets',async()=>{
 const client=new EventEmitter(),signal=new AbortController().signal;
 await assert.rejects(waitForCommandAck(client,'42',signal,5),/acknowledge/);
 const pending=waitForCommandAck(client,'43',signal);
 client.emit('message','report',Buffer.from(JSON.stringify({print:{command:'gcode_line',sequence_id:'43',result:'fail',reason:'busy'}})));
 await assert.rejects(pending,/busy/);
});
test('cancel immediately releases a pending printer response',async()=>{
 const client=new EventEmitter(),controller=new AbortController();
 const pending=waitForCommandAck(client,'42',controller.signal);controller.abort();
 assert.equal(await pending,false);assert.equal(client.listenerCount('message'),0);
});
test('packet pacing accounts for home, Z and acceleration rather than 80ms flooding',()=>{
 const clock=createCommandClock();assert.equal(clock(['G28']),35);
 const seconds=clock(['G0 Z6 F1200','G0 X10 Y10 F18000','G0 Z1 F1200']);
 assert.ok(seconds>1);
 assert.ok(clock(['G0 Z6 F1200'])>.25);
});
test('project-file rejection is surfaced instead of reporting successful launch',async()=>{
 const client=new EventEmitter(),signal=new AbortController().signal;
 const pending=waitForCommandAck(client,'50',signal,15000,'project_file');
 client.emit('message','report',Buffer.from(JSON.stringify({print:{command:'project_file',sequence_id:'50',result:'fail',reason:'error string'}})));
 await assert.rejects(pending,/error string/);
});
