package cn.ytu.timetable;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Generic, read-only portal browser. School-specific URLs and parsing live in adapters. */
public final class PortalImportActivity extends Activity {
    public static final String EXTRA_SCHOOL_ID = "schoolId";
    public static final int MAX_RESULT_BYTES = 240 * 1024;

    private WebView portal;
    private TextView status;
    private Button read;
    private String collector;
    private SchoolAdapter adapter;
    private final Handler callbacks = new Handler(Looper.getMainLooper());
    private int readGeneration;
    private boolean collecting;
    private final ExecutorService network = Executors.newSingleThreadExecutor();

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        try {
            PortalImportCoordinator coordinator = PortalImportCoordinator.load(this);
            String requested = getIntent().getStringExtra(EXTRA_SCHOOL_ID);
            adapter = coordinator.adapter(requested);
        } catch (Exception error) {
            Toast.makeText(this, "学校适配器加载失败，请使用 HTML 或 Excel 导入。", Toast.LENGTH_LONG).show(); finish(); return;
        }
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(247,247,241));
        root.setOnApplyWindowInsetsListener((view, insets) -> { if (android.os.Build.VERSION.SDK_INT >= 30) { android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout()); view.setPadding(bars.left,bars.top,bars.right,bars.bottom); } else view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom()); return insets; });
        LinearLayout actions = new LinearLayout(this); Button close = new Button(this), result = new Button(this); read = new Button(this); close.setText("关闭"); result.setText("课表页面"); read.setText("读取课表"); for (Button button : new Button[]{close,result,read}) actions.addView(button,new LinearLayout.LayoutParams(0,-2,1)); root.addView(actions);
        status = new TextView(this); status.setTextSize(12); int padding=(int)(10*getResources().getDisplayMetrics().density); status.setPadding(padding,padding/2,padding,padding/2); status.setText(adapter.config().statusHint); root.addView(status);
        portal = new WebView(this); WebSettings settings=portal.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true); settings.setLoadWithOverviewMode(true); settings.setUseWideViewPort(true); settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); settings.setSaveFormData(false); settings.setCacheMode(WebSettings.LOAD_NO_CACHE); CookieManager.getInstance().setAcceptThirdPartyCookies(portal,true); portal.setWebChromeClient(new android.webkit.WebChromeClient());
        portal.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { String url=request.getUrl().toString(); if (request.isForMainFrame()?adapter.allows(url):adapter.allowsResource(url)) return false; message("当前仅支持"+adapter.name()+"官方 HTTPS 页面。"); return true; }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { if(adapter.allows(url)) return false; message("当前仅支持"+adapter.name()+"官方 HTTPS 页面。"); return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) { String url=request.getUrl().toString(); if(request.isForMainFrame()?adapter.allows(url):adapter.allowsResource(url)) return null; return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0])); }
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon) { readGeneration++; collecting=false; read.setEnabled(false); status.setText("学校网页正在加载，请稍候…"); }
            @Override public void onPageFinished(WebView view,String url) { if(!collecting) read.setEnabled(adapter.isCoursePage(url)); status.setText(adapter.isCoursePage(url)?adapter.name()+" · 课表页面：等待课程加载完成后点击「读取课表」。":adapter.config().statusHint); }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,android.webkit.WebResourceError error) { if(request.isForMainFrame()) status.setText("学校登录页面加载失败，请连接校园网或学校 VPN，并更新 Android System WebView。"); }
        });
        portal.setDownloadListener((url,agent,disposition,mime,length)->message("无需导出文件，请点击上方「读取课表」。")); root.addView(portal,new LinearLayout.LayoutParams(-1,0,1)); setContentView(root); close.setOnClickListener(view->finish()); result.setOnClickListener(view->portal.loadUrl(adapter.coursePageUrl())); read.setOnClickListener(view->collect());
        try {
            collector = collectorScript(this, adapter);
            portal.loadUrl(adapter.loginUrl());
        } catch(Exception error) { message("无法加载学校读取组件，请使用 HTML 或 Excel 导入。"); read.setEnabled(false); }
    }

    static String collectorScript(android.content.Context context, SchoolAdapter adapter) throws Exception {
        String core = SchoolRegistry.readAsset(context, "core.js");
        String extractor = SchoolRegistry.readAsset(context, adapter.extractorAsset());
        // Keep the parser in a private lexical scope, with no native bridge exposed to the portal.
        return "(function(){var module={exports:{}};\n" + core + "\nvar Timetable=module.exports; var result = " + extractor + "\nreturn result;})()";
    }

    private void collect() {
        if(!adapter.isCoursePage(portal.getUrl())) { readError("请先完成学校官网登录，再打开课表页面。",PortalErrorCode.RESULT_PAGE_NOT_FOUND); return; }
        if(collecting||collector==null)return; collecting=true; read.setEnabled(false); final int generation=++readGeneration; callbacks.postDelayed(()->{if(generation==readGeneration&&collecting&&!isFinishing()){stopRead();readError("读取超时，请刷新课表页面后重试。",PortalErrorCode.TIMEOUT);}},15000);
        String cookie=CookieManager.getInstance().getCookie(adapter.config().dataUrl);
        if (adapter.readMethod().contains("api") && cookie != null && !cookie.trim().isEmpty()) readOfficialData(generation,cookie,portal.getSettings().getUserAgentString());
        else collectAttempt(generation,0);
    }
    private void readOfficialData(int generation,String cookie,String userAgent) { status.setText("正在向学校查询完整课表…"); network.execute(()->{ JSONObject result=null; AdapterException failure=null; try{result=adapter.readApi(cookie,userAgent);}catch(AdapterException error){failure=error;} final JSONObject payload=result; final AdapterException reason=failure; callbacks.post(()->{if(generation!=readGeneration||isFinishing()||isDestroyed())return; if(!adapter.isCoursePage(portal.getUrl())){stopRead();readError("页面已切换，请重新打开课表页面后读取。",PortalErrorCode.RESULT_PAGE_NOT_FOUND);return;} if(payload!=null){completeRead(payload);return;} collectAttempt(generation,0);});}); }
    private void collectAttempt(int generation,int attempt) { if(generation!=readGeneration||isFinishing()||isDestroyed())return; status.setText(attempt==0?"正在读取页面中的课程…":"正在等待学校课程数据加载…"); portal.evaluateJavascript(collector,reply->{if(generation!=readGeneration||isFinishing()||isDestroyed())return; try{if(!adapter.isCoursePage(portal.getUrl()))throw new AdapterException(PortalErrorCode.RESULT_PAGE_NOT_FOUND,"页面已切换，请重新打开课表页面后读取。"); Object value=new JSONTokener(reply).nextValue(); if(!(value instanceof String))throw new IllegalArgumentException(); String text=(String)value; if(text.getBytes(StandardCharsets.UTF_8).length>MAX_RESULT_BYTES)throw new AdapterException(PortalErrorCode.RESPONSE_TOO_LARGE,"课表结果过大，请使用 HTML 或 Excel 导入。"); JSONObject data=new JSONObject(text); if(data.has("error")){boolean retryable=data.optBoolean("retryable"); if(retryable&&attempt<6){callbacks.postDelayed(()->collectAttempt(generation,attempt+1),700);return;} stopRead();readError(data.optString("error","当前学校页面结构发生变化，请使用 HTML 或 Excel 导入，或者提交学校适配请求。"),mapError(data.optString("code")));return;} if(!adapter.config().source.equals(data.optString("source"))||data.optJSONArray("courses")==null||data.optJSONArray("courses").length()==0||data.optJSONArray("courses").length()>100)throw new AdapterException(PortalErrorCode.UNSUPPORTED_LAYOUT,"当前学校页面结构发生变化，请使用 HTML 或 Excel 导入，或者提交学校适配请求。"); completeRead(data);}catch(AdapterException error){stopRead();readError(error.getMessage(),error.code);}catch(Exception error){stopRead();readError("当前学校页面结构发生变化，请使用 HTML 或 Excel 导入，或者提交学校适配请求。",PortalErrorCode.UNSUPPORTED_LAYOUT);}}); }
    private static PortalErrorCode mapError(String code) { if("NO_TABLE".equals(code)||"EMPTY_TABLE".equals(code)||"COURSE_NOT_FOUND".equals(code))return PortalErrorCode.COURSE_NOT_FOUND; if("FRAME_UNAVAILABLE".equals(code)||"MOBILE_DETAILS".equals(code)||"UNSUPPORTED_LAYOUT".equals(code))return PortalErrorCode.UNSUPPORTED_LAYOUT; if("API_SCHEMA_CHANGED".equals(code)||"API_SCHEMA".equals(code))return PortalErrorCode.API_SCHEMA_CHANGED; if("TIMEOUT".equals(code))return PortalErrorCode.TIMEOUT; return PortalErrorCode.UNSUPPORTED_LAYOUT; }
    private void completeRead(JSONObject data){try{data.put("schoolName",adapter.name());}catch(Exception ignored){}stopRead();setResult(RESULT_OK,new Intent().putExtra("portalTimetable",data.toString()).putExtra(EXTRA_SCHOOL_ID,adapter.id()));finish();}
    private void stopRead(){readGeneration++;collecting=false;if(read!=null&&portal!=null)read.setEnabled(adapter.isCoursePage(portal.getUrl()));}
    private void readError(String text,PortalErrorCode code){status.setText("课表未导入，请按提示重试。");String message=(code==PortalErrorCode.UNSUPPORTED_LAYOUT||code==PortalErrorCode.API_SCHEMA_CHANGED||code==PortalErrorCode.COURSE_NOT_FOUND)?"当前学校页面结构发生变化，请使用 HTML 或 Excel 导入，或者提交学校适配请求。":text;new AlertDialog.Builder(this).setTitle("读取课表未完成").setMessage(message+"\n原课表未修改。（"+code.name()+"）").setPositiveButton("确定",null).setNeutralButton("刷新页面",(dialog,which)->portal.reload()).show();}
    private void message(String text){Toast.makeText(this,text,Toast.LENGTH_LONG).show();}
    @Override public void onBackPressed(){if(portal.canGoBack())portal.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){readGeneration++;callbacks.removeCallbacksAndMessages(null);network.shutdownNow();if(portal!=null){portal.stopLoading();portal.clearHistory();portal.clearFormData();portal.clearCache(true);portal.destroy();CookieManager.getInstance().removeAllCookies(null);if(adapter!=null)for(String host:adapter.allowedHosts()){WebStorage.getInstance().deleteOrigin("https://"+host);java.util.Set<Integer> ports=adapter.config().allowedPorts.get(host);if(ports!=null)for(int port:ports)WebStorage.getInstance().deleteOrigin("https://"+host+":"+port);}}super.onDestroy();}
}
