from pathlib import Path
from PIL import Image
import subprocess,json
R=Path(__file__).resolve().parents[1];out=R/'public/assets/animations/native';out.mkdir(parents=True,exist_ok=True)
raw=R/'research/native-actors';raw.mkdir(exist_ok=True)
meta=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {actorGeometry} from './src/actor-geometry.js'; console.log(JSON.stringify(actorGeometry))"],cwd=R))
p=R/'public/assets/manifest.json';m=json.loads(p.read_text())
m['sprites']['explosion']['anchor']={'x':0,'y':-1};m['sprites']['explosion']['loop']=False
def export(name,id,helmet=None):
 d=raw/name
 args=['java','-Xmx1g','-Djava.awt.headless=true','-cp',str(R/'research/flash-audit/tools/ffdec/ffdec.jar'),str(R/'scripts/assetsRender.java'),str(R/'research/flash-audit/downloads/memory-finder/digboy_save_v1.swf'),str(id),str(d),'-1' if name!='bossRage' else '1']
 if helmet is not None:args.append(str(helmet))
 subprocess.run(args,check=True,stdout=subprocess.DEVNULL)
 return d

def pack(name,files,origin,loop=True):
 ims=[Image.open(f).convert('RGBA') for f in files];boxes=[im.getbbox() for im in ims if im.getbbox()]
 assert boxes,name
 box=(min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes));dest=out/name;dest.mkdir(parents=True,exist_ok=True);urls=[]
 for i,im in enumerate(ims):
  f=dest/f'{i:03}.png';im.crop(box).save(f,optimize=True);urls.append('/assets/animations/native/'+str(f.relative_to(out)))
 return {'frames':urls,'width':box[2]-box[0],'height':box[3]-box[1],'anchor':{'x':origin['originX']-box[0],'y':origin['originY']-box[1]},'fps':30,'loop':loop}
for name,id in [('dragon',299),('dragon2',287),('dragon3',274),('bigDragon',261),('bigDragon2',247),('boss',697),('subBoss',662),('bossArm',813),('player',543)]:
 variants=range(6) if name=='player' else [None]
 for tier in variants:
  dest=export(name+(f'-{tier}' if tier is not None else ''),id,tier)
  origin=json.loads((dest/'meta.json').read_text());states={}
  labels=['idle','walk','run','digDown','digLeft','digSide','boost','dead','hurt','revive'] if name=='player' else ['move','dead','idle','jump','attack','summon'] if name in ['boss','subBoss'] else ['idle','move','dead']
  for i,label in enumerate(labels):
   files=sorted((dest/str(i+1)).glob('*.png'),key=lambda p:int(p.stem));assert len(files)==len(meta[name]['states'][i]['frames']),(name,i,len(files))
   states[label]=pack(name+(f'-{tier}' if tier is not None else '')+'/'+label,files,origin,meta[name]['states'][i]['loop'])
  if name=='player':
   if tier==0:m['sprites'][name]['states']=states
   else:m['sprites'][name]['helmetVariants'][str(tier)]=states
  else:m['sprites'][name]={**states['idle'],'states':states}
  print(name,tier,[(k,len(v['frames'])) for k,v in states.items()],flush=True)
 d=export('bossRage',631) if name=='player' else None
 if d:
  origin=json.loads((d/'meta.json').read_text());m['sprites']['bossRage']=pack('bossRage',[d/str(i)/'1.png' for i in range(1,14)],origin)
 p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
