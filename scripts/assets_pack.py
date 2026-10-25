"""Package extracted original bitmap/sound assets and baked SWF frames for Canvas."""
from pathlib import Path
from PIL import Image
import json,shutil
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'public/assets'; SOURCE=ROOT/'research/flash-audit/decompiled/korean'; RAW=ROOT/'research/asset-notes-cache'
manifest={'version':1,'source':'Digger Boy Kung preserved Flash assets; local study build','images':{},'sprites':{},'sounds':{}}
def info(path):
 im=Image.open(path);return {'src':'/assets/'+str(path.relative_to(OUT)),'width':im.width,'height':im.height}
(OUT/'images').mkdir(parents=True,exist_ok=True)
for f in (SOURCE/'images').glob('*'):
 key=f.stem.split('_',1)[-1] if '_' in f.stem else f.stem
 dest=OUT/'images'/f.name;shutil.copy2(f,dest);manifest['images'][key]=info(dest)
# Preserve the original Chinese localized image variants.
for f in (ROOT/'research/flash-audit/decompiled/chinese-language/images').glob('*'):
 dest=OUT/'images'/('zh-'+f.name);shutil.copy2(f,dest);manifest['images']['zh-'+f.stem]=info(dest)
for alias,key in {'titleMachineBody':'250','titleNewGame':'241','titleContinue':'253','titleHelp':'262','titleArtworkChinese':'289','inventoryButtonChinese':'165','airFrameChinese':'174','sellLabelChinese':'147','saveLabelChinese':'219','scrollPanelChinese':'159','helpChinese':'265'}.items():
 manifest['images'][alias]=manifest['images']['zh-'+key]
for alias,key in {'sky1':'1484','sky2':'1487','sky3':'1489','surfaceHills':'1485','titleBackdrop':'715','titleArtwork':'1646','gameOverBackdrop':'1525','inventoryPanel':'956','shopPanel':'1343','hudPanel':'1330','scrollPanel':'836','menuTop':'713','menuBottom':'714'}.items():
 manifest['images'][alias]=manifest['images'][key]
(OUT/'sounds').mkdir(exist_ok=True)
for f in (SOURCE/'sounds').glob('*'):
 if '$' not in f.name:continue
 key=f.stem.split('$',1)[-1];dest=OUT/'sounds'/(key+f.suffix);shutil.copy2(f,dest);manifest['sounds'][key]='/assets/sounds/'+dest.name

def pack(name,files,origin=None,group='sprites'):
 ims=[Image.open(f).convert('RGBA') for f in files]; boxes=[x.getbbox() for x in ims if x.getbbox()]
 if not boxes:return None
 box=(min(x[0] for x in boxes),min(x[1] for x in boxes),max(x[2] for x in boxes),max(x[3] for x in boxes))
 # Prefer origin of original SWF for player; all other actors use explicit feet center.
 anchor={'x':(origin[0] if origin else (box[0]+box[2])/2)-box[0],'y':(origin[1] if origin else box[3])-box[1]}
 folder=OUT/group/name;folder.mkdir(parents=True,exist_ok=True);urls=[]
 for i,im in enumerate(ims):
  dest=folder/f'{i:02}.png';im.crop(box).save(dest,optimize=True);urls.append('/assets/'+str(dest.relative_to(OUT)))
 return {'frames':urls,'width':box[2]-box[0],'height':box[3]-box[1],'anchor':anchor,'fps':30}
def ordered(p):return sorted(p.glob('*.png'),key=lambda f:int(f.stem))
manifest['sprites']['player']={'states':{}}
for state,idx in {'idle':1,'walk':2,'run':3,'digDown':4,'digLeft':5,'digSide':6,'boost':7,'dead':8,'hurt':9,'revive':10}.items():
 files=ordered(RAW/'animation-raw/player'/str(idx))
 manifest['sprites']['player']['states'][state]=pack('player/'+state,files,(60,100),'animations')
