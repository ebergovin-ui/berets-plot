import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePaper, resizeObject} from '../src/editorGeometry.js';
test('full A4 remains 210 by 297 on a 256 mm bed',()=>{const paper=normalizePaper({bedWidth:256,bedHeight:256,paperWidth:210,paperHeight:297,originX:23,originY:0});assert.equal(paper.paperHeight,297);assert.equal(paper.originX,23);assert.equal(paper.originY,0);});
test('dragging top left keeps opposite corner fixed',()=>{const out=resizeObject({x:20,y:20,w:100,h:50,angle:0},{x:10,y:15},'tl');assert.equal(out.x+out.w,120);assert.equal(out.y+out.h,70);assert.equal(out.x,10);});
test('dragging bottom right cannot invert the rectangle',()=>{const out=resizeObject({x:20,y:20,w:100,h:50,angle:0},{x:0,y:0},'br');assert.equal(out.x,20);assert.ok(out.w>=8);assert.ok(out.h>=4);});
