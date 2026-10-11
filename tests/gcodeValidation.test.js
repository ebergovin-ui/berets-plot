import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateGCodeLocally} from '../src/gcodeValidation.js';
import {compilePlot} from '../src/plotJob.js';
import {speedProfile} from '../src/plotProfile.js';
const settings={bedWidth:256,bedHeight:256,penTipOffsetX:0,penTipOffsetY:30,penOffsetX:0,penOffsetY:0,parkX:0,parkY:256,penDownZ:1,penUpZ:7,safeZ:7,zFeedrate:1200};
test('browser accepts full generated native speed jobs with turbo on and off',()=>{
 for(const turbo of [false,true]) {
  const job=compilePlot([[{x:40,y:60},{x:50,y:70}]],{...settings,...speedProfile(100,turbo)});
  const validation=validateGCodeLocally(job.gcode,{allowHome:true});
  assert.deepEqual(validation.errors,[]);assert.equal(validation.ok,true);
 }
});
test('browser keeps blocking unrelated machine commands and unsafe heaters',()=>{
 for(const gcode of ['M1002 gcode_claim_action : 1','M204.2 K100','M104 S200','G1 Z-1'])assert.equal(validateGCodeLocally(gcode).ok,false);
});
