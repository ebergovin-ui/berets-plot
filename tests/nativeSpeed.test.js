import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeSpeedLines,isNativeSpeedLine} from '../src/nativeSpeed.js';
import {createCommandClock} from '../src/motionTiming.js';
test('only native normal and ludicrous speed presets are admitted',()=>{
 for(const line of [...nativeSpeedLines(),...nativeSpeedLines(true)])assert.ok(isNativeSpeedLine(line));
 for(const line of ['M204.2 K100','M1002 gcode_claim_action : 1','M73.2 R0.60 G28','M1002 set_gcode_claim_speed_level : 9'])assert.equal(isNativeSpeedLine(line),false);
});
test('stream timing follows native multiplier and reset for subsequent travel',()=>{
 const clock=createCommandClock();
 const normal=clock(['G1 X100 F600']);
 const fast=clock(['M220 K2.00','G1 X0 F600']);
 const reset=clock(['M220 K1.00','G1 X100 F600']);
 assert.ok(fast<normal);assert.equal(reset,normal);
});
