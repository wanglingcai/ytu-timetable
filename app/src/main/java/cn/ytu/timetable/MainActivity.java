package cn.ytu.timetable;

import android.app.Activity;
import android.app.AlertDialog;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.AtomicFile;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.JsResult;
import android.widget.Toast;
import android.widget.FrameLayout;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Offline UI. Only packaged assets are allowed to run beside the private storage bridge. */
public final class MainActivity extends Activity {
    private static final int PICK_FILE = 100, SAVE_BACKUP = 101, IMPORT_PORTAL = 102;
    private static final int MAX_IMPORT_BYTES = 12 * 1024 * 1024;
    private static final int MAX_STATE_BYTES = 4 * 1024 * 1024;
    private WebView web;
    private AtomicFile stateFile;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private String pendingBackup;
    private JSONObject pendingPortalImport;
    private boolean localUiReady;

    @SuppressLint("SetJavaScriptEnabled") // Packaged local UI requires JS; network/navigation blocked, imports rendered as text.
    @Override public void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        getWindow().setStatusBarColor(Color.rgb(247, 247, 241));
        getWindow().setNavigationBarColor(Color.rgb(247, 247, 241));
        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        stateFile = new AtomicFile(new File(getFilesDir(), "timetable.json"));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(247, 247, 241));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setTextZoom(100);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                localUiReady = "file:///android_asset/index.html".equals(url);
                if (localUiReady && pendingPortalImport != null) {
                    event("receivePortalImport",pendingPortalImport);
                    pendingPortalImport = null;
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String uri = request.getUrl().toString();
                if (uri.startsWith("file:///android_asset/")) return null;
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message)
                    .setPositiveButton("确定", (dialog, which) -> result.confirm())
                    .setNegativeButton("取消", (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
        });
        web.addJavascriptInterface(new LocalBridge(), "AndroidLocal");
        FrameLayout container = new FrameLayout(this);
        container.setBackgroundColor(Color.rgb(247, 247, 241));
        container.addView(web, new FrameLayout.LayoutParams(-1, -1));
        container.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(container);
        web.loadUrl("file:///android_asset/index.html");
    }

    private void event(String name, JSONObject payload) {
        runOnUiThread(() -> { if (!isDestroyed()) web.evaluateJavascript("window." + name + "(" + payload.toString() + ")", null); });
    }

    private void error(String message) {
        JSONObject data = new JSONObject();
        try { data.put("message", message); } catch (Exception ignored) { }
        event("receiveNativeError", data);
    }

    public final class LocalBridge {
        @JavascriptInterface public void importPortal() {
            runOnUiThread(() -> startActivityForResult(new Intent(MainActivity.this, PortalImportActivity.class), IMPORT_PORTAL));
        }
        @JavascriptInterface public String readState() {
            synchronized (stateFile) {
                try (InputStream input = stateFile.openRead()) { return new String(readBounded(input, MAX_STATE_BYTES), StandardCharsets.UTF_8); }
                catch (FileNotFoundException missing) { return ""; }
                catch (Exception failed) { return "{\"storageError\":true}"; }
            }
        }

        @JavascriptInterface public boolean saveState(String json) {
            if (json == null) return false;
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_STATE_BYTES) return false;
            try { new JSONObject(json); } catch (Exception invalid) { return false; }
            synchronized (stateFile) {
                FileOutputStream output = null;
                try { output = stateFile.startWrite(); output.write(bytes); stateFile.finishWrite(output); return true; }
                catch (Exception failed) { if (output != null) stateFile.failWrite(output); return false; }
            }
        }

        @JavascriptInterface public void importFile() {
            runOnUiThread(() -> {
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
                try { startActivityForResult(pick, PICK_FILE); }
                catch (Exception failed) { error("无法打开文件选择器，请检查系统文件管理器。"); }
            });
        }

        @JavascriptInterface public void exportBackup(String json) {
            if (json == null || json.getBytes(StandardCharsets.UTF_8).length > MAX_STATE_BYTES) { error("备份数据超出大小限制。"); return; }
            pendingBackup = json;
            runOnUiThread(() -> {
                Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE);
                save.putExtra(Intent.EXTRA_TITLE, "下节啥课-备份.json");
                try { startActivityForResult(save, SAVE_BACKUP); }
                catch (Exception failed) { error("无法打开备份保存窗口。"); }
            });
        }
    }

    private static byte[] readBounded(InputStream input, int limit) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            if (output.size() + read > limit) throw new IOException("文件太大");
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == IMPORT_PORTAL) {
            if (result != RESULT_OK || data == null) return;
            try {
                String text = data.getStringExtra("portalTimetable");
                if (text == null || text.getBytes(StandardCharsets.UTF_8).length > PortalImportActivity.MAX_RESULT_BYTES) throw new IOException();
                JSONObject payload = new JSONObject(text);
                if (localUiReady) event("receivePortalImport",payload); else pendingPortalImport = payload;
            } catch (Exception failed) { error("教务课表读取失败，原课表未修改。"); }
            return;
        }
        if (result != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (request == PICK_FILE) worker.execute(() -> {
            try (InputStream input = getContentResolver().openInputStream(uri)) {
                if (input == null) throw new IOException();
                String name = uri.getLastPathSegment() == null ? "课表" : uri.getLastPathSegment();
                try (android.database.Cursor cursor = getContentResolver().query(uri, new String[]{android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0);
                }
                JSONObject payload = new JSONObject();
                payload.put("name", name);
                payload.put("data", Base64.encodeToString(readBounded(input, MAX_IMPORT_BYTES), Base64.NO_WRAP));
                event("receiveImport", payload);
            } catch (Exception failed) { error("读取文件失败。请选择可访问且不超过 12 MB 的课表文件。"); }
        });
        if (request == SAVE_BACKUP) {
            final String snapshot = pendingBackup;
            pendingBackup = null;
            if (snapshot == null) { error("备份会话已结束，请重新点击导出。"); return; }
            worker.execute(() -> {
                try (OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
                    if (output == null) throw new IOException();
                    output.write(snapshot.getBytes(StandardCharsets.UTF_8));
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "备份已保存", Toast.LENGTH_SHORT).show());
                } catch (Exception failed) { error("备份保存失败，请重新选择保存位置。"); }
            });
        }
    }

    @Override public void onBackPressed() {
        web.evaluateJavascript("window.handleAndroidBack && window.handleAndroidBack()", value -> { if (!"true".equals(value)) super.onBackPressed(); });
    }
    @Override protected void onDestroy() {
        worker.shutdown();
        if (web != null) { web.removeJavascriptInterface("AndroidLocal"); web.destroy(); }
        super.onDestroy();
    }
}
