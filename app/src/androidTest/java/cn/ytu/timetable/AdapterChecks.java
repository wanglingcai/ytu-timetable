package cn.ytu.timetable;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Runs production adapter parsing and the bundled collector inside Android WebView. */
final class AdapterChecks {
    private final Instrumentation instrumentation;
    private Activity activity;
    private WebView web;

    AdapterChecks(Instrumentation instrumentation) { this.instrumentation = instrumentation; }

    void run() {
        Bundle report = new Bundle();
        try {
            SchoolAdapter adapter = SchoolRegistry.load(instrumentation.getTargetContext()).get("ytu");
            if (adapter == null) throw new AssertionError("YTU adapter missing");
            checkAllowlist(adapter.config());
            JSONArray expected = new JSONArray(fixture("expected-courses.json"));
            JSONObject api = adapter.parseApi(fixture("api-response.json"));
            assertCourses(expected, api.getJSONArray("courses"));
            if (api.toString().contains("FAKE-NOT-TO-KEEP") || api.toString().contains("mock-private-field")) throw new AssertionError("API leaked non-course fields");
            boolean rejected = false;
            try { adapter.parseApi("{\"unrelated\":true}"); }
            catch (cn.ytu.timetable.adapters.YtuUrpAdapter.InvalidData error) { rejected = "API_SCHEMA".equals(error.code); }
            if (!rejected) throw new AssertionError("Changed API schema was accepted");

            Intent intent = instrumentation.getTargetContext().getPackageManager().getLaunchIntentForPackage(instrumentation.getTargetContext().getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = instrumentation.startActivitySync(intent);
            instrumentation.runOnMainSync(() -> { web = new WebView(activity); web.getSettings().setJavaScriptEnabled(true); });
            load(fixture("course-result.html"));
            JSONObject dom = collect(adapter);
            assertCourses(expected, dom.getJSONArray("courses"));
            assertCourses(api.getJSONArray("courses"), dom.getJSONArray("courses"));
            if (dom.has("rows") || dom.toString().contains("fake-password")) throw new AssertionError("DOM output contains non-course data");
            load("<table id='courseTable'><tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr><tr><th>第1节</th><td><div class='class_div'><p>课程新版</p><p>未知时间</p></div></td><td></td><td></td></tr></table>");
            JSONObject changed = collect(adapter);
            if (!"UNSUPPORTED_LAYOUT".equals(changed.optString("code")) || !changed.optString("error").contains("HTML 或 Excel") || changed.has("courses")) throw new AssertionError("Changed layout must show file fallback");
            checkPortalError(adapter);
            report.putString("stream", "\nPASS: adapter API and Android WebView agree on all fields, odd/even weeks; URL policy and changed layout dialog checked.\n");
            instrumentation.finish(Activity.RESULT_OK, report);
        } catch (Throwable error) {
            report.putString("stream", "\nFAIL: " + error + "\n");
            instrumentation.finish(Activity.RESULT_CANCELED, report);
        } finally {
            if (web != null) instrumentation.runOnMainSync(() -> web.destroy());
            if (activity != null) instrumentation.runOnMainSync(() -> activity.finish());
        }
    }

    private void checkPortalError(SchoolAdapter adapter) throws Exception {
        CountDownLatch cleared = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> android.webkit.CookieManager.getInstance().removeAllCookies(value -> cleared.countDown()));
        if (!cleared.await(10, TimeUnit.SECONDS)) throw new AssertionError("Cookie cleanup timed out");
        Intent intent = new Intent(instrumentation.getTargetContext(), PortalImportActivity.class)
            .putExtra(PortalImportActivity.EXTRA_SCHOOL_ID, adapter.id()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity portalActivity = instrumentation.startActivitySync(intent);
        try {
            WebView portal = findWeb(portalActivity.getWindow().getDecorView());
            android.widget.Button read = findRead(portalActivity.getWindow().getDecorView());
            if (portal == null || read == null) throw new AssertionError("Portal controls missing");
            String html = "<table id='courseTable'><tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr><tr><th>第1节</th><td><div class='class_div'><p>课程新版</p><p>未知时间</p></div></td><td></td><td></td></tr></table>";
            instrumentation.runOnMainSync(() -> { portal.stopLoading(); portal.loadDataWithBaseURL(adapter.coursePageUrl(), html, "text/html", "UTF-8", adapter.coursePageUrl()); });
            long deadline = System.currentTimeMillis() + 15000;
            while (System.currentTimeMillis() < deadline && !read.isEnabled()) Thread.sleep(100);
            if (!read.isEnabled()) throw new AssertionError("Portal read button not enabled");
            instrumentation.runOnMainSync(read::performClick);
            deadline = System.currentTimeMillis() + 15000;
            while (System.currentTimeMillis() < deadline) {
                android.view.accessibility.AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
                if (root != null && !root.findAccessibilityNodeInfosByText("当前学校页面结构发生变化").isEmpty()
                    && !root.findAccessibilityNodeInfosByText("HTML 或 Excel 导入").isEmpty()
                    && !root.findAccessibilityNodeInfosByText("原课表未修改").isEmpty()) return;
                Thread.sleep(100);
            }
            throw new AssertionError("Changed layout dialog did not show the fallback and unchanged timetable message");
        } finally { instrumentation.runOnMainSync(portalActivity::finish); }
    }

    private static WebView findWeb(android.view.View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) view;
            for (int i=0; i<group.getChildCount(); i++) { WebView found = findWeb(group.getChildAt(i)); if (found != null) return found; }
        }
        return null;
    }

    private static android.widget.Button findRead(android.view.View view) {
        if (view instanceof android.widget.Button && "读取课表".contentEquals(((android.widget.Button) view).getText())) return (android.widget.Button) view;
        if (view instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) view;
            for (int i=0; i<group.getChildCount(); i++) { android.widget.Button found = findRead(group.getChildAt(i)); if (found != null) return found; }
        }
        return null;
    }

    private void checkAllowlist(SchoolConfig config) throws Exception {
        if (!config.allowed(config.entryUrl) || !config.allowed(config.resultUrl) || !config.allowed(config.dataUrl)
            || !config.allowed("https://ehall.ytu.edu.cn:4106/")
            || config.allowed("http://jwxs.ytu.edu.cn/")
            || config.allowed("https://jwxs.ytu.edu.cn.evil.example/")
            || config.allowed("https://cas.ytu.edu.cn@evil.example/")
            || config.allowed("https://jwxs.ytu.edu.cn:8443/")
            || config.allowed("https://other.ytu.edu.cn/")
            || config.isResultPage("https://cas.ytu.edu.cn/student/courseSelect/courseSelectResult/index")
            || !config.isResultPage(config.resultUrl)
            || config.allowed("https://c.dun.163.com/")
            || !config.resourceAllowed("https://c.dun.163.com/api")
            || config.resourceAllowed("https://c.dun.163.com.evil.example/")
            || config.resourceAllowed("https://c.dun.163.com:8443/")
            || config.resourceAllowed("http://cstaticdun.126.net/")) throw new AssertionError("URL allowlist");
        JSONObject invalid = new JSONObject(SchoolRegistry.readAsset(instrumentation.getTargetContext(), "schools/ytu/config.json"));
        invalid.put("dataUrl", "https://evil.example/api");
        boolean rejected = false;
        try { SchoolConfig.fromJson(invalid); } catch (IllegalArgumentException expected) { rejected = true; }
        if (!rejected) throw new AssertionError("Unlisted API URL accepted");
    }

    private String fixture(String name) throws Exception {
        try (InputStream input = instrumentation.getContext().getAssets().open("schools/ytu/" + name)) {
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private void load(String html) throws Exception {
        CountDownLatch loaded = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> {
            web.setWebViewClient(new WebViewClient() { @Override public void onPageFinished(WebView view, String url) { loaded.countDown(); } });
            web.loadDataWithBaseURL("https://jwxs.ytu.edu.cn/", html, "text/html", "UTF-8", null);
        });
        if (!loaded.await(15, TimeUnit.SECONDS)) throw new AssertionError("WebView page timed out");
    }

    private JSONObject collect(SchoolAdapter adapter) throws Exception {
        String script = PortalImportActivity.collectorScript(instrumentation.getTargetContext(), adapter);
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> reply = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> web.evaluateJavascript(script, value -> { reply.set(value); done.countDown(); }));
        if (!done.await(15, TimeUnit.SECONDS)) throw new AssertionError("Collector timed out");
        Object value = new JSONTokener(reply.get()).nextValue();
        if (!(value instanceof String)) throw new AssertionError("Collector did not return JSON string: " + reply.get());
        return new JSONObject((String) value);
    }

    private static void assertCourses(JSONArray expected, JSONArray actual) throws Exception {
        if (expected.length() != actual.length()) throw new AssertionError("Course count differs: " + actual);
        Map<String, JSONObject> actualByKey = new HashMap<>();
        for (int i=0; i<actual.length(); i++) {
            JSONObject item = actual.getJSONObject(i);
            String key = item.getString("name") + "|" + item.getInt("day") + "|" + item.getInt("start");
            if (actualByKey.put(key, item) != null) throw new AssertionError("Duplicate course: " + key);
        }
        for (int i=0; i<expected.length(); i++) {
            JSONObject item = expected.getJSONObject(i);
            String key = item.getString("name") + "|" + item.getInt("day") + "|" + item.getInt("start");
            JSONObject found = actualByKey.get(key);
            if (found == null) throw new AssertionError("Missing course: " + key);
            for (String field : new String[]{"name", "teacher", "room", "day", "start", "end"})
                if (!item.get(field).equals(found.get(field))) throw new AssertionError(key + " differs at " + field);
            if (!item.getJSONArray("weeks").toString().equals(found.getJSONArray("weeks").toString())) throw new AssertionError(key + " differs at weeks");
            if (found.length() != 7) throw new AssertionError("Unexpected course fields: " + found);
        }
    }
}
