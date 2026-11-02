package cn.ytu.timetable;

import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Immutable, asset-backed configuration for a school portal. */
public final class SchoolConfig {
    public final String id, name, platform, source, entryUrl, resultUrl, dataUrl, extractorAsset, readMethod, parser;
    public final String resultHost, resultPath, statusHint;
    public final Set<String> allowedHosts, allowedHttpHosts, captchaHosts;
    public final Map<String, Set<Integer>> allowedPorts;

    private SchoolConfig(JSONObject json) throws Exception {
        id = required(json, "id");
        name = required(json, "name");
        platform = required(json, "platform");
        source = required(json, "source");
        entryUrl = required(json, "entryUrl");
        resultUrl = required(json, "resultUrl");
        dataUrl = required(json, "dataUrl");
        extractorAsset = required(json, "extractorAsset");
        readMethod = json.optString("readMethod", "api_then_dom").trim();
        parser = json.optString("parser", source).trim();
        resultHost = required(json, "resultHost").toLowerCase(Locale.ROOT);
        resultPath = required(json, "resultPath");
        statusHint = json.optString("statusHint", "请先完成学校官网登录，再进入课表页面。");
        allowedHosts = strings(json.optJSONArray("allowedHosts"));
        allowedHttpHosts = strings(json.optJSONArray("allowedHttpHosts"));
        captchaHosts = strings(json.optJSONArray("captchaHosts"));
        allowedPorts = ports(json.optJSONObject("allowedPorts"));
        if (allowedHosts.isEmpty()) throw new IllegalArgumentException("学校配置缺少 allowedHosts");
        if (!allowedHosts.containsAll(allowedHttpHosts)) throw new IllegalArgumentException("HTTP 主机必须同时在学校域名白名单中");
        if (!allowed(entryUrl) || !allowed(resultUrl) || !allowed(dataUrl) || parseHttps(dataUrl) == null || !isResultPage(resultUrl))
            throw new IllegalArgumentException("学校地址不在白名单中、课表地址不匹配或课表接口未使用 HTTPS");
    }

    public static SchoolConfig fromJson(JSONObject json) throws Exception { return new SchoolConfig(json); }

    public boolean allowed(String rawUrl) {
        Uri uri = parseHttps(rawUrl);
        if (uri == null) {
            try {
                Uri http = Uri.parse(rawUrl);
                return "http".equalsIgnoreCase(http.getScheme()) && http.getUserInfo() == null && http.getHost() != null
                    && allowedHttpHosts.contains(http.getHost().toLowerCase(Locale.ROOT))
                    && (http.getPort() == -1 || http.getPort() == 80);
            } catch (Exception ignored) { return false; }
        }
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        if (!allowedHosts.contains(host)) return false;
        int port = uri.getPort();
        if (port == -1 || port == 443) return true;
        Set<Integer> ports = allowedPorts.get(host);
        return ports != null && ports.contains(port);
    }

    public boolean isResultPage(String rawUrl) {
        if (!allowed(rawUrl)) return false;
        Uri uri = Uri.parse(rawUrl);
        return resultHost.equalsIgnoreCase(uri.getHost()) && resultPath.equals(uri.getPath());
    }

    public boolean resourceAllowed(String rawUrl) {
        if (allowed(rawUrl)) return true;
        Uri uri = parseHttps(rawUrl);
        if (uri == null) return false;
        if (uri.getPort() != -1 && uri.getPort() != 443) return false;
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        return captchaHosts.contains(host) || captchaHosts.stream().anyMatch(item ->
            host.endsWith("." + item));
    }

    private static Uri parseHttps(String rawUrl) {
        if (rawUrl == null) return null;
        try {
            Uri uri = Uri.parse(rawUrl);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null || uri.getHost() == null) return null;
            int port = uri.getPort();
            if (port != -1 && port != 443 && port < 1) return null;
            return uri;
        } catch (Exception ignored) { return null; }
    }

    private static String required(JSONObject json, String key) {
        String value = json.optString(key, "").trim();
        if (value.isEmpty()) throw new IllegalArgumentException("学校配置缺少 " + key);
        return value;
    }

    private static Set<String> strings(JSONArray values) {
        Set<String> result = new HashSet<>();
        if (values == null) return result;
        for (int i = 0; i < values.length(); i++) {
            String value = values.optString(i, "").trim().toLowerCase(Locale.ROOT);
            if (!value.isEmpty()) result.add(value);
        }
        return result;
    }

    private static Map<String, Set<Integer>> ports(JSONObject object) {
        Map<String, Set<Integer>> result = new HashMap<>();
        if (object == null) return result;
        java.util.Iterator<String> keys = object.keys();
        while (keys.hasNext()) {
            String host = keys.next().toLowerCase(Locale.ROOT);
            JSONArray values = object.optJSONArray(host);
            Set<Integer> ports = new HashSet<>();
            if (values != null) for (int i = 0; i < values.length(); i++) {
                int port = values.optInt(i, -1);
                if (port > 0 && port <= 65535) ports.add(port);
            }
            result.put(host, ports);
        }
        return result;
    }
}
