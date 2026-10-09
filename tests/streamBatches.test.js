import {test} from 'node:test';
import assert from 'node:assert/strict';
import {batchGCodeLines} from '../server/streamBatches.js';
import {compilePlot} from '../src/plotJob.js';
import {readFileSync} from 'node:fs';
test('batching preserves all commands in order and leaves home/wait boundaries intact',()=>{
 const lines=['G28','M400',...Array.from({length:210},(_,i)=>`G1 X${i}.00 Y20 F1500`),'M400'];
 const batches=batchGCodeLines(lines);
 assert.deepEqual(batches.flat(),lines);
 assert.deepEqual(batches[0],['G28']);assert.deepEqual(batches[1],['M400']);
 assert.ok(batches.every(b=>b.length<=96 && Buffer.byteLength(b.join('\n')+'\n')<=4096));
 assert.ok(batches.length<10);
});
test('closed contour stays continuous without per-stroke waits',()=>{
 const s={bedWidth:256,bedHeight:256,penTipOffsetX:0,penTipOffsetY:0,penOffsetX:0,penOffsetY:0,parkX:0,parkY:256,penDownZ:1,penUpZ:10,safeZ:10,feedrate:1500,travelSpeed:1500,zFeedrate:1200};
 const circle=Array.from({length:49},(_,i)=>({x:50+10*Math.cos(i*Math.PI/24),y:50+10*Math.sin(i*Math.PI/24)}));
 const lines=compilePlot([circle,circle],s).gcode.split('\n').filter(l=>l&&!l.startsWith(';'));
 assert.equal(lines.filter(l=>l==='M400').length,3);
 const batch=batchGCodeLines(lines).find(b=>b.some(l=>l.startsWith('G1')));
 assert.ok(batch.filter(l=>l.startsWith('G1')).length>=48);
});
test('standard font outlines include lowercase Cyrillic and two closed O contours',()=>{
 const fonts=JSON.parse(readFileSync(new URL('../src/standardFonts.json',import.meta.url)));
 for(const font of Object.values(fonts)){
  for(const char of 'ОоПриветArialTimes') assert.ok(font[char].paths.length);
  assert.equal(font.O.paths.length,2);
  for(const path of font.O.paths) assert.deepEqual(path[0],path.at(-1));
  assert.notDeepEqual(font.А.paths,font.а.paths);
 }
});
