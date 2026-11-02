package cn.ytu.timetable;

import android.app.Activity;
import android.app.Instrumentation;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/** Runs the actual self-import activity with mock API data; never contacts a school account. */
final class SelfPortalAdapterChecks {
    private final Instrumentation test;
    private Activity offline, portal;
    private WebView local, web;

    SelfPortalAdapterChecks(Instrumentation test) { this.test=test; }

    void run() {
        Bundle report=new Bundle();
        try {
            SchoolAdapter real=SchoolRegistry.load(test.getTargetContext()).get("ytu");
            SchoolRegistry registry=SchoolRegistry.load(test.getTargetContext());
            JSONArray visibleSchools=registry.toJson();
            if(visibleSchools.length()!=1 || !"ytu".equals(visibleSchools.getJSONObject(0).getString("id")))throw new AssertionError("School picker must show only YTU");
            if(registry.forCoursePage("https://jwxt2018.gxu.edu.cn/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html")==null)throw new AssertionError("GXU self-import adapter missing");
            if(registry.forCoursePage(real.coursePageUrl())==null)throw new AssertionError("Known page did not match");
            for(String url:new String[]{"https://jwxs.ytu.edu.cn.evil.example/student/courseSelect/courseSelectResult/index", "http://jwxs.ytu.edu.cn/student/courseSelect/courseSelectResult/index", "https://jwxs.ytu.edu.cn:8443/student/courseSelect/courseSelectResult/index", "https://jwxs.ytu.edu.cn/unrelated", real.loginUrl()})
                if(registry.forCoursePage(url)!=null)throw new AssertionError("Unrelated URL matched a school adapter");

            JSONObject expectedApi=real.parseApi(fixture("api-response.json"));
            JSONArray expected=expectedApi.getJSONArray("courses");
            runCase(real,expectedApi,expected,"api");
            runCase(real,expectedApi,expected,"fallback");
            runCase(real,expectedApi,expected,"unknown");
            runCase(real,expectedApi,expected,"embedded");
            runCase(real,expectedApi,expected,"portalPath");
            runCase(real,expectedApi,expected,"crossOrigin");
            runCase(real,expectedApi,expected,"noCookie");
            runCase(real,expectedApi,expected,"spoof");
            runCase(real,expectedApi,expected,"missingSession");
            runCase(real,expectedApi,expected,"apiFailsMobile");
            SchoolAdapter gxu=SchoolRegistry.load(test.getTargetContext()).get("gxu");
            JSONObject gxuApi=gxu.parseApi(fixture("gxu","api-response.json"));
            checkGxuContract(gxu,gxuApi);
            runCase(gxu,gxuApi,gxuApi.getJSONArray("courses"),"gxu");
            runCase(gxu,gxuApi,gxuApi.getJSONArray("courses"),"gxuFallback");
            report.putString("stream","\nPASS: real address-dialog navigation uses YTU API on direct, same-origin iframe and cross-origin iframe pages; DOM fallback and missing-cookie cases pass; unrelated/spoofed sites never use the school API. Preview fields match; missing-session and API failure diagnostics are checked; saved state is unchanged; GXU selected-semester API routing and list fallback pass.\n");
            test.finish(Activity.RESULT_OK,report);
        } catch(Throwable error) {
            report.putString("stream","\nFAIL: "+android.util.Log.getStackTraceString(error));
            test.finish(Activity.RESULT_CANCELED,report);
        } finally {
            if(portal!=null&&!portal.isFinishing())test.runOnMainSync(portal::finish);
            if(offline!=null)test.runOnMainSync(offline::finish);
        }
    }

