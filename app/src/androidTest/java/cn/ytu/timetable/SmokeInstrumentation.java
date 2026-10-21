package cn.ytu.timetable;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** No test framework dependencies: exercises the actual APK, native file reader and private storage. */
public final class SmokeInstrumentation extends Instrumentation {
    private Activity activity;
    private int checks;
    private boolean verifyExisting;
    private final StringBuilder report = new StringBuilder();
    @Override public void onCreate(Bundle args) { super.onCreate(args); verifyExisting=args!=null && "true".equals(args.getString("verifyExisting")); start(); }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            launch();
            await("document.readyState==='complete' && !!window.receiveImport");
            if(verifyExisting) {
                check("JSON.parse(AndroidLocal.readState()).courses.length>0 && document.querySelector('#emptyState').hidden", "覆盖安装保留并加载原有课表");
                check("document.querySelectorAll('.course-card').length===JSON.parse(AndroidLocal.readState()).courses.length", "覆盖安装后显示全部课程安排");
                check("document.querySelectorAll('.course-card.inactive').length>0", "覆盖安装后非本周课程显示为灰色");
                js("document.querySelector('.course-card.inactive').click();true");
                check("document.querySelector('#courseDetail').textContent.includes('不上课（非本周）')", "覆盖安装后灰色课程可查看实际周次");
                result.putString("stream", "\nPASS: " + checks + " Android upgrade checks\n" + report);
                finish(Activity.RESULT_OK,result);return;
            }
            check("document.querySelector('#emptyState').hidden===false", "首次启动无示例冒充真实课表");
            File input = new File(getTargetContext().getCacheDir(), "native-test.csv");
            String csv="课程名称,星期,节次,周次,教师,教室\n原生测试单周,星期一,1-2,1-18单周,测试教师,A101\n原生测试双周,星期二,3-4,1-18双周,测试教师,B202\n原生测试指定周,星期六,1-2,第3周,测试教师,C303";
            Files.write(input.toPath(), csv.getBytes(StandardCharsets.UTF_8));
            runOnMainSync(() -> ((MainActivity)activity).onActivityResult(100, Activity.RESULT_OK, new Intent().setData(Uri.fromFile(input))));
            await("document.querySelector('#importDialog').open");
            check("document.querySelectorAll('#previewList .list-card').length===3", "通过原生文件流导入 CSV 并预览三门课程");
            js("document.querySelector('#importStart').value='2026-08-31';document.querySelector('#reviewCheck').checked=true;document.querySelector('#saveImport').click();true");
            await("!document.querySelector('#importDialog').open");
            check("JSON.parse(AndroidLocal.readState()).courses.length===3", "数据写入 Android 应用私有文件");
            js("document.querySelector('#weekSelect').value='2';document.querySelector('#weekSelect').dispatchEvent(new Event('change'));true");
            check("document.querySelectorAll('.course-card:not(.inactive)').length===1 && document.querySelector('.course-card:not(.inactive)').textContent.includes('双周')", "双周仅双周课正常着色");
            check("document.querySelectorAll('.course-card.inactive').length===2", "非本周课程仍以灰色保留");
            js("document.querySelector('.course-card.inactive').click();true");
            check("document.querySelector('#courseDetail').textContent.includes('第 2 周不上课（非本周）')", "灰色课程详情明确标注所选周不上课");
            js("document.querySelector('#courseDialog').close();true");
            js("document.querySelector('#weekSelect').value='3';document.querySelector('#weekSelect').dispatchEvent(new Event('change'));true");
            check("document.querySelectorAll('.course-card:not(.inactive)').length===2", "指定周和单周课程同时正常着色");
            runOnMainSync(() -> activity.finish());
            waitForIdleSync();launch();await("document.readyState==='complete' && !!window.receiveImport");
            check("document.querySelector('#emptyState').hidden===true && JSON.parse(AndroidLocal.readState()).courses.length===3", "销毁并重建 Activity 后恢复本地课表");
            js("document.querySelector('#weekSelect').value='2';document.querySelector('#weekSelect').dispatchEvent(new Event('change'));document.querySelector('.course-card:not(.inactive)').click();true");
            check("document.querySelector('#courseDialog').open && document.querySelector('#courseDetail').textContent.includes('B202')", "原生 WebView 中详情对话框可用");
            js("document.querySelector('#courseDialog').close();document.querySelector('#weekSelect').value='3';document.querySelector('#weekSelect').dispatchEvent(new Event('change'));true");
            check("document.documentElement.scrollWidth<=innerWidth", "手机界面没有横向溢出");
            if (!PortalImportActivity.allowed("https://cas.ytu.edu.cn/lyuapServer/login")
                || !PortalImportActivity.isResultPage(PortalImportActivity.RESULT_URL)
                || PortalImportActivity.allowed("http://jwxs.ytu.edu.cn/")
                || PortalImportActivity.allowed("https://jwxs.ytu.edu.cn.evil.example/")
                || PortalImportActivity.allowed("https://cas.ytu.edu.cn@evil.example/")
                || PortalImportActivity.allowed("https://jwxs.ytu.edu.cn:8443/")
                || PortalImportActivity.isResultPage("https://cas.ytu.edu.cn/student/courseSelect/courseSelectResult/index")) throw new AssertionError("Portal URL policy");
            checks++; report.append("✓ 教务网址仅允许两个官方 HTTPS 主机和准确课表路径\n");
            if (!PortalImportActivity.resourceAllowed("https://cstaticdun.126.net/load.min.js")
                || !PortalImportActivity.resourceAllowed("https://c.dun.163.com/api/v2/getconf")
                || !PortalImportActivity.resourceAllowed("https://necaptcha.nosdn.127.net/image.png")
                || PortalImportActivity.allowed("https://c.dun.163.com/")
                || PortalImportActivity.resourceAllowed("https://c.dun.163.com.evil.example/")
                || PortalImportActivity.resourceAllowed("http://cstaticdun.126.net/load.min.js")) throw new AssertionError("Captcha resource policy");
            checks++; report.append("✓ 易盾 HTTPS 资源可加载，主页面仍限制为学校域名\n");
            Activity offline = activity;
            ActivityMonitor portalMonitor=addMonitor(PortalImportActivity.class.getName(),null,false);
            js("AndroidLocal.importPortal();true");
            activity=waitForMonitorWithTimeout(portalMonitor,10000);
            removeMonitor(portalMonitor);
            if(activity==null)throw new AssertionError("Portal activity not opened");
            final WebView remote=findWeb(activity.getWindow().getDecorView());
            String mock="<table id='courseTable'><tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr><tr><th>第1节</th><td><div class='class_div'><p>官网登录模拟课</p><p>模拟教师*</p><p>1-16周双周</p><p>1-2节</p><p>模拟楼101</p></div></td><td></td><td></td></tr></table>";
            String delayed="<html><body>课程加载中<script>setTimeout(function(){document.body.innerHTML="+org.json.JSONObject.quote(mock)+";},1800);</script></body></html>";
            runOnMainSync(()->remote.loadDataWithBaseURL(PortalImportActivity.RESULT_URL,delayed,"text/html","UTF-8",PortalImportActivity.RESULT_URL));
            await("document.readyState==='complete'");
            check("typeof AndroidLocal==='undefined'", "官网 WebView 无本地存储桥接接口");
            CountDownLatch cookiesCleared=new CountDownLatch(1);
            runOnMainSync(()->android.webkit.CookieManager.getInstance().removeAllCookies(value->cookiesCleared.countDown()));
            if(!cookiesCleared.await(5,TimeUnit.SECONDS))throw new AssertionError("Mock cookie cleanup timed out");
            runOnMainSync(()->findReadButton(activity.getWindow().getDecorView()).performClick());
            activity=offline;
            await("document.querySelector('#importDialog').open");
            check("document.querySelectorAll('#previewList .list-card').length===1 && document.querySelector('#previewList').textContent.includes('模拟教师')", "原生读取自动等待异步课程，Activity 结果进入课表预览");
            check("JSON.parse(AndroidLocal.readState()).courses.length===3", "官网读取只打开预览，未确认前不覆盖已有课表");
            js("document.querySelector('#cancelImport').click();true");
            final org.json.JSONObject apiPayload;
            try(java.io.InputStream fixture=getContext().getAssets().open("urp-response.json")) {
                String json=new java.util.Scanner(fixture,"UTF-8").useDelimiter("\\A").next();
                apiPayload=PortalCourseData.toPayload(new org.json.JSONObject(json));
            }
            if(apiPayload.getJSONArray("rows").length()!=4 || apiPayload.getJSONArray("warnings").length()!=1
                || apiPayload.toString().contains("FAKE-NOT-TO-KEEP") || apiPayload.toString().contains("mock-private-field"))throw new AssertionError("API fixture mapping or field filtering");
            checks++;report.append("✓ 官网接口模拟响应转换三条安排，仅保留课表字段\n");
            boolean invalidRejected=false;
            try{PortalCourseData.toPayload(new org.json.JSONObject("{\"unrelated\":true}"));}catch(PortalCourseData.InvalidData expected){invalidRejected=true;}
            if(!invalidRejected)throw new AssertionError("Unexpected API response accepted");
            checks++;report.append("✓ 非课表接口响应被拒绝，不生成空课表\n");
            runOnMainSync(()->((MainActivity)activity).onActivityResult(102,Activity.RESULT_OK,new Intent().putExtra("portalTimetable",apiPayload.toString())));
            await("document.querySelector('#importDialog').open");
            check("document.querySelectorAll('#previewList .list-card').length===3 && document.querySelector('#previewList').textContent.includes('教师甲 教师乙') && document.querySelector('#previewList').textContent.includes('10-11 周')", "官网结构化响应进入同一导入预览，保留教师和实际周次");
            js("document.querySelector('#cancelImport').click();true");
            result.putString("stream", "\nPASS: " + checks + " Android checks\n" + report);
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "\nFAIL after " + checks + " checks: " + error + "\n" + report);
            finish(Activity.RESULT_CANCELED, result);
        }
    }
    private void launch() {
        Intent intent=getTargetContext().getPackageManager().getLaunchIntentForPackage(getTargetContext().getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity=startActivitySync(intent);
    }
    private WebView findWeb(View view) {
        if(view instanceof WebView)return (WebView)view;
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){WebView found=findWeb(((ViewGroup)view).getChildAt(i));if(found!=null)return found;}
        return null;
    }
    private Button findReadButton(View view) {
        if(view instanceof Button && "读取课表".contentEquals(((Button)view).getText()))return (Button)view;
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){Button found=findReadButton(((ViewGroup)view).getChildAt(i));if(found!=null)return found;}
        return null;
    }
    private String js(String script) throws Exception {
        CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        runOnMainSync(()->findWeb(activity.getWindow().getDecorView()).evaluateJavascript(script,reply->{value.set(reply);latch.countDown();}));
        if(!latch.await(10, TimeUnit.SECONDS))throw new AssertionError("JavaScript callback timed out");
        return value.get();
    }
    private void await(String expression) throws Exception {
        long deadline=System.currentTimeMillis()+20000;
        while(System.currentTimeMillis()<deadline){if("true".equals(js(expression)))return;Thread.sleep(100);}
        throw new AssertionError("Condition timed out: "+expression);
    }
    private void check(String expression,String label) throws Exception {
        if(!"true".equals(js(expression)))throw new AssertionError(label+" / "+expression);
        checks++;report.append("✓ ").append(label).append('\n');
    }
}
