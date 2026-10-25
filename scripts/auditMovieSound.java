import java.io.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.*;
class auditMovieSound {
 public static void main(String[] a)throws Exception {
  for(String path:a){var s=new SWF(new FileInputStream(path),false);int n=0;
   for(var t:s.getTags())if(t instanceof StartSoundTag st && st.soundInfo.hasEnvelope){System.out.println(path+" sound "+st.soundId+" envelope "+st.soundInfo.envelopeRecords.length);n++;}
   System.out.println(path+" envelope count "+n);
  }System.exit(0);
 }
}