    @SuppressWarnings("unchecked")
    private void runCase(SchoolAdapter real,JSONObject api,JSONArray expected,String mode) throws Exception {
        android.content.Intent intent=test.getTargetContext().getPackageManager().getLaunchIntentForPackage(test.getTargetContext().getPackageName());
        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        offline=test.startActivitySync(intent);
        local=findWeb(offline.getWindow().getDecorView());
        await(local,"!!window.receivePortalImport && !!window.AndroidLocal");
        String before=js(local,"AndroidLocal.readState()");
        if(!"true".equals(js(local,"document.querySelector('#appVersion').textContent==='v'+AndroidLocal.appVersion()")))throw new AssertionError("Test build marker missing");
        js(local,"window.__receivedPortal=null;window.__originalPortal=window.receivePortalImport;window.receivePortalImport=function(p){window.__receivedPortal=p;window.__originalPortal(p);};true");
        Instrumentation.ActivityMonitor monitor=test.addMonitor(SelfPortalActivity.class.getName(),null,false);
        js(local,"document.querySelector('#importButton').click();document.querySelector('#selfPortalImport').click();true");
        portal=test.waitForMonitorWithTimeout(monitor,10000);test.removeMonitor(monitor);
        if(portal==null)throw new AssertionError("Self import did not open");
        AtomicInteger calls=new AtomicInteger();
        SchoolAdapter mock=(SchoolAdapter)Proxy.newProxyInstance(SchoolAdapter.class.getClassLoader(),new Class<?>[]{SchoolAdapter.class},(proxy,method,args)->{
            if("readApi".equals(method.getName())) {
                calls.incrementAndGet();
                if("gxu".equals(real.id())){
                    if(args.length!=3||!"2026".equals(((JSONObject)args[2]).optString("xnm"))||!"3".equals(((JSONObject)args[2]).optString("xqm")))throw new AssertionError("Selected semester not passed to GXU API");
                }
                if(!String.valueOf(args[0]).contains("mock-session=value"))throw new AssertionError("Wrong school session passed");
                if("fallback".equals(mode)||"apiFailsMobile".equals(mode)||"gxuFallback".equals(mode))throw new AdapterException(PortalErrorCode.NETWORK_UNAVAILABLE,"mock network failure");
                return new JSONObject(api.toString());
            }
            return method.invoke(real,args);
        });
        Constructor<SchoolRegistry> constructor=SchoolRegistry.class.getDeclaredConstructor(java.util.Map.class);constructor.setAccessible(true);
        Field registry=SelfPortalActivity.class.getDeclaredField("registeredSchools");registry.setAccessible(true);
        registry.set(portal,constructor.newInstance(Collections.singletonMap(real.id(),mock)));
        boolean embedded="embedded".equals(mode)||"crossOrigin".equals(mode)||"spoof".equals(mode);
        String url="spoof".equals(mode)?"https://unrelated.example/mock?ticket=mock-secret":
            "portalPath".equals(mode)?"https://jwxs.ytu.edu.cn/student/home":
            "unknown".equals(mode)?"https://unrelated.example/course":
            "crossOrigin".equals(mode)?"https://ehall.ytu.edu.cn:4106/mock":
            embedded?"https://jwxs.ytu.edu.cn/student/home":real.coursePageUrl();
        String frameUrl="spoof".equals(mode)?"https://jwxs.ytu.edu.cn.evil.example/student/courseSelect/courseSelectResult/index":real.coursePageUrl();
        Field browser=SelfPortalActivity.class.getDeclaredField("portal");browser.setAccessible(true);web=(WebView)browser.get(portal);
        String nameOnly="<table id='courseTable'><tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr><tr><td>第1节</td><td>只显示课程名</td><td></td><td></td></tr></table>";
        String html="gxu".equals(mode)?"<select id='xnm'><option value='2026'>2026-2027</option></select><select id='xqm'><option value='3'>1</option></select>"+nameOnly:
            "gxuFallback".equals(mode)?fixture("gxu","course-result.html"):
            embedded?"<html><body>模拟办事大厅<iframe src='"+frameUrl+"'></iframe></body></html>":
            ("api".equals(mode)||"portalPath".equals(mode)||"missingSession".equals(mode)||"apiFailsMobile".equals(mode))?nameOnly:
            "unknown".equals(mode)?"<table><tr><th>课程名称</th><th>星期</th><th>节次</th><th>周次</th></tr><tr><td>通用课程</td><td>星期一</td><td>1-2</td><td>1-16</td></tr></table>":fixture("course-result.html");
        CountDownLatch loaded=new CountDownLatch(1), cookieReady=new CountDownLatch(1);
        test.runOnMainSync(()->{
            CookieManager.getInstance().removeAllCookies(removed->{
                if("noCookie".equals(mode)||"missingSession".equals(mode))cookieReady.countDown();
                else CookieManager.getInstance().setCookie(real.config().dataUrl,"mock-session=value; Path=/; Secure",ok->cookieReady.countDown());
            });
            WebViewClient client=web.getWebViewClient();
            // Preserve the production URL policy, navigation lifecycle and button state; replace network responses only.
            web.setWebViewClient(new WebViewClient(){
                @Override public boolean shouldOverrideUrlLoading(WebView view,android.webkit.WebResourceRequest request){return client.shouldOverrideUrlLoading(view,request);}
                @Override public boolean shouldOverrideUrlLoading(WebView view,String target){return client.shouldOverrideUrlLoading(view,target);}
                @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view,android.webkit.WebResourceRequest request){
                    android.webkit.WebResourceResponse blocked=client.shouldInterceptRequest(view,request);
                    if(blocked!=null)return blocked;
                    String target=request.getUrl().toString();
                    String body=url.equals(target)?html:embedded&&frameUrl.equals(target)?nameOnly:"<html><body></body></html>";
                    return new android.webkit.WebResourceResponse("text/html","UTF-8",new java.io.ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
                }
                @Override public void onPageStarted(WebView view,String target,android.graphics.Bitmap icon){client.onPageStarted(view,target,icon);}
                @Override public void onPageFinished(WebView view,String target){client.onPageFinished(view,target);if(url.equals(target))loaded.countDown();}
            });
        });
        if(!cookieReady.await(10,TimeUnit.SECONDS))throw new AssertionError("Cookie setup timed out");
        enterAddress(url);
        if(!loaded.await(10,TimeUnit.SECONDS))throw new AssertionError("Real address flow did not load fixture: "+mode);
        Field read=SelfPortalActivity.class.getDeclaredField("read");read.setAccessible(true);
        android.widget.Button button=(android.widget.Button)read.get(portal);
        AtomicReference<Boolean> enabled=new AtomicReference<>(false);
        test.runOnMainSync(()->enabled.set(button.isEnabled()));
        if(!enabled.get())throw new AssertionError("Production read button disabled: "+mode);
        test.runOnMainSync(button::performClick);
        if("spoof".equals(mode)||"missingSession".equals(mode)||"apiFailsMobile".equals(mode)){
            awaitError("spoof".equals(mode)?"通用网页":"烟台大学适配器");
            java.lang.reflect.Method diagnostic=SelfPortalActivity.class.getDeclaredMethod("diagnostics");diagnostic.setAccessible(true);
            AtomicReference<String> details=new AtomicReference<>();test.runOnMainSync(()->{try{details.set((String)diagnostic.invoke(portal));}catch(Exception error){throw new RuntimeException(error);}});
            if(details.get().contains("mock-secret")||details.get().contains("mock-session"))throw new AssertionError("Diagnostic contains session data");
            if("missingSession".equals(mode)&&!details.get().contains("会话尚未建立"))throw new AssertionError("Missing-session diagnostic absent");
            if("apiFailsMobile".equals(mode)&&!details.get().contains("NETWORK_UNAVAILABLE"))throw new AssertionError("API failure diagnostic absent");
            if(calls.get()!=("apiFailsMobile".equals(mode)?1:0)||!"null".equals(js(local,"window.__receivedPortal"))||!before.equals(js(local,"AndroidLocal.readState()")))throw new AssertionError("Spoofed frame accessed adapter or changed data");
            test.runOnMainSync(portal::finish);test.waitForIdleSync();
            test.runOnMainSync(offline::finish);test.waitForIdleSync();offline=null;portal=null;return;
        }
        await(local,"!!window.__receivedPortal && document.querySelector('#importDialog').open");
        String received=js(local,"JSON.stringify(window.__receivedPortal)");
        JSONObject payload=new JSONObject((String)new JSONTokener(received).nextValue());
        if("unknown".equals(mode)) {
            if(calls.get()!=0||!"self-portal".equals(payload.optString("source"))||payload.getJSONArray("courses").length()!=1)throw new AssertionError("Unknown portal was routed to school API");
        } else {
            if(calls.get()!=("noCookie".equals(mode)?0:1)||!real.config().source.equals(payload.optString("source"))||!real.name().equals(payload.optString("schoolName")))throw new AssertionError("School API path was not used");
            JSONArray actual=payload.getJSONArray("courses");
            if(expected.length()!=actual.length())throw new AssertionError("Course count differs");
            for(int i=0;i<expected.length();i++)for(String key:new String[]{"name","teacher","room","day","start","end","weeks"})
                if(!expected.getJSONObject(i).get(key).toString().equals(actual.getJSONObject(i).get(key).toString()))throw new AssertionError("School preview differs: "+key);
        }
        if(!before.equals(js(local,"AndroidLocal.readState()")))throw new AssertionError("Preview changed stored timetable");
        js(local,"document.querySelector('#cancelImport').click();true");
        test.runOnMainSync(offline::finish);test.waitForIdleSync();offline=null;portal=null;
    }

