"""Compile preserved Chinese timelines into native HTML5 video, with original audio cues."""
from pathlib import Path
import subprocess,json,sys
ROOT=Path(__file__).resolve().parents[1]
JAR=ROOT/'research/flash-audit/tools/ffdec/ffdec.jar'
SOURCE=ROOT/'research/flash-audit/downloads/mhhf/game'
WORK=ROOT/'research/native-cutscenes'
OUT=ROOT/'public/movies/zh-CN';OUT.mkdir(parents=True,exist_ok=True)
reuse='--reuse-video' in sys.argv
names=[a for a in sys.argv[1:] if a!='--reuse-video'] or ['opening',*[f'quest{i}' for i in range(1,8)],'loading1','loading2','loading3','ending_happy','ending_not']
manifest={}
manifest_path=ROOT/'public/data/movies.json'
if manifest_path.exists():manifest=json.loads(manifest_path.read_text())
for name in names:
 src=SOURCE/f'ogoon_{name}.swf';work=WORK/name;work.mkdir(parents=True,exist_ok=True)
 if not (work/'sounds').exists():
  subprocess.run(['java','-Djava.awt.headless=true','-jar',str(JAR),'-export','script,sound',str(work),str(src)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
 video=work/'video.mp4'
 render=['java','-Xmx2g','-Djava.awt.headless=true','-cp',str(JAR),str(ROOT/'scripts/renderMovie.java'),str(src),str(work/'timeline.json')]
 if reuse and video.exists():
  subprocess.run(render+['0'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
 else:
  with (work/'render.log').open('w') as log:
   r=subprocess.Popen(render,stdout=subprocess.PIPE,stderr=log)
   enc=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(video)],stdin=r.stdout)
   r.stdout.close();result=r.wait()
   if result or enc.returncode:raise RuntimeError(f'{name} render failed; see {work}/render.log')
 meta=json.loads((work/'timeline.json').read_text());duration=meta['frames']/meta['fps']
 cues=[]
 stream=work/'sounds/-1.mp3'
 if stream.exists() and meta['streamStart']>=0:cues.append({'id':-1,'frame':meta['streamStart'],'loops':1,'in':0,'out':-1})
 for i,cue in enumerate(meta['cues']):
  if cue['stop']:continue
  cue=dict(cue)
  stops=[c['frame']/meta['fps'] for c in meta['cues'][i+1:] if c['id']==cue['id'] and c['stop']]
  cue['end']=min(stops) if stops else duration
  cues.append(cue)
 inputs=['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(video)];filters=[];labels=[]
 for cue in cues:
  matches=list((work/'sounds').glob(str(cue['id'])+'.*'))
  if not matches:continue
  idx=len(labels)+1;inputs+=['-stream_loop',str(max(0,min(cue['loops']-1,100))),'-i',str(matches[0])]
  start=cue['frame']/meta['fps'];end=min(duration,cue.get('end',duration));length=max(.001,end-start)
  if cue['out']>=0:length=min(length,(cue['out']-cue['in'])/44100)
  gain=''
  if cue.get('envelope'):
   def expr(channel):
    points=cue['envelope'];result=str(points[-1][channel]/32768)
    for a,b in reversed(list(zip(points,points[1:]))):
     t0=a[0]/44100;t1=b[0]/44100;v0=a[channel]/32768;v1=b[channel]/32768
     segment=f'{v0}+({v1-v0})*(t+{cue["in"]/44100}-{t0})/{max(.000001,t1-t0)}'
     result=f'if(lt(t+{cue["in"]/44100},{t1}),{segment},{result})'
    return f'if(lt(t+{cue["in"]/44100},{points[0][0]/44100}),{points[0][channel]/32768},{result})'
   gain=f",aformat=channel_layouts=stereo,aeval=exprs='val(0)*({expr(1)})|val(1)*({expr(2)})'"
  filters.append(f'[{idx}:a]atrim=start={cue["in"]/44100}:duration={length},asetpts=PTS-STARTPTS{gain},adelay={round(start*1000)}:all=1[a{idx}]');labels.append(f'[a{idx}]')
 if labels:
  filters.append(''.join(labels)+f'amix=inputs={len(labels)}:normalize=0,alimiter=limit=0.95,apad[a]')
  inputs+=['-filter_complex',';'.join(filters),'-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','160k','-t',str(duration)]
 else:inputs+=['-c:v','copy','-an']
 dest=OUT/f'{name}.mp4';inputs+=['-movflags','+faststart',str(dest)];subprocess.run(inputs,check=True)
 manifest[name]={'zh-CN':{'src':f'/movies/zh-CN/{name}.mp4','frames':meta['frames'],'fps':meta['fps'],'duration':duration,'audio':bool(labels)}}
 manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 print(name,meta['frames'],round(duration,2),dest.stat().st_size,flush=True)
