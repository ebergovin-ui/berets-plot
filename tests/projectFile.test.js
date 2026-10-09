import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from '../src/projectFile.js';
const project = {format:'berets-plot',version:1,settings:{},textItems:[{id:'t',text:'TEST',fontKey:'simplex',object:{x:0,y:0,w:20,h:10,angle:0}}],shapes:[],layers:[],drawPaths:[[{x:1,y:1},{x:2,y:2}]]};
test('valid project structure round-trips through JSON',()=>assert.ok(validateProject(JSON.parse(JSON.stringify(project)))));
test('reject incompatible and corrupt project data',()=>{ for(const data of [null,{}, {...project,version:2},{...project,textItems:[null]},{...project,drawPaths:[[{x:'bad',y:1}]]},{...project,layers:[{name:'bad'}]}]) assert.equal(validateProject(data),false); });
