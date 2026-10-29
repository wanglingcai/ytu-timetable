package cn.ytu.timetable;

import org.json.JSONObject;
import java.util.Set;

/** A read-only adapter for one school's official timetable portal. */
public interface SchoolAdapter {
    int MAX_RESULT_BYTES = 240 * 1024;

    String id();
    String name();
    String loginUrl();
    String coursePageUrl();
    String extractorAsset();
    String readMethod();
    String parser();
    Set<String> allowedHosts();
    SchoolConfig config();

    /** Applies the adapter's HTTPS allowlist to a browser URL. */
    default boolean allows(String url) { return config().allowed(url); }
    /** Allows only the configured course page as the read target. */
    default boolean isCoursePage(String url) { return config().isResultPage(url); }
    /** Captcha and other explicitly configured subresources may be loaded in the WebView. */
    default boolean allowsResource(String url) { return config().resourceAllowed(url); }

    /** Reads and normalizes the official read-only API response. */
    JSONObject readApi(String cookie, String userAgent) throws AdapterException;
    JSONObject parseApi(String json) throws Exception;
}
