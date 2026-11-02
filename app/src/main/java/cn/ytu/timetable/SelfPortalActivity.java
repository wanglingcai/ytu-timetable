package cn.ytu.timetable;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/** User-directed portal browser without a JavaScript bridge or automatic portal actions. */
public final class SelfPortalActivity extends Activity {
    private final Set<String> allowedOrigins = Collections.synchronizedSet(new HashSet<>());
    private WebView portal;
    private TextView status;
    private Button read;
    private String collector;
    private String contextScript;
    private String readRoute="尚未识别";
    private String apiFailure="";
    private String selectedPage="";
    private boolean collecting;
    private SchoolRegistry registeredSchools;
    private int generation;
    private final android.os.Handler callbacks = new android.os.Handler(android.os.Looper.getMainLooper());
    private final java.util.concurrent.ExecutorService network = java.util.concurrent.Executors.newSingleThreadExecutor();

    private static String origin(String address) {
        try {
            Uri uri = Uri.parse(address);
            String host = uri.getHost();
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(java.util.Locale.ROOT);
            if ((!"https".equals(scheme) && !"http".equals(scheme)) || host == null || host.isEmpty()
                    || uri.getUserInfo() != null || uri.getPort() == 0 || uri.getPort() > 65535) return null;
            int port = uri.getPort();
            return scheme + "://" + host.toLowerCase(java.util.Locale.ROOT) + (port == -1 || ("https".equals(scheme) && port == 443) || ("http".equals(scheme) && port == 80) ? "" : ":" + port);
        } catch (Exception error) { return null; }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(247,247,241));
        root.setOnApplyWindowInsetsListener((view, insets) -> { if (android.os.Build.VERSION.SDK_INT >= 30) { android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout()); view.setPadding(bars.left,bars.top,bars.right,bars.bottom); } else view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom()); return insets; });
        LinearLayout actions = new LinearLayout(this); Button close = new Button(this), address = new Button(this); read = new Button(this);
        close.setText("关闭"); address.setText("输入网址"); read.setText("尝试读取课表"); read.setEnabled(false);
        for (Button button : new Button[]{close,address,read}) actions.addView(button,new LinearLayout.LayoutParams(0,-2,1)); root.addView(actions);
        status = new TextView(this); status.setTextSize(12); int pad=(int)(10*getResources().getDisplayMetrics().density); status.setPadding(pad,pad/2,pad,pad/2); status.setText("请确认学校网址，登录后手动进入课表页面。"); root.addView(status);
        portal = new WebView(this); WebSettings settings=portal.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true); settings.setLoadWithOverviewMode(true); settings.setUseWideViewPort(true); settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); settings.setSaveFormData(false); settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        CookieManager.getInstance().setAcceptThirdPartyCookies(portal,true); portal.setWebChromeClient(new android.webkit.WebChromeClient());
        portal.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return request.isForMainFrame() && navigate(request.getUrl().toString()); }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return navigate(url); }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String target = origin(request.getUrl().toString());
                if (target != null && (!request.isForMainFrame() || allowedOrigins.contains(target))) return null;
                return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon) { generation++; collecting=false; read.setEnabled(false); status.setText("网页正在加载…"); }
            @Override public void onPageFinished(WebView view,String url) { if (!url.equals(view.getUrl()) || collecting) return; String current=origin(url); read.setEnabled(current != null && allowedOrigins.contains(current)); status.setText(current == null ? "请输入学校 HTTP 或 HTTPS 网址。" : "当前网址："+displayUrl(url)+(current.startsWith("http://") ? "（未加密）" : "")+"。进入课表页面后点击读取。"); }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,android.webkit.WebResourceError error) { if(request.isForMainFrame()) status.setText("网页加载失败，请检查网址、校园网或学校 VPN。跨站 POST 跳转可能不受支持。"); }
        });
        root.addView(portal,new LinearLayout.LayoutParams(-1,0,1)); setContentView(root);
        close.setOnClickListener(v->finish()); address.setOnClickListener(v->askAddress()); read.setOnClickListener(v->collect());
        try { collector = "(function(){var module={exports:{}};\n" + SchoolRegistry.readAsset(this,"core.js") + "\nvar Timetable=module.exports; var result = " + SchoolRegistry.readAsset(this,"schools/self-extract.js") + "\nreturn result;})()"; }
        catch (Exception error) { new AlertDialog.Builder(this).setMessage("读取组件加载失败，请使用 Excel、HTML 或通用表格导入。").setPositiveButton("确定",(d,w)->finish()).show(); return; }
        try { contextScript=SchoolRegistry.readAsset(this,"schools/page-context.js");registeredSchools=SchoolRegistry.load(this); }
        catch (Exception error) { fail("学校读取配置加载失败，请重新安装测试包后重试。");return; }
        askAddress();
    }

    private void askAddress() {
        EditText input = new EditText(this); input.setSingleLine(true); input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI); input.setHint("http:// 或 https:// 教务系统网址");
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("输入学校网址").setMessage("请确认网址属于学校，应用无法验证网站身份。优先使用 HTTPS；HTTP 连接不加密。")
                .setView(input).setNegativeButton("取消",(d,w)->{if(portal.getUrl()==null) finish();}).setPositiveButton("打开",null).create();
        dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            String url=input.getText().toString().trim(); String target=origin(url);
            if(target==null){input.setError("请输入完整的 HTTP 或 HTTPS 网址");return;}
            if(target.startsWith("http://")) {
                new AlertDialog.Builder(this).setTitle("HTTP 连接未加密")
                    .setMessage("即将打开："+target+"\n账号、密码和课表等信息可能被网络上的其他人读取或篡改。请核对网址，优先使用学校提供的 HTTPS 入口。")
                    .setNegativeButton("取消",null).setPositiveButton("仍要打开",(warning,which)->{allowedOrigins.add(target);dialog.dismiss();portal.loadUrl(url);}).show();
            } else {allowedOrigins.add(target);dialog.dismiss();portal.loadUrl(url);}
        }));
        dialog.setOnCancelListener(d->{if(portal.getUrl()==null)finish();}); dialog.show();
    }
    private boolean navigate(String url) {
        String target=origin(url);
        if(target==null){status.setText("仅允许打开 HTTP 或 HTTPS 网页，其他链接已拦截。");return true;}
        if(allowedOrigins.contains(target))return false;
        String warning=target.startsWith("http://") ? "\n此连接未加密，账号、密码和课表等信息可能被网络上的其他人读取或篡改。" : "";
        new AlertDialog.Builder(this).setTitle("确认跳转网站").setMessage("即将打开："+target+warning+"\n请确认这是学校登录或教务流程需要的网站。")
            .setNegativeButton("取消",null).setPositiveButton("继续",(d,w)->{allowedOrigins.add(target);portal.loadUrl(url);}).show();
        return true;
    }
    private static final class ReadTarget {
        final SchoolAdapter adapter;
        final String url;
        ReadTarget(SchoolAdapter adapter,String url){this.adapter=adapter;this.url=url;}
    }
    private boolean active(int request) {
        return request==generation&&!isFinishing()&&!isDestroyed();
    }
    /** Match both the top-level page and actual iframe addresses. No cookies go to page-provided endpoints. */
    private void resolveTarget(int request,java.util.function.Consumer<ReadTarget> callback) {
        if(!active(request))return;
        SchoolAdapter direct=registeredSchools.forCoursePage(portal.getUrl());
        if(direct!=null){callback.accept(new ReadTarget(direct,portal.getUrl()));return;}
        portal.evaluateJavascript(contextScript,reply->{
            if(!active(request))return;
            ReadTarget target=null;
            try {
                Object value=new JSONTokener(reply).nextValue();
                if(!(value instanceof String)||((String)value).length()>128*1024)throw new Exception();
                org.json.JSONArray urls=new org.json.JSONArray((String)value);
                for(int i=0;i<urls.length()&&i<40;i++){
                    String url=urls.optString(i);
                    SchoolAdapter adapter=registeredSchools.forCoursePage(url);
                    if(adapter!=null){target=new ReadTarget(adapter,url);break;}
                }
            }catch(Exception ignored){apiFailure="页面地址检查未完成";}
            if(target==null){
                SchoolAdapter portalAdapter=registeredSchools.forPortalPage(portal.getUrl());
                if(portalAdapter!=null)target=new ReadTarget(portalAdapter,portal.getUrl());
            }
            callback.accept(target);
        });
    }
    private void verifyTarget(int request,SchoolAdapter adapter,Runnable next) {
        if(!active(request))return;
        if(adapter==null){next.run();return;}
        resolveTarget(request,target->{
            if(target==null||!adapter.id().equals(target.adapter.id())){
                fail("课表页面已切换，请重新进入选课结果后读取。");return;
            }
            next.run();
        });
    }
    private void collect() {
        String current=origin(portal.getUrl());
        if(collecting||current==null||!allowedOrigins.contains(current)||collector==null)return;
        final int request=++generation;
        collecting=true;read.setEnabled(false);readRoute="正在检查页面";apiFailure="";selectedPage="";
        status.setText("正在检查当前网页和嵌入的课表页面…");
        callbacks.postDelayed(()->{if(active(request))fail("读取超时，请等待课表加载完成后重试。");},20000);
        resolveTarget(request,target->{
            SchoolAdapter adapter=target==null?null:target.adapter;
            readRoute=adapter==null?"通用网页":adapter.name()+"适配器";
            selectedPage=target==null?"":displayUrl(target.url);
            String script=collector;
            if(adapter!=null){
                try{script=PortalImportActivity.collectorScript(this,adapter);}
                catch(Exception error){fail("学校读取组件加载失败，请使用 HTML 或 Excel 导入。");return;}
                String cookie=CookieManager.getInstance().getCookie(adapter.config().dataUrl);
                if(adapter.readMethod().contains("api")&&cookie!=null&&!cookie.trim().isEmpty()){
                    readOfficialData(request,adapter,script,cookie,portal.getSettings().getUserAgentString());return;
                }
                apiFailure="学校课表会话尚未建立，请确认已进入教务系统并完成登录";
            }
            collectAttempt(request,0,adapter,script);
        });
    }
    private void readOfficialData(int request,SchoolAdapter adapter,String script,String cookie,String userAgent) {
        status.setText("已识别"+adapter.name()+"，正在向学校查询完整课表…");
        if(adapter.readContextAsset().isEmpty()){
            queryOfficialData(request,adapter,script,cookie,userAgent,new JSONObject());return;
        }
        try{
            portal.evaluateJavascript(SchoolRegistry.readAsset(this,adapter.readContextAsset()),reply->{
                if(!active(request))return;
                JSONObject context=new JSONObject();
                try{Object value=new JSONTokener(reply).nextValue();if(value instanceof String&&((String)value).length()<16*1024)context=new JSONObject((String)value);}catch(Exception ignored){}
                queryOfficialData(request,adapter,script,cookie,userAgent,context);
            });
        }catch(Exception error){apiFailure="未能读取当前学期，请在网页重新查询课表";collectAttempt(request,0,adapter,script);}
    }
    private void queryOfficialData(int request,SchoolAdapter adapter,String script,String cookie,String userAgent,JSONObject context) {
        network.execute(()->{
            JSONObject result=null;String reason="";
            try{result=adapter.readApi(cookie,userAgent,context);}
            catch(AdapterException error){reason=error.code.name()+"："+error.getMessage();}
            catch(Exception error){reason="学校课表接口未完成";}
            final JSONObject data=result;final String failure=reason;
            callbacks.post(()->{
                if(!active(request))return;
                apiFailure=failure;
                verifyTarget(request,adapter,()->{
                    if(data!=null)completeRead(request,data,adapter);
                    else collectAttempt(request,0,adapter,script);
                });
            });
        });
    }
    private void collectAttempt(int request,int attempt,SchoolAdapter adapter,String script) {
        if(!active(request))return;
        status.setText(readRoute+" · "+(attempt==0?"正在读取页面课程…":"正在等待完整课表加载…"));
        portal.evaluateJavascript(script,reply->{
            if(!active(request))return;
            try{
                Object value=new JSONTokener(reply).nextValue();
                if(!(value instanceof String))throw new Exception();
                String text=(String)value;
                if(text.getBytes(StandardCharsets.UTF_8).length>PortalImportActivity.MAX_RESULT_BYTES)throw new Exception();
                JSONObject data=new JSONObject(text);
                if(data.has("error")){
                    if(data.optBoolean("retryable")&&attempt<6){callbacks.postDelayed(()->collectAttempt(request,attempt+1,adapter,script),700);return;}
                    fail(data.optString("error"));return;
                }
                verifyTarget(request,adapter,()->completeRead(request,data,adapter));
            }catch(Exception error){fail("网页未返回有效课表，请尝试刷新页面或导入 HTML 文件。");}
        });
    }
    private void completeRead(int request,JSONObject data,SchoolAdapter adapter) {
        try{
            String source=adapter==null?"self-portal":adapter.config().source;
            if(!source.equals(data.optString("source"))||data.optJSONArray("courses")==null||data.optJSONArray("courses").length()==0||data.optJSONArray("courses").length()>100)throw new Exception();
            if(adapter==null){finishRead(data);return;}
            data.put("schoolName",adapter.name());
            portal.evaluateJavascript(PortalImportActivity.semesterScript(this),reply->{
                if(!active(request))return;
                try{Object value=new JSONTokener(reply).nextValue();if(value instanceof String&&((String)value).length()<1024)data.put("semester",new JSONObject((String)value));}catch(Exception ignored){}
                verifyTarget(request,adapter,()->finishRead(data));
            });
        }catch(Exception error){fail("课表数据无效，请使用 HTML 或 Excel 导入。");}
    }
    private void finishRead(JSONObject data) {
        String text=data.toString();
        if(text.getBytes(StandardCharsets.UTF_8).length>PortalImportActivity.MAX_RESULT_BYTES){fail("课表结果过大，请使用文件导入。");return;}
        generation++;collecting=false;callbacks.removeCallbacksAndMessages(null);
        setResult(RESULT_OK,new Intent().putExtra("portalTimetable",text));finish();
    }
    private static String displayUrl(String url) {
        try{
            Uri uri=Uri.parse(url);String site=origin(url);String path=uri.getEncodedPath();
            if(site==null)return "尚未打开网页";
            return site+(path==null?"":path.length()>200?path.substring(0,200)+"…":path);
        }catch(Exception ignored){return "无法显示网址";}
    }
    private String diagnostics() {
        String version="";
        try{version=getPackageManager().getPackageInfo(getPackageName(),0).versionName;}catch(Exception ignored){}
        return "版本："+version+"\n读取方式："+readRoute+"\n当前网页："+displayUrl(portal==null?null:portal.getUrl())
            +(selectedPage.isEmpty()?"":"\n学校页面："+selectedPage)+(apiFailure.isEmpty()?"":"\n接口状态："+apiFailure);
    }
    private void fail(String text) {
        generation++;collecting=false;callbacks.removeCallbacksAndMessages(null);if(read!=null)read.setEnabled(true);
        if(status!=null)status.setText("未导入课表 · "+readRoute);
        String details=diagnostics();
        new AlertDialog.Builder(this).setTitle("读取课表未完成").setMessage(text+"\n原课表未修改。\n\n"+details)
            .setPositiveButton("确定",null).setNeutralButton("刷新页面",(d,w)->portal.reload())
            .setNegativeButton("复制诊断",(d,w)->{
                android.content.ClipboardManager clipboard=(android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(android.content.ClipData.newPlainText("课表导入诊断",details));
                android.widget.Toast.makeText(this,"已复制网址和读取状态，不含 Cookie 和登录参数",android.widget.Toast.LENGTH_SHORT).show();
            }).show();
    }
    @Override public void onBackPressed(){if(portal.canGoBack())portal.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){generation++; callbacks.removeCallbacksAndMessages(null);network.shutdownNow(); if(portal!=null){portal.stopLoading();portal.clearHistory();portal.clearFormData();portal.clearCache(true);portal.destroy();CookieManager.getInstance().removeAllCookies(null);synchronized(allowedOrigins){for(String item:allowedOrigins)WebStorage.getInstance().deleteOrigin(item);}}super.onDestroy();}
}
