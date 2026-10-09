const arc=(cx,cy,rx,ry,start=0,end=Math.PI*2,n=32)=>Array.from({length:n+1},(_,i)=>({x:cx+rx*Math.cos(start+(end-start)*i/n),y:cy+ry*Math.sin(start+(end-start)*i/n)}));
const line=(...coords)=>coords.map(([x,y])=>({x,y}));
const face=arc(11,11,10,10),eyes=[arc(7,8,.7,.7),arc(15,8,.7,.7)];
const smile=arc(11,11,5,5,.15,Math.PI-.15,16),sad=arc(11,18,5,4,Math.PI+.2,2*Math.PI-.2,16);
const happy=[face,...eyes,smile],laugh=[face,...eyes,arc(11,14,5,4)];
export const emojiGlyphs={
 '🙂':happy,'😊':happy,'☺':happy,'😀':laugh,'😃':laugh,'😄':laugh,'😁':laugh,
 '😉':[face,eyes[0],line([13,8],[17,8]),smile],
 '😢':[face,...eyes,sad,arc(17,13,1,2)],'🙁':[face,...eyes,sad],'☹':[face,...eyes,sad],
 '😐':[face,...eyes,line([6,16],[16,16])],
 '❤':[[...arc(7,7,5,5,Math.PI,2*Math.PI,16),...arc(15,7,5,5,Math.PI,2*Math.PI,16),{x:11,y:21},{x:2,y:7}]],
 '♥':[[{x:11,y:21},{x:2,y:8},{x:2,y:4},{x:7,y:2},{x:11,y:7},{x:15,y:2},{x:20,y:4},{x:20,y:8},{x:11,y:21}]],
 '★':[Array.from({length:11},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,r=i%2?4:10;return{x:11+r*Math.cos(a),y:11+r*Math.sin(a)};})],
 '☀':[arc(11,11,5,5),...Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return line([11+7*Math.cos(a),11+7*Math.sin(a)],[11+10*Math.cos(a),11+10*Math.sin(a)]);})],
};
export const normalizeEmojiText=text=>text.replace(/[\uFE0E\uFE0F]/g,'');
