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

/** User-directed HTTPS browser without a JavaScript bridge or automatic portal actions. */
public final class SelfPortalActivity extends Activity {
    private final Set<String> allowedOrigins = Collections.synchronizedSet(new HashSet<>());
    private WebView portal;
    private TextView status;
    private Button read;
    private String collector;
    private int generation;

    private static String origin(String address) {
        try {
            Uri uri = Uri.parse(address);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || host.isEmpty()
                    || uri.getUserInfo() != null || uri.getPort() > 65535) return null;
            return "https://" + host.toLowerCase(java.util.Locale.ROOT) + (uri.getPort() == -1 || uri.getPort() == 443 ? "" : ":" + uri.getPort());
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
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon) { generation++; read.setEnabled(false); status.setText("网页正在加载…"); }
            @Override public void onPageFinished(WebView view,String url) { if (!url.equals(view.getUrl())) return; String current=origin(url); read.setEnabled(current != null && allowedOrigins.contains(current)); status.setText(current == null ? "请输入学校 HTTPS 网址。" : "当前网站："+current+"。请核对网址，进入课表页面后点击读取。"); }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,android.webkit.WebResourceError error) { if(request.isForMainFrame()) status.setText("网页加载失败，请检查网址、校园网或学校 VPN。跨站 POST 跳转可能不受支持。"); }
        });
        root.addView(portal,new LinearLayout.LayoutParams(-1,0,1)); setContentView(root);
        close.setOnClickListener(v->finish()); address.setOnClickListener(v->askAddress()); read.setOnClickListener(v->collect());
        try { collector = "(function(){var module={exports:{}};\n" + SchoolRegistry.readAsset(this,"core.js") + "\nvar Timetable=module.exports; var result = " + SchoolRegistry.readAsset(this,"schools/self-extract.js") + "\nreturn result;})()"; }
        catch (Exception error) { new AlertDialog.Builder(this).setMessage("读取组件加载失败，请使用 Excel、HTML 或通用表格导入。").setPositiveButton("确定",(d,w)->finish()).show(); return; }
        askAddress();
    }

    private void askAddress() {
        EditText input = new EditText(this); input.setSingleLine(true); input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI); input.setHint("https://教务系统或统一认证网址");
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("输入学校网址").setMessage("请确认网址属于学校。应用无法验证网站身份；请勿在不信任的网站输入账号密码。仅支持 HTTPS。")
                .setView(input).setNegativeButton("取消",(d,w)->{if(portal.getUrl()==null) finish();}).setPositiveButton("打开",null).create();
        dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{ String url=input.getText().toString().trim(); String target=origin(url); if(target==null){input.setError("请输入完整的 HTTPS 网址");return;} allowedOrigins.add(target); dialog.dismiss(); portal.loadUrl(url); }));
        dialog.setOnCancelListener(d->{if(portal.getUrl()==null)finish();}); dialog.show();
    }
    private boolean navigate(String url) {
        String target=origin(url);
        if(target==null){status.setText("仅允许打开 HTTPS 网页，其他链接已拦截。");return true;}
        if(allowedOrigins.contains(target))return false;
        new AlertDialog.Builder(this).setTitle("确认跳转网站").setMessage("即将打开："+target+"\n请确认这是学校登录或教务流程需要的网站，再继续输入账号密码。")
            .setNegativeButton("取消",null).setPositiveButton("继续",(d,w)->{allowedOrigins.add(target);portal.loadUrl(url);}).show();
        return true;
    }
    private void collect() {
        String current=origin(portal.getUrl()); if(current==null||!allowedOrigins.contains(current)||collector==null)return;
        final int request=++generation; read.setEnabled(false); status.setText("正在尝试识别当前页面课表…");
        portal.evaluateJavascript(collector,reply->{
            if(request!=generation||isFinishing()||isDestroyed())return;
            read.setEnabled(true);
            try {
                Object value=new JSONTokener(reply).nextValue(); if(!(value instanceof String))throw new Exception();
                String text=(String)value; if(text.getBytes(StandardCharsets.UTF_8).length>PortalImportActivity.MAX_RESULT_BYTES)throw new Exception();
                JSONObject data=new JSONObject(text); if(data.has("error")) { fail(data.optString("error")); return; }
                if(!"self-portal".equals(data.optString("source"))||data.optJSONArray("courses")==null||data.optJSONArray("courses").length()==0||data.optJSONArray("courses").length()>100)throw new Exception();
                setResult(RESULT_OK,new Intent().putExtra("portalTimetable",text)); finish();
            } catch(Exception error){fail("未能识别当前页面的完整课表。请导出 Excel、保存课表页面为 HTML，或使用通用表格导入。原课表未修改。");}
        });
    }
    private void fail(String text){status.setText("未导入课表，请检查页面或使用文件导入。");new AlertDialog.Builder(this).setTitle("读取课表未完成").setMessage(text).setPositiveButton("确定",null).setNeutralButton("刷新页面",(d,w)->portal.reload()).show();}
    @Override public void onBackPressed(){if(portal.canGoBack())portal.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){generation++; if(portal!=null){portal.stopLoading();portal.clearHistory();portal.clearFormData();portal.clearCache(true);portal.destroy();CookieManager.getInstance().removeAllCookies(null);synchronized(allowedOrigins){for(String item:allowedOrigins)WebStorage.getInstance().deleteOrigin(item);}}super.onDestroy();}
}
