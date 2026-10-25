import java.io.*;import java.nio.file.*;import java.util.*;import java.awt.geom.*;
import com.jpexs.decompiler.flash.*;import com.jpexs.decompiler.flash.tags.*;import com.jpexs.decompiler.flash.tags.base.*;import com.jpexs.decompiler.flash.timeline.*;import com.jpexs.decompiler.flash.exporters.commonshape.Matrix;
class exportActorGeometry {
 static SWF s; static int stopFrame(DefineSpriteTag sp)throws Exception{for(var f:sp.getTimeline().getFrames())for(var tag:f.actions)for(var a:tag.getActions())if(a.getActionCode()==7)return f.frame;return -1;}
 static int frame(DefineSpriteTag sp,int t)throws Exception{int stop=stopFrame(sp);return stop>=0?Math.min(t,stop):Math.floorMod(t,sp.getTimeline().getFrameCount());}
 static Rectangle2D bounds(int id,int f,int time,Matrix m,List<Rectangle2D> targets,int level)throws Exception {
  if(level>16)return null;var ch=s.getCharacter(id);Rectangle2D result=null;
  if(ch instanceof DefineSpriteTag sp){
   for(var l:sp.getTimeline().getFrame(f).layers.values()){
    if("angry_mc".equals(l.instanceName)||"tmpViewer_mc".equals(l.instanceName))continue;
    var transform=m.concatenate(new Matrix(l.matrix));var child=s.getCharacter(l.characterId);
    int childFrame=child instanceof DefineSpriteTag sub?frame(sub,l.time+time):0;
    Rectangle2D r=bounds(l.characterId,childFrame,0,transform,targets,level+1);
    if("coll_mc".equals(l.instanceName)&&r!=null)targets.add(r);
    if(r!=null)result=result==null?r:result.createUnion(r);
   }
  }else if(ch instanceof BoundedTag b){var r=b.getRect();result=m.transform(new Rectangle2D.Double(r.Xmin,r.Ymin,r.Xmax-r.Xmin,r.Ymax-r.Ymin));}
  return result;
 }
 static String rect(Rectangle2D r){if(r==null)return "null";return String.format(Locale.US,"[%.3f,%.3f,%.3f,%.3f]",r.getMinX()/20,r.getMinY()/20,r.getMaxX()/20,r.getMaxY()/20);}
 public static void main(String[]a)throws Exception{
  s=new SWF(new FileInputStream(a[0]),false);List<String> actors=new ArrayList<>();
  String[] names={"player","dragon","dragon2","dragon3","bigDragon","bigDragon2","boss","subBoss","bossArm","explosion"};int[] ids={543,299,287,274,261,247,697,662,813,372};
  for(int n=0;n<ids.length;n++){
   var sp=(DefineSpriteTag)s.getCharacter(ids[n]);List<String> states=new ArrayList<>();
   for(int f=0;f<sp.getTimeline().getFrameCount();f++){
    int count=1;boolean loop=true;
    for(var l:sp.getTimeline().getFrame(f).layers.values())if(l.instanceName==null||"boss_mc".equals(l.instanceName)||"ex_mc".equals(l.instanceName))if(s.getCharacter(l.characterId)instanceof DefineSpriteTag child){count=Math.max(count,child.getTimeline().getFrameCount());if(stopFrame(child)>=0)loop=false;}
    // Explosion is a single playing timeline, rather than actor state selectors.
    if(names[n].equals("explosion"))count=1;
    count=Math.min(count,180);List<String> frames=new ArrayList<>();
    for(int t=0;t<count;t++){List<Rectangle2D> hurt=new ArrayList<>();var r=bounds(ids[n],f,t,new Matrix(),hurt,0);List<String> rs=new ArrayList<>();for(var h:hurt)rs.add(rect(h));frames.add("{\"body\":"+rect(r)+",\"hit\":["+String.join(",",rs)+"]}");}
    states.add("{\"loop\":"+loop+",\"frames\":["+String.join(",",frames)+"]}");
   }
   actors.add("\""+names[n]+"\":{\"id\":"+ids[n]+",\"states\":["+String.join(",",states)+"]}");
  }
  Files.writeString(Path.of(a[1]),"// Generated from original SWF timelines; values in native stage pixels.\nexport const actorGeometry = {"+String.join(",",actors)+"};\n");
  System.exit(0);
 }
}
