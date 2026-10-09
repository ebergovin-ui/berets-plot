export const PT_MM = 25.4 / 72;
export function layoutDocument(item, glyph) {
 const size = Math.max(1, Number(item.fontSizePt) || 12) * PT_MM;
 const scale=size/22, spacing=Number(item.letterSpacingPt||0)*PT_MM;
 const left=Number(item.indentPt||0)*PT_MM;
 const width=Math.max(1,item.object.w-left);
 const advance=c=>((glyph(c)?.width ?? 10)*scale)+spacing;
 const measure=text=>[...text].reduce((sum,c)=>sum+advance(c),0);
 let y=Number(item.paragraphBeforePt||0)*PT_MM;
 const paths=[];
 item.text.split('\n').forEach((paragraph,index)=>{
  const prefix=item.listStyle==='numbered'?`${index+1}. `:item.listStyle==='bullets'?'• ':'';
  const text=prefix+paragraph;
  const lines=[];let line='';
  for(const word of text.split(/\s+/)) {
   const candidate=line?line+' '+word:word;
   if(line&&measure(candidate)>width){lines.push(line);line='';}
   for(const char of word){if(line&&measure(line+char)>width){lines.push(line);line='';}line+=char;}
   line+=' ';
  }
  lines.push(line.trimEnd());
  lines.forEach((line,lineIndex)=>{
   const lineWidth=measure(line), gaps=[...line].filter(c=>c===' ').length;
   const justify=item.align==='justify'&&lineIndex<lines.length-1&&gaps>0?Math.max(0,(width-lineWidth)/gaps):0;
   let x=left+(item.align==='center'?Math.max(0,(width-lineWidth)/2):item.align==='right'?Math.max(0,width-lineWidth):0);
   const startX=x;
   for(const char of line){const data=glyph(char);if(data)for(const path of data.paths)paths.push(path.map(p=>({x:x+p.x*scale,y:y+p.y*scale})));x+=advance(char)+(char===' '?justify:0);}
   if(line.trim() && item.underline) paths.push([{x:startX,y:y+size*1.05},{x:x-spacing,y:y+size*1.05}]);
   if(line.trim() && item.strike) paths.push([{x:startX,y:y+size*.5},{x:x-spacing,y:y+size*.5}]);
   y+=size*1.2*(Number(item.lineSpacing)||1);
  });
  y+=Number(item.paragraphAfterPt||0)*PT_MM;
  if(index<item.text.split('\n').length-1)y+=Number(item.paragraphBeforePt||0)*PT_MM;
 });
 return {paths,height:y,width:item.object.w};
}
