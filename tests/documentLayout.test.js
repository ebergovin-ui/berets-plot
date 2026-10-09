import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutDocument,PT_MM} from '../src/documentLayout.js';
const glyph=c=>({width:11,paths:c===' '?[]:[[{x:0,y:0},{x:11,y:22}]]});
const item={text:'AB\nCD',object:{w:100},fontSizePt:12};
test('point size maps to millimetres without fitting text back into the box',()=>{
 const a=layoutDocument(item,glyph),b=layoutDocument({...item,fontSizePt:24},glyph);
 assert.ok(Math.abs(a.paths[0][1].y-12*PT_MM)<1e-9);
 assert.equal(b.paths[0][1].y,2*a.paths[0][1].y);
});
test('line spacing and paragraph intervals move following lines',()=>{
 const a=layoutDocument(item,glyph),b=layoutDocument({...item,lineSpacing:2,paragraphAfterPt:6},glyph);
 assert.ok(Math.abs(b.paths[2][0].y-(2*a.paths[2][0].y+6*PT_MM))<1e-9);
});
test('alignment and indent use the actual text block width',()=>{
 const right=layoutDocument({...item,align:'right'},glyph);
 const center=layoutDocument({...item,align:'center'},glyph);
 assert.ok(right.paths[0][0].x>center.paths[0][0].x);
 assert.equal(layoutDocument({...item,indentPt:10},glyph).paths[0][0].x,10*PT_MM);
});
test('narrow blocks wrap long words and preserve every glyph',()=>{
 const result=layoutDocument({...item,text:'ABCDEFG',object:{w:5}},glyph);
 assert.equal(result.paths.length,7);assert.ok(result.paths.at(-1)[0].y>0);
});
test('underline and strike create drawing paths in the same coordinates',()=>{
 const plain=layoutDocument({...item,text:'AB'},glyph);
 const decorated=layoutDocument({...item,text:'AB',underline:true,strike:true},glyph);
 assert.equal(decorated.paths.length,plain.paths.length+2);
 assert.equal(decorated.paths.at(-1)[0].y,12*PT_MM*.5);
});