    private void enterAddress(String url) throws Exception {
        long until=System.currentTimeMillis()+10000;
        while(System.currentTimeMillis()<until){
            android.view.accessibility.AccessibilityNodeInfo root=test.getUiAutomation().getRootInActiveWindow();
            android.view.accessibility.AccessibilityNodeInfo input=findInput(root);
            if(input!=null){
                Bundle args=new Bundle();args.putCharSequence(android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,url);
                if(!input.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_TEXT,args))throw new AssertionError("Address input did not accept URL");
                for(android.view.accessibility.AccessibilityNodeInfo button:root.findAccessibilityNodeInfosByText("打开"))
                    if("打开".contentEquals(button.getText())&&button.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK))return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Address dialog not found");
    }
    private android.view.accessibility.AccessibilityNodeInfo findInput(android.view.accessibility.AccessibilityNodeInfo node){
        if(node==null)return null;
        if("android.widget.EditText".contentEquals(node.getClassName()))return node;
        for(int i=0;i<node.getChildCount();i++){android.view.accessibility.AccessibilityNodeInfo found=findInput(node.getChild(i));if(found!=null)return found;}
        return null;
    }
    private void awaitError(String route) throws Exception {
        long until=System.currentTimeMillis()+15000;
        while(System.currentTimeMillis()<until){
            android.view.accessibility.AccessibilityNodeInfo root=test.getUiAutomation().getRootInActiveWindow();
            if(root!=null&&!root.findAccessibilityNodeInfosByText("复制诊断").isEmpty()&&!root.findAccessibilityNodeInfosByText(route).isEmpty())return;
            Thread.sleep(100);
        }
        throw new AssertionError("Expected failure diagnostics missing");
    }
    private void checkGxuContract(SchoolAdapter gxu,JSONObject payload) throws Exception {
        JSONArray expected=new JSONArray(fixture("gxu","expected-courses.json")), actual=payload.getJSONArray("courses");
        if(expected.length()!=actual.length()||payload.toString().contains("FAKE-PRIVATE"))throw new AssertionError("GXU API leaked fields or changed count");
        for(int i=0;i<expected.length();i++)for(String key:new String[]{"name","teacher","room","day","start","end","weeks"})
            if(!expected.getJSONObject(i).get(key).toString().equals(actual.getJSONObject(i).get(key).toString()))throw new AssertionError("GXU API field differs: "+key);
        JSONObject context=new JSONObject().put("pageUrl",gxu.coursePageUrl()).put("xnm","2026").put("xqm","3").put("validate","token&test");
        String body=cn.ytu.timetable.adapters.GxuZhengfangAdapter.requestBody(gxu.config(),context);
        if(!body.contains("xnm=2026&xqm=3")||!body.contains("validate=token%26test")||!body.startsWith("kzlx=ck"))throw new AssertionError("Wrong read-only request parameters");
        context.put("pageUrl","https://evil.example/");
        boolean rejected=false;try{cn.ytu.timetable.adapters.GxuZhengfangAdapter.requestBody(gxu.config(),context);}catch(AdapterException expectedError){rejected=true;}
        if(!rejected)throw new AssertionError("Unrelated page supplied GXU semester");
        rejected=false;try{gxu.parseApi("{\"kbList\":[{\"kcmc\":\"missing-time\"}]}");}catch(AdapterException expectedError){rejected=true;}
        if(!rejected)throw new AssertionError("Missing schedule became a semester-long course");
    }
    private String fixture(String name) throws Exception {return fixture("ytu",name);}
    private String fixture(String school,String name) throws Exception {
        try(java.io.InputStream in=test.getContext().getAssets().open("schools/"+school+"/"+name)) {
            java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] bytes=new byte[4096];int size;
            while((size=in.read(bytes))!=-1)out.write(bytes,0,size);return out.toString("UTF-8");
        }
    }
    private WebView findWeb(android.view.View view) {
        if(view instanceof WebView)return (WebView)view;
        if(view instanceof android.view.ViewGroup)for(int i=0;i<((android.view.ViewGroup)view).getChildCount();i++){WebView found=findWeb(((android.view.ViewGroup)view).getChildAt(i));if(found!=null)return found;}
        return null;
    }
    private String js(WebView browser,String script) throws Exception {
        CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
        test.runOnMainSync(()->browser.evaluateJavascript(script,value->{result.set(value);latch.countDown();}));
        if(!latch.await(10,TimeUnit.SECONDS))throw new AssertionError("JavaScript callback timed out");return result.get();
    }
    private void await(WebView browser,String condition) throws Exception {
        long until=System.currentTimeMillis()+20000;
        while(System.currentTimeMillis()<until){if("true".equals(js(browser,condition)))return;Thread.sleep(100);}
        throw new AssertionError("Timed out: "+condition);
    }
}
