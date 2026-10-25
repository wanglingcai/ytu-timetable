package cn.ytu.timetable;

import android.content.Context;
import android.graphics.*;
import androidx.exifinterface.media.ExifInterface;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.JSONObject;
import java.io.*;

/** Wallpaper is private local data, separate from timetable backups and portal storage. */
final class AppearanceStore {
    static final String IMAGE_URL="file:///android_asset/personal-background.jpg";
    private static final Object LOCK=new Object();
    private static AtomicFile image(Context context){return new AtomicFile(new File(context.getFilesDir(),"background.jpg"));}
    private static android.content.SharedPreferences prefs(Context context){return context.getSharedPreferences("appearance",Context.MODE_PRIVATE);}
    static JSONObject read(Context context) {
        synchronized(LOCK) {
            JSONObject data=new JSONObject();boolean exists=false;
            try(InputStream ignored=image(context).openRead()){exists=true;}catch(IOException ignored){}
            try {data.put("mask",prefs(context).getInt("mask",80));data.put("blur",prefs(context).getInt("blur",0));
                data.put("imageUrl",exists?IMAGE_URL+"?v="+prefs(context).getLong("revision",0):"");
            }catch(Exception ignored){}
            return data;
        }
    }
    static JSONObject exportBackup(Context context) throws IOException {
        synchronized(LOCK) {
            JSONObject data=read(context);
            data.remove("imageUrl");
            String encoded="";
            try(InputStream input=image(context).openRead()) {
                ByteArrayOutputStream bytes=new ByteArrayOutputStream();
                byte[] buffer=new byte[8192];int size;
                while((size=input.read(buffer))!=-1) {
                    if(bytes.size()+size>12*1024*1024)throw new IOException("背景图片过大，无法备份");
                    bytes.write(buffer,0,size);
                }
                encoded=Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP);
            }catch(FileNotFoundException missing){}
            try {data.put("image",encoded);}catch(Exception invalid){throw new IOException("外观备份生成失败",invalid);}
            return data;
        }
    }
    static void importBackup(Context context,JSONObject value) throws IOException {
        int mask=value.optInt("mask",-1),blur=value.optInt("blur",-1);
        if(mask<0||mask>80||blur<0||blur>20)throw new IOException("备份中的外观设置无效");
        String encoded=value.optString("image","");
        if(encoded.length()>16*1024*1024)throw new IOException("备份中的背景图片过大");
        if(encoded.isEmpty()) {
            synchronized(LOCK) {
                image(context).delete();
                if(!prefs(context).edit().putInt("mask",mask).putInt("blur",blur).putLong("revision",prefs(context).getLong("revision",0)+1).commit())
                    throw new IOException("外观设置保存失败");
            }
            return;
        }
        final byte[] bytes;
        try {bytes=Base64.decode(encoded,Base64.DEFAULT);}catch(IllegalArgumentException invalid){throw new IOException("备份中的背景图片无效",invalid);}
        if(bytes.length>12*1024*1024)throw new IOException("备份中的背景图片过大");
        importImage(context,new ByteArrayInputStream(bytes));
        synchronized(LOCK) {
            if(!prefs(context).edit().putInt("mask",mask).putInt("blur",blur).commit())throw new IOException("外观设置保存失败");
        }
    }
    static boolean save(Context context,String json) {
        synchronized(LOCK) {
            try {JSONObject value=new JSONObject(json);Object mask=value.get("mask"),blur=value.get("blur");
                if(!(mask instanceof Integer)||!(blur instanceof Integer))return false;
                int opacity=(Integer)mask,radius=(Integer)blur;
                if(opacity<0||opacity>80||radius<0||radius>20)return false;
                return prefs(context).edit().putInt("mask",opacity).putInt("blur",radius).commit();
            }catch(Exception invalid){return false;}
        }
    }
    static InputStream openImage(Context context)throws IOException {synchronized(LOCK){return image(context).openRead();}}
    static void clear(Context context) throws IOException {
        synchronized(LOCK) {
            image(context).delete();
            if(!prefs(context).edit().putInt("mask",80).putInt("blur",0).commit())throw new IOException("外观设置保存失败");
        }
    }
    static void importImage(Context context,InputStream input) throws IOException {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] chunk=new byte[8192];int size;
        while((size=input.read(chunk))!=-1){if(bytes.size()+size>12*1024*1024)throw new IOException("背景图片不能超过 12 MB");bytes.write(chunk,0,size);}
        byte[] source=bytes.toByteArray();BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;
        BitmapFactory.decodeByteArray(source,0,source.length,options);
        if(options.outWidth<1||options.outHeight<1||options.outWidth>20000||options.outHeight>20000)throw new IOException("请选择有效的照片或图片，尺寸不能超过 20000 像素");
        options.inJustDecodeBounds=false;options.inSampleSize=1;
        while(options.outWidth/options.inSampleSize>2048||options.outHeight/options.inSampleSize>2048)options.inSampleSize*=2;
        Bitmap decoded=null,oriented=null,flat=null;
        try {
            decoded=BitmapFactory.decodeByteArray(source,0,source.length,options);
            if(decoded==null)throw new IOException("无法解码图片，请尝试 JPG、PNG 或 WebP");
            Matrix matrix=new Matrix();int orientation=ExifInterface.ORIENTATION_NORMAL;
            try {orientation=new ExifInterface(new ByteArrayInputStream(source)).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL);}catch(IOException ignored){}
            switch(orientation) {
                case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: matrix.setScale(-1,1);break;
                case ExifInterface.ORIENTATION_ROTATE_180: matrix.setRotate(180);break;
                case ExifInterface.ORIENTATION_FLIP_VERTICAL: matrix.setScale(1,-1);break;
                case ExifInterface.ORIENTATION_TRANSPOSE: matrix.setRotate(90);matrix.postScale(-1,1);break;
                case ExifInterface.ORIENTATION_ROTATE_90: matrix.setRotate(90);break;
                case ExifInterface.ORIENTATION_TRANSVERSE: matrix.setRotate(270);matrix.postScale(-1,1);break;
                case ExifInterface.ORIENTATION_ROTATE_270: matrix.setRotate(270);break;
                default:break;
            }
            oriented=Bitmap.createBitmap(decoded,0,0,decoded.getWidth(),decoded.getHeight(),matrix,true);
            flat=Bitmap.createBitmap(oriented.getWidth(),oriented.getHeight(),Bitmap.Config.ARGB_8888);
            Canvas canvas=new Canvas(flat);canvas.drawColor(Color.WHITE);canvas.drawBitmap(oriented,0,0,null);
            synchronized(LOCK) {
                AtomicFile target=image(context);FileOutputStream output=null;
                try {output=target.startWrite();if(!flat.compress(Bitmap.CompressFormat.JPEG,88,output))throw new IOException("图片保存失败");target.finishWrite(output);}
                catch(IOException error){if(output!=null)target.failWrite(output);throw error;}
                if(!prefs(context).edit().putLong("revision",prefs(context).getLong("revision",0)+1).commit())throw new IOException("图片已保存，请重新打开设置查看");
            }
        }catch(OutOfMemoryError memory){throw new IOException("图片过大，请选择较小的图片",memory);}
        finally {if(flat!=null)flat.recycle();if(oriented!=null&&oriented!=decoded)oriented.recycle();if(decoded!=null)decoded.recycle();}
    }
}
