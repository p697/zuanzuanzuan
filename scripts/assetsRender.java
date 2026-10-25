import java.io.*;
import java.nio.file.*;
import javax.imageio.ImageIO;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.DefineSpriteTag;
import com.jpexs.decompiler.flash.timeline.*;
import com.jpexs.decompiler.flash.types.*;
import com.jpexs.decompiler.flash.exporters.commonshape.Matrix;
class assetsRender {
 public static void main(String[] args) throws Exception {
  SWF swf=new SWF(new FileInputStream(args[0]),false);
  // The game hides collision-only MovieClips at runtime. They are authored as
  // visible white geometry, so the offline renderer must omit those instances.
  for(var c:swf.getCharacters(false).values())if(c instanceof DefineSpriteTag d) {
   for(Frame f:d.getTimeline().getFrames())f.layers.entrySet().removeIf(e->{
    String name=e.getValue().instanceName;
    return name!=null && name.toLowerCase().matches("(?:coll|collision|hitbox)(?:_mc|[0-9]*)?");
   });
  }
  int id=Integer.parseInt(args[1]);
  DefineSpriteTag sprite=(DefineSpriteTag)swf.getCharacter(id);
  Timeline tl=sprite.getTimeline();
  // Constructor of Boss/SubBoss hides angry_mc until the health threshold.
  // Keep normal actors smoke-free; rage effects can be selected separately.
  if(id==697||id==662)for(Frame f:tl.getFrames())
   f.layers.entrySet().removeIf(e->"angry_mc".equals(e.getValue().instanceName));
  RECT r=sprite.getRect();
  if(id==543)r=new RECT(-1200,1200,-2000,1000);
  System.out.println(id+" rect "+r+" frames "+tl.getFrameCount());
  if(id==603)for(Frame f:tl.getFrames())f.layers.entrySet().removeIf(e->e.getValue().characterId==602);
  if(id==736||id==184)for(Frame f:tl.getFrames())f.layers.entrySet().removeIf(e->e.getValue().characterId==183);
  // Equipment and facial selectors are stopped by original ActionScript.
  // Bake at the initial equipment tier; do not let renderer cycle them as animations.
  if(id==543)for(int freeze:new int[]{395,446,474,487,523,414,460,535,483,495,403}) {
   var ft=((DefineSpriteTag)swf.getCharacter(freeze)).getTimeline();
   var frames=ft.getFrames();
   int selected=(freeze==414||freeze==460||freeze==535)&&args.length>4 ? Math.min(Integer.parseInt(args[4]),frames.size()-1):0;
   var selectedFrame=frames.get(selected);frames.clear();frames.add(selectedFrame);
  }
  var root=Path.of(args[2]);Files.createDirectories(root);
  Files.writeString(root.resolve("meta.json"),"{\"originX\":"+(-r.Xmin/20.0)+",\"originY\":"+(-r.Ymin/20.0)+",\"width\":"+(r.getWidth()/20.0)+",\"height\":"+(r.getHeight()/20.0)+"}");
  int sub=Integer.parseInt(args[3]);
  for(int f=0;f<tl.getFrameCount();f++){
   int limit=sub;
   if(sub<0){limit=1;for(var layer:tl.getFrame(f).layers.values())
    if(layer.instanceName==null || "boss_mc".equals(layer.instanceName) || "ex_mc".equals(layer.instanceName))
     if(swf.getCharacter(layer.characterId) instanceof DefineSpriteTag child)limit=Math.max(limit,child.getTimeline().getFrameCount());
   }
   for(int t=0;t<limit;t++){
   var out=Path.of(args[2],String.valueOf(f+1));Files.createDirectories(out);
   var image=SWF.frameToImageGet(tl,f,t,null,0,r,new Matrix(),new ColorTransform(),null,1.0,true,0);
   ImageIO.write(image.getBufferedImage(),"png",out.resolve((t+1)+".png").toFile());
   }
  }
  System.exit(0);
 }
}
