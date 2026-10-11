// Conservative trapezoidal estimate; not measured firmware completion time.
export function moveSeconds(length, feed, acceleration=2000) {
 if(!length)return 0;
 const speed=feed/60;
 return length<=speed*speed/acceleration?2*Math.sqrt(length/acceleration):length/speed+speed/acceleration;
}
export function createCommandClock() {
 let position={x:0,y:0,z:0},feed=1200, nativeFactor=1, percentFactor=1;
 return lines=>lines.reduce((seconds,line)=>{
  if(/^M220\s/.test(line)){const k=line.match(/\bK([\d.]+)/),s=line.match(/\bS([\d.]+)/);if(k)nativeFactor=Number(k[1]);if(s)percentFactor=Number(s[1])/100;return seconds;}
  if(/^G28\b/.test(line)){position={x:0,y:0,z:0};return seconds+35;}
  if(!/^G[01]\s/.test(line))return seconds;
  const target={...position};
  for(const [,axis,value] of line.matchAll(/\b([XYZF])(-?[\d.]+)/g)){
   if(axis==='F')feed=Number(value);else target[axis.toLowerCase()]=Number(value);
  }
  const z=Math.abs(target.z-position.z),xy=Math.hypot(target.x-position.x,target.y-position.y);
  position=target;return seconds+moveSeconds(Math.hypot(xy,z),feed*nativeFactor*percentFactor,z?100:2000);
 },0);
}
