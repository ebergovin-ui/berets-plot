import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mergePrinterReport, watchFileStart } from '../server/printerState.js';
const emit = (client, print, topic = 'report') => client.emit('message', topic, Buffer.from(JSON.stringify({print})));
test('status deltas retain state and command acknowledgements cannot replace it', () => {
 const initial = { print: { command:'push_status',gcode_state:'IDLE',print_error:123 } };
 const next = mergePrinterReport(initial, {print:{command:'push_status',wifi_signal:'-55'}});
 assert.equal(next.print.print_error,123);
 assert.equal(mergePrinterReport(next,{print:{command:'project_file',result:'success'}}),next);
});
test('accepted command alone does not mean started', async () => {
 const client=new EventEmitter();
 const watch=watchFileStart(client,'report','job',new AbortController().signal,20);
 emit(client,{command:'project_file',result:'success'});
 assert.equal((await watch.promise).started,false);
 assert.equal(client.listenerCount('message'),0);
});
test('only matching job state confirms start, including separate status deltas', async () => {
 const client=new EventEmitter();
 const watch=watchFileStart(client,'report','job',new AbortController().signal,100);
 emit(client,{command:'push_status',gcode_state:'RUNNING',subtask_name:'other'});
 emit(client,{command:'push_status',gcode_state:'IDLE',subtask_name:'job'});
 emit(client,{command:'push_status',gcode_state:'PREPARE'});
 assert.equal((await watch.promise).started,true);
});
test('firmware failure and cancellation are reported, never as a successful start', async () => {
 const client=new EventEmitter(), controller=new AbortController();
 let watch=watchFileStart(client,'report','job',controller.signal,100);
 emit(client,{command:'push_status',gcode_state:'FAILED',subtask_name:'job',print_error:42});
 assert.match((await watch.promise).error,/0x2a/);
 watch=watchFileStart(client,'report','job',controller.signal,100);
 controller.abort();
 assert.equal((await watch.promise).cancelled,true);
 assert.equal(client.listenerCount('message'),0);
});
