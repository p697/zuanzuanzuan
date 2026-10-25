import java.io.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.*;
class nativeInspect {
 public static void main(String[] args)throws Exception {
  var s=new SWF(new FileInputStream(args[0]),false);
  System.out.println("SWF "+s.displayRect+" fps="+s.frameRate+" frames="+s.getTimeline().getFrameCount());
  for(var t:s.getTags())if(t instanceof ExportAssetsTag ex)for(var item:ex.getTagToNameMap().entrySet())if(item.getValue().equals("BossHP"))System.out.println("BossHP="+item.getKey());
  for(int n=1;n<args.length;n++){
   int id=Integer.parseInt(args[n]);var d=(DefineSpriteTag)s.getCharacter(id);
   System.out.println("ROOT "+id+" RECT "+d.getRect());
   for(var f:d.getTimeline().getFrames()){
    System.out.println(" STATE "+(f.frame+1));
    for(var l:f.layers.values()){
     var c=s.getCharacter(l.characterId);
     System.out.println("  "+l.characterId+" "+l.instanceName+" frames="+(c instanceof DefineSpriteTag sp?sp.getTimeline().getFrameCount():0)+" rect="+(c instanceof com.jpexs.decompiler.flash.tags.base.BoundedTag b?b.getRect():null)+" matrix="+l.matrix);
    }
   }
  }
  System.exit(0);
 }
}
