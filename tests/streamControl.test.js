import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitForStream,cancelStream} from '../server/streamControl.js';
test('cancel interrupts an unresponsive printer without waiting for its callback',async()=>{
 const stream={controller:new AbortController(),paused:true};
 const pending=waitForStream(new Promise(()=>{}),stream.controller.signal);
 cancelStream(stream);
 assert.equal(await pending,false);assert.equal(stream.abort,true);assert.equal(stream.paused,false);
});
test('late failure after cancellation is handled and does not resurrect a job',async()=>{
 const controller=new AbortController();let fail;
 const pending=waitForStream(new Promise((_,reject)=>{fail=reject;}),controller.signal);
 controller.abort();assert.equal(await pending,false);fail(new Error('late MQTT failure'));
 await Promise.resolve();
});
test('normal completion and real failures are preserved',async()=>{
 const signal=new AbortController().signal;
 assert.equal(await waitForStream(Promise.resolve(12),signal),12);
 await assert.rejects(waitForStream(Promise.reject(new Error('offline')),signal),/offline/);
});
