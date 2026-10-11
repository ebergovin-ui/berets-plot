import {test} from 'node:test';
import assert from 'node:assert/strict';
import {composeScenePaths,commitDrawPath} from '../src/scenePaths.js';
const old=[{x:30,y:40},{x:35,y:45}],text=[{x:50,y:60},{x:55,y:65}],pen=[{x:60,y:80},{x:90,y:100}];
test('new text and pen paths remain visible and exportable when a saved layer exists',()=>{
 const layers=[{order:0,enabled:true,paths:[old]}];
 assert.deepEqual(composeScenePaths(layers,[text,pen]),[old,text,pen]);
 assert.deepEqual(composeScenePaths(layers,[old,text,pen]),[old,text,pen]);
});
test('disabled layers stay hidden without hiding new live geometry',()=>{
 assert.deepEqual(composeScenePaths([{order:0,enabled:false,paths:[old]}],[old,pen]),[pen]);
});
test('empty stored layers do not suppress live paths',()=>{
 assert.deepEqual(composeScenePaths([{order:0,enabled:true,paths:[]}],[text,pen]),[text,pen]);
});
test('committing a stroke captures its index before pointer refs are reset',()=>{
 const ref={current:1},index=ref.current;ref.current=null;
 const paths=[old,[pen[0]]];
 assert.deepEqual(commitDrawPath(paths,index,pen),[old,pen]);
 assert.deepEqual(paths,[old,[pen[0]]]);
 assert.deepEqual(commitDrawPath(paths,index,[pen[0]]),[old]);
});
