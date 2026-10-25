"""Extract reusable menu surfaces from original art; Chinese labels stay live text."""
from pathlib import Path
from PIL import Image, ImageOps
root=Path(__file__).resolve().parents[1]
out=root/'public/assets/menus';out.mkdir(exist_ok=True)
im=Image.open(root/'public/assets/images/956.png').convert('RGBA')
metal=im.crop((50,200,178,328));metal.save(out/'metal.png',optimize=True)
# Nine-slice frame: retain original rivets and welded edges at native size.
frame=Image.new('RGBA',(128,128));frame.paste(metal,(0,0))
edge=im.crop((40,18,136,34));corner=im.crop((9,17,25,33))
frame.paste(edge,(16,0));frame.paste(ImageOps.flip(edge),(16,112))
frame.paste(edge.rotate(90,expand=True),(0,16));frame.paste(edge.rotate(270,expand=True),(112,16))
frame.paste(corner,(0,0));frame.paste(ImageOps.mirror(corner),(112,0));frame.paste(ImageOps.flip(corner),(0,112));frame.paste(ImageOps.flip(ImageOps.mirror(corner)),(112,112))
frame.save(out/'frame.png',optimize=True)
for i,name in enumerate(['slot','slot-locked']):
 Image.open(root/f'research/menu-native/slots/{i}.png').save(out/f'{name}.png',optimize=True)
# Blank CRT plate for localized title buttons, taken from the original instrument glass.
glass=Image.open(root/'public/assets/hud/panel.png').convert('RGBA')
glass.crop((140,70,146,76)).save(out/'screen.png',optimize=True)
print('Packed original menu frame, metal, item slots and CRT texture.')
