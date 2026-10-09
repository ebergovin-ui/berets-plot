import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speedProfile, upgradePlotProfile, orientPlotPoint } from '../src/plotProfile.js';
import { compilePlot } from '../src/plotJob.js';
const settings = { originX:23, originY:0, paperWidth:210, paperHeight:297, scale:1, bedWidth:256, bedHeight:256, penTipOffsetX:0, penTipOffsetY:-30, mountRevision:1, penOffsetX:0, penOffsetY:0, mirrorOutputX:true, mirrorOutputY:true, parkX:0, parkY:256, penDownZ:1, penUpZ:15, safeZ:15, penProtrusion:5, springTravel:20, ...speedProfile(5) };
test('speed slider maps 5 percent to 25 mm/s and clamps its endpoints', () => {
 assert.equal(speedProfile(5).feedrate,2490);
 assert.equal(speedProfile(100).feedrate,49800);
 assert.equal(speedProfile(-10).speedPercent,1);
 assert.equal(speedProfile(200).speedPercent,100);
});
test('legacy profiles get corrected orientation once; updated choices persist', () => {
 const upgraded=upgradePlotProfile({mirrorOutputX:false,mirrorOutputY:false,feedrate:1200});
 assert.equal(upgraded.mirrorOutputX,false); assert.equal(upgraded.mirrorOutputY,true); assert.equal(upgraded.speedPercent,5);
 const saved=upgradePlotProfile({...upgraded,mirrorOutputX:false,speedPercent:12});
 assert.equal(saved.mirrorOutputX,false); assert.equal(saved.speedPercent,12); assert.equal(saved.feedrate,5976);
});
test('both-axis reflection preserves the reachable A4 region and is reversible', () => {
 for (const point of [{x:23,y:0},{x:233,y:226},{x:38,y:20}]) {
  const reflected=orientPlotPoint(point,settings);
  assert.deepEqual(orientPlotPoint(reflected,settings),point);
  assert.ok(reflected.x>=23 && reflected.x<=233);
  assert.ok(reflected.y>=0 && reflected.y<=226);
 }
 assert.deepEqual(orientPlotPoint({x:38,y:20},settings),{x:218,y:206});
});
test('generated drawing reflects both axes and compensates the mount without changing Z', () => {
 const paths=[[{x:38,y:20},{x:48,y:30}].map(p=>orientPlotPoint(p,settings))];
 const job=compilePlot(paths,settings);
 assert.match(job.gcode,/G0 X218.00 Y236.00/);
 assert.match(job.gcode,/G1 X208.00 Y226.00 F2490/);
 for(const segment of job.segments.filter(s=>s.draw)) assert.equal(segment.to.z,1);
});

test('current migration changes width only and applies faster 10 mm lift once', () => {
 const next=upgradePlotProfile({...settings,orientationRevision:1,speedPercent:9});
 assert.equal(next.mirrorOutputX,false); assert.equal(next.mirrorOutputY,true);
 assert.equal(next.speedPercent,9); assert.equal(next.penUpZ,10); assert.equal(next.safeZ,10); assert.equal(next.zFeedrate,1200);
 assert.deepEqual(orientPlotPoint({x:38,y:20},next),{x:38,y:206});
 assert.equal(upgradePlotProfile({...next,penLiftMm:7,penUpZ:12,safeZ:12,zFeedrate:900}).penUpZ,12);
 const job=compilePlot([[{x:38,y:20},{x:48,y:30}].map(p=>orientPlotPoint(p,next))],next);
 assert.match(job.gcode,/G0 X38.00 Y236.00/);
 assert.match(job.gcode,/G0 Z10.00 F1200/);
 assert.match(job.gcode,/G0 Z1.00 F1200/);
 assert.ok(job.segments.filter(s=>s.from.z!==s.to.z).every(s=>Math.abs(s.to.z-s.from.z)===9 && Math.abs(s.seconds-0.65)<1e-9));
});

test('mount correction puts pen below nozzle and migrates old saved offset once',()=>{
 const next=upgradePlotProfile({...settings,penTipOffsetY:-30,mountRevision:undefined,motionRevision:1,orientationRevision:2,penUpZ:10,safeZ:10});
 assert.equal(next.penTipOffsetY,30);
 const p={x:50,y:80};
 const job=compilePlot([[p,{x:60,y:90}]],next);
 assert.match(job.gcode,/G0 X50.00 Y50.00/);
 assert.equal(upgradePlotProfile({...next,penTipOffsetY:25}).penTipOffsetY,25);
});
test('visible valid A4 ink stays on the bed after reflection with positive mount offset',()=>{
 const s={...settings,penTipOffsetY:30,mirrorOutputX:false,mirrorOutputY:true,penUpZ:1,safeZ:1,mountRevision:1};
 const logical=[[{x:23,y:35},{x:180,y:170}],[{x:50,y:30},{x:60,y:256}]];
 const reflected=logical.map(path=>path.map(p=>orientPlotPoint(p,s)));
 assert.deepEqual(reflected[0][0],{x:23,y:251});
 const job=compilePlot(reflected,s);
 assert.match(job.gcode,/G0 Z1.00/);
 assert.ok(job.segments.every(segment=>segment.to.x>=0&&segment.to.x<=256&&segment.to.y>=0&&segment.to.y<=256));
});

test('one millimetre clearance lifts the nozzle above the extended pen',()=>{
 const next=upgradePlotProfile({...settings,motionRevision:1,orientationRevision:2,penUpZ:1,safeZ:1});
 assert.equal(next.penLiftMm,1);assert.equal(next.penUpZ,6);
 assert.equal(upgradePlotProfile({...next,penLiftMm:2}).penUpZ,7);
});
