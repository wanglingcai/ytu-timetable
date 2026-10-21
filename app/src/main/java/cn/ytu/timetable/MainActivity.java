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
    private static final int PICK_FILE = 100, SAVE_BACKUP = 101, IMPORT_PORTAL = 102, PICK_BACKGROUND=104;
    private static final int MAX_IMPORT_BYTES = 12 * 1024 * 1024;
    private static final int MAX_STATE_BYTES = 4 * 1024 * 1024;
    private WebView web;
    private AtomicFile stateFile;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private String pendingBackup;
    private JSONObject pendingPortalImport;
    private boolean localUiReady;
    private JSONObject pendingReminder;

    @SuppressLint("SetJavaScriptEnabled") // Packaged local UI requires JS; network/navigation blocked, imports rendered as text.
    @Override public void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        getWindow().setStatusBarColor(Color.rgb(244, 248, 255));
        getWindow().setNavigationBarColor(Color.rgb(244, 248, 255));
        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        stateFile = new AtomicFile(new File(getFilesDir(), "timetable.json"));
        captureReminder(getIntent());
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(244, 248, 255));
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
                deliverReminder();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String uri = request.getUrl().toString();
                if(AppearanceStore.IMAGE_URL.equals(uri.split("\\?",2)[0])) {
                    try {return new WebResourceResponse("image/jpeg",null,200,"OK",java.util.Collections.singletonMap("Cache-Control","no-store"),AppearanceStore.openImage(MainActivity.this));}
                    catch(IOException missing){return new WebResourceResponse("image/jpeg",null,new ByteArrayInputStream(new byte[0]));}
                }
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
        container.setBackgroundColor(Color.rgb(244, 248, 255));
        container.addView(web, new FrameLayout.LayoutParams(-1, -1));
        container.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                android.graphics.Insets keyboard = insets.getInsets(android.view.WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(container);
        web.loadUrl("file:///android_asset/index.html");
    }

    private void event(String name, JSONObject payload) {
        runOnUiThread(() -> { if (!isDestroyed()) web.evaluateJavascript("if(typeof window."+name+"==='function')window." + name + "(" + payload.toString() + ")", null); });
    }

    private void error(String message) {
        JSONObject data = new JSONObject();
        try { data.put("message", message); } catch (Exception ignored) { }
        event("receiveNativeError", data);
    }

    private void captureReminder(Intent intent) {
        if(intent==null||!"cn.ytu.timetable.OPEN_REMINDER".equals(intent.getAction()))return;
        try {
            String id=intent.getStringExtra("courseId"),date=intent.getStringExtra("occurrenceDate");
            if(id==null||id.length()>100||date==null||!date.matches("\\d{4}-\\d{2}-\\d{2}"))return;
            pendingReminder=new JSONObject().put("id",id).put("date",date);
        }catch(Exception ignored){}
    }
    private void deliverReminder() {
        if(localUiReady&&pendingReminder!=null){event("openReminder",pendingReminder);pendingReminder=null;}
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);setIntent(intent);captureReminder(intent);deliverReminder();
    }
    @Override protected void onResume() {
        super.onResume();
        worker.execute(()->{ReminderScheduler.refresh(getApplicationContext(),false);event("refreshReminderStatus",new JSONObject());});
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results) {
        super.onRequestPermissionsResult(request,permissions,results);
        if(request==103)worker.execute(()->{ReminderScheduler.refresh(getApplicationContext(),false);event("refreshReminderStatus",new JSONObject());});
    }

    public final class LocalBridge {
        @JavascriptInterface public String readAppearance(){return AppearanceStore.read(MainActivity.this).toString();}
        @JavascriptInterface public boolean saveAppearance(String json){return AppearanceStore.save(MainActivity.this,json);}
        @JavascriptInterface public void chooseBackground() {
            runOnUiThread(()->{try{startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE),PICK_BACKGROUND);}catch(Exception failed){error("无法打开系统图片选择器。");}});
        }
        @JavascriptInterface public void clearBackground() {
            worker.execute(()->{try{AppearanceStore.clear(MainActivity.this);event("receiveAppearance",AppearanceStore.read(MainActivity.this));}catch(Exception failed){error("恢复默认背景失败，请重试。");}});
        }
        @JavascriptInterface public String reminderStatus() {return ReminderScheduler.status(MainActivity.this);}
        @JavascriptInterface public void reminderPermission(String kind) {
            runOnUiThread(()->{
                try {
                    if("exact".equals(kind)) {
                        if(android.os.Build.VERSION.SDK_INT>=31)startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));
                    } else if(android.os.Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED
                        &&!getPreferences(MODE_PRIVATE).getBoolean("notificationAsked",false)) {
                        getPreferences(MODE_PRIVATE).edit().putBoolean("notificationAsked",true).apply();
                        requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},103);
                    } else {
                        startActivity(new Intent(android.provider.Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                            .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,getPackageName()).putExtra(android.provider.Settings.EXTRA_CHANNEL_ID,ReminderScheduler.CHANNEL));
                    }
                }catch(Exception unavailable){error("无法打开提醒权限设置，请在系统设置中找到本应用并检查通知权限。");}
            });
        }
        @JavascriptInterface public void importPortal() {
            runOnUiThread(() -> startActivityForResult(new Intent(MainActivity.this, PortalImportActivity.class), IMPORT_PORTAL));
        }
        @JavascriptInterface public String readState() {
            synchronized (ReminderScheduler.LOCK) {
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
            synchronized (ReminderScheduler.LOCK) {
                FileOutputStream output = null;
                try { output = stateFile.startWrite(); output.write(bytes); stateFile.finishWrite(output); }
                catch (Exception failed) { if (output != null) stateFile.failWrite(output); return false; }
                ReminderScheduler.refresh(MainActivity.this,true);
                return true;
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
        if(request==PICK_BACKGROUND) {
            worker.execute(()->{
                try(InputStream input=getContentResolver().openInputStream(uri)) {
                    if(input==null)throw new IOException("无法读取这张图片");
                    AppearanceStore.importImage(MainActivity.this,input);event("receiveAppearance",AppearanceStore.read(MainActivity.this));
                }catch(Exception failed){error(failed.getMessage()==null?"背景图片读取失败，原背景未修改。":failed.getMessage());}
            });return;
        }
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
