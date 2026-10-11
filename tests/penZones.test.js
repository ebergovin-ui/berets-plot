import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reachablePenBounds, unreachablePenZones } from '../src/plotProfile.js';
const settings={bedWidth:256,bedHeight:256,penTipOffsetX:0,penTipOffsetY:30,penOffsetX:0,penOffsetY:0};
test('30 mm mount leaves an exact 30 mm upper strip and 226 mm available height',()=>{
 assert.deepEqual(reachablePenBounds(settings),{minX:0,minY:30,maxX:256,maxY:256});
 assert.deepEqual(unreachablePenZones(settings),[{x:0,y:0,width:256,height:30}]);
});
test('preview bands include fine compensation and opposite mounting direction',()=>{
 assert.deepEqual(unreachablePenZones({...settings,penOffsetY:5}),[{x:0,y:0,width:256,height:25}]);
 assert.deepEqual(unreachablePenZones({...settings,penTipOffsetY:-30}),[{x:0,y:226,width:256,height:30}]);
});
