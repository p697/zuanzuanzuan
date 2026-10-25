import java.io.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.DefineSpriteTag;
class hudInspect {
 public static void main(String[] args)throws Exception {
  var swf=new SWF(new FileInputStream(args[0]),false);
  for(int n=1;n<args.length;n++){
   int id=Integer.parseInt(args[n]);var c=swf.getCharacter(id);
   System.out.println("CHAR "+id+" "+c.getClass().getSimpleName());
   if(c instanceof DefineSpriteTag s){System.out.println("RECT "+s.getRect()+" FRAMES "+s.getTimeline().getFrameCount());
    for(int fi:new int[]{0,s.getTimeline().getFrameCount()-1}){System.out.println("FRAME "+fi);for(var e:s.getTimeline().getFrame(fi).layers.entrySet()){
     var d=e.getValue();System.out.println(" depth="+e.getKey()+" id="+d.characterId+" name="+d.instanceName+" matrix="+d.matrix+" clip="+d.clipDepth);
    }}
   }
  }
 }
}
