package cn.ytu.timetable;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import org.json.JSONObject;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Opt-in public login-page check: uses the actual portal activity; never enters credentials. */
final class GxuLoginChecks {
    private final Instrumentation test;
    private Activity activity;
    GxuLoginChecks(Instrumentation test){this.test=test;}
    void run(){
        Bundle report=new Bundle();
        try{
            SchoolConfig config=SchoolRegistry.load(test.getTargetContext()).get("gxu").config();
            String httpLogin="http://jwxt2018.gxu.edu.cn/jwglxt/xtgl/login_slogin.html";
            if(!config.allowed(httpLogin)||!config.allowed("http://jwxt2018.gxu.edu.cn:80/jwglxt/xtgl/login_slogin.html")
                ||!config.isResultPage("http://jwxt2018.gxu.edu.cn/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html")
                ||!config.resourceAllowed("http://jwxt2018.gxu.edu.cn/jwglxt/style.css"))throw new AssertionError("Configured HTTP school page blocked");
            for(String url:new String[]{"http://jwxt2018.gxu.edu.cn.evil.example/", "http://jwxt2018.gxu.edu.cn@evil.example/", "http://jwxt2018.gxu.edu.cn:8080/", "http://other.gxu.edu.cn/", "file:///tmp/test"})
                if(config.allowed(url)||config.resourceAllowed(url))throw new AssertionError("Unexpected origin allowed");
            if(SchoolRegistry.load(test.getTargetContext()).get("ytu").allows("http://jwxs.ytu.edu.cn/"))throw new AssertionError("YTU HTTPS policy changed");
            JSONObject invalid=new JSONObject(SchoolRegistry.readAsset(test.getTargetContext(),"schools/gxu/config.json"));
            invalid.put("dataUrl","http://jwxt2018.gxu.edu.cn/jwglxt/kbcx/xskbcx_cxXsgrkb.html");
            boolean rejected=false;try{SchoolConfig.fromJson(invalid);}catch(IllegalArgumentException expected){rejected=true;}
            if(!rejected)throw new AssertionError("Unencrypted course API was accepted");
            CountDownLatch cleared=new CountDownLatch(1);
            test.runOnMainSync(()->CookieManager.getInstance().removeAllCookies(ok->cleared.countDown()));
            if(!cleared.await(10,TimeUnit.SECONDS))throw new AssertionError("Cookie setup timed out");
            activity=test.startActivitySync(new Intent(test.getTargetContext(),PortalImportActivity.class).putExtra(PortalImportActivity.EXTRA_SCHOOL_ID,"gxu").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            WebView web=findWeb(activity.getWindow().getDecorView());
            long until=System.currentTimeMillis()+45000;
            AtomicReference<String> current=new AtomicReference<>("");
            while(System.currentTimeMillis()<until){
                test.runOnMainSync(()->current.set(web.getUrl()));
                if(current.get()!=null&&current.get().startsWith("https://jwxt2018.gxu.edu.cn/jwglxt/xtgl/login_slogin.html")
                    &&"true".equals(js(web,"!!document.querySelector('input[type=password]') && typeof AndroidLocal==='undefined'"))){
                    report.putString("stream","\nPASS: GXU fixed entry followed the public HTTPS → HTTP → HTTPS login flow and displayed the actual password form without entering credentials. Per-school HTTP rules, unrelated origins and HTTPS API enforcement checked.\n");
                    test.finish(Activity.RESULT_OK,report);return;
                }
                Thread.sleep(200);
            }
            throw new AssertionError("Public login page not reached from fixed entry; last URL: "+current.get());
        }catch(Throwable error){report.putString("stream","\nFAIL: "+android.util.Log.getStackTraceString(error));test.finish(Activity.RESULT_CANCELED,report);}
        finally{if(activity!=null)test.runOnMainSync(activity::finish);}
    }
    private String js(WebView web,String script)throws Exception{
        CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
        test.runOnMainSync(()->web.evaluateJavascript(script,value->{result.set(value);latch.countDown();}));
        if(!latch.await(10,TimeUnit.SECONDS))throw new AssertionError("Page callback timed out");return result.get();
    }
    private WebView findWeb(android.view.View view){
        if(view instanceof WebView)return (WebView)view;
        if(view instanceof android.view.ViewGroup)for(int i=0;i<((android.view.ViewGroup)view).getChildCount();i++){WebView found=findWeb(((android.view.ViewGroup)view).getChildAt(i));if(found!=null)return found;}
        return null;
    }
}
