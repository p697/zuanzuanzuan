import java.io.*;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.*;
import com.jpexs.decompiler.flash.timeline.*;
import com.jpexs.decompiler.flash.types.*;
import com.jpexs.decompiler.flash.exporters.commonshape.Matrix;

/** Offline timeline rasterization only; never execute third-party ActionScript. */
class renderMovie {
 static List<String> cues=new ArrayList<>();
 static void sounds(SWF s, Frame f, int output, Set<Integer> seen, int depth) {
  if(depth>12)return;
  for(int i=0;i<f.sounds.size();i++){
   var info=f.soundInfos.get(i);
   List<String> envelope=new ArrayList<>();
   if(info.hasEnvelope)for(var point:info.envelopeRecords)envelope.add("["+point.pos44+","+point.leftLevel+","+point.rightLevel+"]");
   cues.add("{\"frame\":"+output+",\"id\":"+f.sounds.get(i)+",\"stop\":"+info.syncStop+",\"loops\":"+(info.hasLoops?info.loopCount:1)+",\"in\":"+(info.hasInPoint?info.inPoint:0)+",\"out\":"+(info.hasOutPoint?info.outPoint:-1)+",\"envelope\":["+String.join(",",envelope)+"]}");
  }
  for(var l:f.layers.values()) if(s.getCharacter(l.characterId) instanceof DefineSpriteTag sp && !seen.contains(l.characterId)){
   var next=new HashSet<Integer>(seen);next.add(l.characterId);
   var tl=sp.getTimeline(); sounds(s,tl.getFrame(Math.floorMod(l.time,tl.getFrameCount())),output,next,depth+1);
  }
 }
 public static void main(String[] a)throws Exception{
  var png=System.out;System.setOut(System.err);
  SWF s=new SWF(new FileInputStream(a[0]),false);
  var tl=s.getTimeline(); int count=tl.getFrameCount(), stream=-1;
  // Freeze stop() poses instead of accidentally looping them in an offline render.
  for(var ch:s.getCharacters(false).values())if(ch instanceof DefineSpriteTag sp){
   var frames=sp.getTimeline().getFrames();int stop=-1;
   for(var f:frames){for(var tag:f.actions)for(var act:tag.getActions())if(act.getActionCode()==7)stop=f.frame;if(stop>=0)break;}
   if(stop>=0){while(frames.size()>stop+1)frames.remove(frames.size()-1);while(frames.size()<count)frames.add(new Frame(frames.get(frames.size()-1),frames.size()));}
  }
  for(int n=0;n<count;n++){
   var f=tl.getFrame(n);sounds(s,f,n,new HashSet<>(),0);
   if(stream<0)for(var tag:f.innerTags)if(tag instanceof SoundStreamBlockTag)stream=n;
  }
  Files.writeString(Path.of(a[1]),"{\"frames\":"+count+",\"fps\":"+s.frameRate+",\"streamStart\":"+stream+",\"cues\":["+String.join(",",cues)+"]}");
  int limit=a.length>2?Math.min(count,Integer.parseInt(a[2])):count;
  for(int n=0;n<limit;n++){
   var im=SWF.frameToImageGet(tl,n,0,null,0,s.displayRect,new Matrix(),new ColorTransform(),null,1.0,true,0);
   ImageIO.write(im.getBufferedImage(),"png",png);
   if(n%150==0)System.err.println(Path.of(a[0]).getFileName()+" frame "+n+"/"+limit);
  }
  png.flush();
  System.exit(0);
 }
}
