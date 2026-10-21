package cn.ytu.timetable;

import android.annotation.SuppressLint;
import android.app.Activity;
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
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Official-site browser, deliberately without the local storage JavaScript bridge. */
public final class PortalImportActivity extends Activity {
    static final String RESULT_URL = "https://jwxs.ytu.edu.cn/student/courseSelect/courseSelectResult/index";
    static final int MAX_RESULT_BYTES = 240 * 1024;
    private WebView portal;
    private TextView status;
    private Button read;
    private String collector;

    static boolean allowed(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        return "https".equalsIgnoreCase(uri.getScheme()) && uri.getUserInfo() == null
            && (uri.getPort() == -1 || uri.getPort() == 443)
            && ("jwxs.ytu.edu.cn".equalsIgnoreCase(uri.getHost()) || "cas.ytu.edu.cn".equalsIgnoreCase(uri.getHost()));
    }

    static boolean isResultPage(String url) {
        if (!allowed(url)) return false;
        Uri uri = Uri.parse(url);
        return "jwxs.ytu.edu.cn".equalsIgnoreCase(uri.getHost())
            && "/student/courseSelect/courseSelectResult/index".equals(uri.getPath());
    }

    @SuppressLint("SetJavaScriptEnabled") // Official SSO requires JS; no native JS interfaces are exposed.
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(247,247,241));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                view.setPadding(bars.left,bars.top,bars.right,bars.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets;
        });
        LinearLayout actions = new LinearLayout(this);
        Button close = new Button(this), result = new Button(this);
        read = new Button(this);
        close.setText("关闭"); result.setText("选课结果"); read.setText("读取课表");
        for (Button button : new Button[]{close,result,read}) actions.addView(button,new LinearLayout.LayoutParams(0,-2,1));
        root.addView(actions);
        status = new TextView(this);
        status.setTextSize(12);
        int padding = (int)(10 * getResources().getDisplayMetrics().density);
        status.setPadding(padding,padding/2,padding,padding/2);
        status.setText("请在学校官网登录，再点「选课结果」→「读取课表」。关闭窗口后清理应用内登录会话。");
        root.addView(status);
        portal = new WebView(this);
        WebSettings settings = portal.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSaveFormData(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        CookieManager.getInstance().setAcceptThirdPartyCookies(portal,false);
        portal.setWebChromeClient(new android.webkit.WebChromeClient());
        portal.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (allowed(request.getUrl().toString())) return false;
                message("当前仅支持学校的教务和统一认证 HTTPS 页面。");
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (allowed(request.getUrl().toString())) return null;
                return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onPageFinished(WebView view, String url) {
                status.setText(isResultPage(url) ? "学校官网 · 选课结果：等待课程加载完成后点击「读取课表」。" : "学校官网 · 请自行登录，登录成功后点击上方「选课结果」。");
            }
        });
        portal.setDownloadListener((url,agent,disposition,mime,length) -> message("无需导出 PDF，请点击上方「读取课表」。"));
        root.addView(portal,new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);
        close.setOnClickListener(view -> finish());
        result.setOnClickListener(view -> portal.loadUrl(RESULT_URL));
        read.setOnClickListener(view -> collect());
        try (InputStream input = getAssets().open("portal-extract.js")) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096]; int size;
            while ((size=input.read(buffer)) != -1) output.write(buffer,0,size);
            collector = output.toString(StandardCharsets.UTF_8.name());
            portal.loadUrl(RESULT_URL);
        } catch (Exception error) { message("无法加载读取组件，请重新安装应用。"); read.setEnabled(false); }
    }

    private void collect() {
        if (!isResultPage(portal.getUrl())) { message("请先完成学校官网登录，再打开「选课结果」。"); return; }
        read.setEnabled(false);
        portal.evaluateJavascript(collector, reply -> {
            read.setEnabled(true);
            if (isFinishing() || isDestroyed()) return;
            if (!isResultPage(portal.getUrl())) { message("页面已切换，请重新打开选课结果后读取。"); return; }
            try {
                Object value = new JSONTokener(reply).nextValue();
                if (!(value instanceof String)) throw new IllegalArgumentException();
                String text = (String)value;
                if (text.getBytes(StandardCharsets.UTF_8).length > MAX_RESULT_BYTES) throw new IllegalArgumentException();
                JSONObject data = new JSONObject(text);
                if (data.has("error")) { message(data.getString("error")); return; }
                if (!"ytu-urp".equals(data.getString("source")) || data.getJSONArray("rows").length()>100) throw new IllegalArgumentException();
                setResult(RESULT_OK,new Intent().putExtra("portalTimetable",text));
                finish();
            } catch (Exception error) { message("未能读取有效课表，请等待加载完成后重试，或使用 HTML 文件导入。"); }
        });
    }

    private void message(String text) { Toast.makeText(this,text,Toast.LENGTH_LONG).show(); }

    @Override public void onBackPressed() {
        if (portal.canGoBack()) portal.goBack(); else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (portal != null) {
            portal.stopLoading(); portal.clearHistory(); portal.clearFormData(); portal.clearCache(true); portal.destroy();
            CookieManager.getInstance().removeAllCookies(null);
            WebStorage.getInstance().deleteOrigin("https://cas.ytu.edu.cn");
            WebStorage.getInstance().deleteOrigin("https://jwxs.ytu.edu.cn");
        }
        super.onDestroy();
    }
}
