"""Generate plot outlines from installed, freely licensed Liberation fonts."""
import json, math
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
class PlotPen(BasePen):
 def __init__(self,glyphs,scale):
  super().__init__(glyphs); self.scale=scale; self.paths=[]; self.path=[]
 def point(self,p): return {'x':round(p[0]*self.scale,4),'y':round(-p[1]*self.scale,4)}
 def _moveTo(self,p):
  self._endPath(); self.path=[self.point(p)]
 def _lineTo(self,p): self.path.append(self.point(p))
 def _curveToOne(self,a,b,c):
  p=self._getCurrentPoint(); length=sum(math.dist(x,y) for x,y in [(p,a),(a,b),(b,c)])*self.scale
  n=max(4,min(128,math.ceil(length/.35)))
  for i in range(1,n+1):
   t=i/n; u=1-t; self.path.append(self.point(tuple(u**3*p[j]+3*u*u*t*a[j]+3*u*t*t*b[j]+t**3*c[j] for j in (0,1))))
 def _qCurveToOne(self,a,b):
  p=self._getCurrentPoint(); n=max(4,min(128,math.ceil((math.dist(p,a)+math.dist(a,b))*self.scale/.35)))
  for i in range(1,n+1):
   t=i/n; u=1-t; self.path.append(self.point(tuple(u*u*p[j]+2*u*t*a[j]+t*t*b[j] for j in (0,1))))
 def _closePath(self):
  if self.path and self.path[-1]!=self.path[0]: self.path.append(self.path[0].copy())
  self._endPath()
 def _endPath(self):
  if len(self.path)>1: self.paths.append(self.path)
  self.path=[]
result={}
for key,file in [('arial','LiberationSans-Regular.ttf'),('times-new-roman','LiberationSerif-Regular.ttf'),('caveat','Caveat.ttf')]:
 font=TTFont('public/fonts/Caveat.ttf' if key=='caveat' else '/usr/share/fonts/truetype/liberation/'+file); glyphs=font.getGlyphSet(); cmap=font.getBestCmap(); scale=22/font['head'].unitsPerEm
 chars={}
 for code in list(range(32,127))+list(range(0x400,0x500))+[0x2022,0x2014,0x2013]:
  if code not in cmap: continue
  name=cmap[code]; pen=PlotPen(glyphs,scale); glyphs[name].draw(pen);pen._endPath()
  chars[chr(code)]={'paths':pen.paths,'width':font['hmtx'][name][0]*scale}
 result[key]=chars
with open('src/standardFonts.json','w') as f: json.dump(result,f,separators=(',',':'),ensure_ascii=False)
