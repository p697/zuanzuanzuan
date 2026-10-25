import java.io.*;
import java.nio.file.*;
import javax.imageio.ImageIO;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.DefineSpriteTag;
import com.jpexs.decompiler.flash.types.*;
import com.jpexs.decompiler.flash.exporters.commonshape.Matrix;
class hudExport {
 public static void main(String[] a)throws Exception{
  SWF swf=new SWF(new FileInputStream(a[0]),false);
  int id=Integer.parseInt(a[1]);var sprite=(DefineSpriteTag)swf.getCharacter(id);var tl=sprite.getTimeline();
  String mode=a[3];
  if(mode.equals("panel"))for(var f:tl.getFrames())f.layers.entrySet().removeIf(e->e.getKey()!=35&&e.getKey()!=51);
  if(mode.equals("quick"))for(var f:tl.getFrames())f.layers.entrySet().removeIf(e->e.getKey()!=2);
  if(mode.equals("inventory"))for(var f:tl.getFrames())f.layers.entrySet().removeIf(e->e.getKey()!=1);
  RECT r=mode.equals("panel")?new RECT(-1800,4600,-600,6500):mode.equals("inventory")?new RECT(3400,6000,5400,8000):sprite.getRect();
  if(mode.equals("air"))r=new RECT(-40,2240,0,1250);
  var out=Path.of(a[2]);Files.createDirectories(out);
  int count=mode.equals("digits")||mode.equals("hp")?tl.getFrameCount():mode.equals("air")?101:1;
  for(int i=0;i<count;i++){
   if(mode.equals("air")){
    var value=((DefineSpriteTag)swf.getCharacter(1252)).getTimeline();
    // Select the SWF's actual gauge fill frame, not a CSS approximation.
    var frames=value.getFrames();if(i==0){originalFrames=new java.util.ArrayList<>(frames);}frames.clear();frames.add(originalFrames.get(i));
   }
   var image=SWF.frameToImageGet(tl,mode.equals("digits")||mode.equals("hp")?i:0,0,null,0,r,new Matrix(),new ColorTransform(),null,1.0,true,0);
   ImageIO.write(image.getBufferedImage(),"png",out.resolve(i+".png").toFile());
  }
 }
 static java.util.List<com.jpexs.decompiler.flash.timeline.Frame> originalFrames;
}