manifest['sprites']['player']['nativeFacing']='right'
manifest['sprites']['player']['helmetVariants']={}
for level in range(1,6):
 root=RAW/'animation-raw'/('player-helmet'+str(level))
 if not root.exists():continue
 states={}
 for state,idx in {'idle':1,'walk':2,'run':3,'digDown':4,'digLeft':5,'digSide':6,'boost':7,'dead':8,'hurt':9,'revive':10}.items():
  states[state]=pack('player-helmet'+str(level)+'/'+state,ordered(root/str(idx)),(60,100),'animations')
 manifest['sprites']['player']['helmetVariants'][str(level)]=states
for key,folder in {'portal':'150_Portal','airStation':'220_AirStation','bonusBox':'245_BonusBox','dragon':'299_Dragon','dragon2':'287_Dragon2','dragon3':'274_Dragon3','bigDragon':'261_BigDragon','bigDragon2':'247_BigDragon2','boss':'697_Boss','subBoss':'662_SubBoss','bossArm':'813_BossArm','bossRoom':'802_BossRoom','bomb':'381_Bomb','dynamite':'373_Dinamite','superBomb':'375_DBomb','explosion':'372_Bomb-Explode','rockExplosion':'382_Dinamite-Explode'}.items():
 files=ordered(RAW/'sprites'/('DefineSprite_'+folder))
 if files:manifest['sprites'][key]=pack(key,files,group='animations')
for key in ['shop','doctor','girlfriend']:
 files=ordered(RAW/'animation-raw'/key/'1')
 if files:manifest['sprites'][key]=pack(key,files,group='animations')
# Actor top-level frames are state selectors, not animation frames.
for key in ['dragon','dragon2','dragon3','bigDragon','bigDragon2','boss','subBoss','portal']:
 root=RAW/'animation-raw'/key
 if not root.exists():continue
 states={}
 origin_meta=json.loads((root/'meta.json').read_text())
 origin=(origin_meta['originX'],origin_meta['originY'])
 for folder in sorted((x for x in root.iterdir() if x.is_dir()),key=lambda x:int(x.name)):
  label={1:'idle',2:'move',3:'dead'}.get(int(folder.name),'state'+folder.name) if key not in ('boss','subBoss') else {1:'move',2:'dead',3:'idle',4:'jump',5:'attack',6:'summon'}.get(int(folder.name),folder.name)
  states[label]=pack(key+'/'+label,ordered(folder),origin=origin,group='animations')
 base=dict(states['idle']);base['states']=states;manifest['sprites'][key]=base
# Compose the original Chinese menu body with the original rotating roof.
body=Image.open(OUT/'images/zh-250.png').convert('RGBA')
roof_files=[folder/'1.png' for folder in sorted((x for x in (RAW/'animation-raw/titleMachine').iterdir() if x.is_dir()),key=lambda x:int(x.name))]
assembled=RAW/'animation-raw/titleAssembled';assembled.mkdir(exist_ok=True)
for i,f in enumerate(roof_files):
 roof=Image.open(f).convert('RGBA');im=Image.new('RGBA',(body.width,body.height+42));im.alpha_composite(body,(0,42));im.alpha_composite(roof,((body.width-roof.width)//2,0));im.save(assembled/f'{i}.png')
manifest['sprites']['titleMachine']=pack('titleMachine',ordered(assembled),group='animations')
manifest['cutscenes']={}
for folder in (OUT/'cutscenes').iterdir():
 fs=sorted(folder.rglob('*.png'))
 if fs:manifest['cutscenes'][folder.name]=[info(f) for f in fs]
for key,folder in {'originalMenu':'727_PopupSelect','originalHud':'1342_StatusView','originalInventory':'1089_Inventory'}.items():
 fs=ordered(RAW/'ui-raw'/('DefineSprite_'+folder))
 if fs:manifest['sprites'][key]=pack(key,fs[:1],group='animations')
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print('Packaged',len(manifest['images']),'images',len(manifest['sprites']),'sprite groups',len(manifest['sounds']),'sounds')
