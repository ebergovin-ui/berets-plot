import {test} from 'node:test';
import assert from 'node:assert/strict';
import {switchTool} from '../src/toolProfiles.js';
import {speedProfile} from '../src/plotProfile.js';
import {compilePlot} from '../src/plotJob.js';
test('switching instruments preserves user clearance values and restores them',()=>{
 let s={toolKey:'pencil',penLiftMm:7,penDownZ:1,penProtrusion:5};
 s=switchTool(s,'pen');assert.equal(s.penLiftMm,1.5);
 s={...s,penLiftMm:2};s=switchTool(s,'marker');s=switchTool(s,'pencil');assert.equal(s.penLiftMm,7);
 s=switchTool(s,'pen');assert.equal(s.penLiftMm,2);
});
test('drawing boost does not multiply travel or Z commands',()=>{
 const s={bedWidth:256,bedHeight:256,penTipOffsetX:0,penTipOffsetY:0,penOffsetX:0,penOffsetY:0,parkX:0,parkY:256,penDownZ:1,penUpZ:7,safeZ:7,zFeedrate:1200,...speedProfile(100)};
 const gcode=compilePlot([[{x:50,y:50},{x:60,y:60}]],s).gcode;
 assert.match(gcode,/M220 S100/);assert.match(gcode,/G0 X50.00 Y50.00 F30000/);assert.match(gcode,/G1 X60.00 Y60.00 F49800/);assert.match(gcode,/G0 Z7.00 F1200/);
});
test('turbo maximizes drawing, travel and Z while preserving clearance and normal slider',()=>{
 const s={bedWidth:256,bedHeight:256,penTipOffsetX:0,penTipOffsetY:30,penOffsetX:0,penOffsetY:0,parkX:0,parkY:256,penDownZ:1,penUpZ:7,safeZ:7,zFeedrate:900,...speedProfile(17,true)};
 const job=compilePlot([[{x:50,y:50},{x:60,y:60}],[{x:50,y:80},{x:60,y:80}]],s);
 assert.match(job.gcode,/G0 X50.00 Y50.00 F49800/);
 assert.match(job.gcode,/G1 X60.00 Y30.00 F49800/);
 assert.match(job.gcode,/G0 Z7.00 F1200/);
 assert.equal(s.penUpZ,7);
 assert.equal(speedProfile(s.speedPercent,false).travelSpeed,5100);
 assert.equal(speedProfile(s.speedPercent,false).feedrate,8466);
});
