"""Pack the original 50-frame StatusBar export (sprite 204, one frame per state)."""
from pathlib import Path
from PIL import Image
import json
root=Path(__file__).resolve().parents[1]
source=root/'research/native-boss-hp'
out=root/'public/assets/animations/native/bossHp';out.mkdir(parents=True,exist_ok=True)
frames=[]
for i in range(1,51):
    dest=out/f'{i-1:03}.png'
    Image.open(source/str(i)/'1.png').save(dest,optimize=True)
    frames.append('/assets/animations/native/bossHp/'+dest.name)
meta=json.loads((source/'meta.json').read_text())
p=root/'public/assets/manifest.json';manifest=json.loads(p.read_text())
manifest['sprites']['bossHp']={'frames':frames,'width':370,'height':81,'anchor':{'x':meta['originX'],'y':meta['originY']},'fps':30,'loop':False}
p.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
