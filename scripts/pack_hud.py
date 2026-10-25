"""Pack hudExport.java outputs without resampling the native 640×480 art."""
import json
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[1]
source = root / 'research/hud-native'
out = root / 'public/assets/hud'
out.mkdir(parents=True, exist_ok=True)
meta = {}
for name in ['panel', 'quick', 'inventory', 'score-label', 'hp']:
    im = Image.open(source / name / ('100.png' if name == 'hp' else '0.png'))
    # Preserve panel/tray coordinates. The button and fill have empty export padding.
    if name in ['inventory', 'hp']:
        im = im.crop(im.getbbox())
    im.save(out / f'{name}.png', optimize=True)
    meta[name] = {'src': f'/assets/hud/{name}.png', 'width': im.width, 'height': im.height}
for name, count in [('air',101), ('score-digits',11), ('depth-digits',10)]:
    first = Image.open(source / name / '0.png')
    w,h=first.size
    cols=min(11,count)
    sheet=Image.new('RGBA',(w*cols,h*((count+cols-1)//cols)))
    for i in range(count):
        sheet.paste(Image.open(source/name/f'{i}.png'),((i%cols)*w,(i//cols)*h))
    sheet.save(out/f'{name}.png',optimize=True)
    meta[name]={'src':f'/assets/hud/{name}.png','width':w,'height':h,'columns':cols,'count':count}
p=root/'public/assets/manifest.json'
m=json.loads(p.read_text()); m['hud']=meta
p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
