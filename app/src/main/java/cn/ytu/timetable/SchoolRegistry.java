package cn.ytu.timetable;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import cn.ytu.timetable.adapters.YtuUrpAdapter;

/** Loads the allowlisted school adapters bundled with the application. */
public final class SchoolRegistry {
    private static final String REGISTRY_ASSET = "schools/registry.json";
    private final Map<String, SchoolAdapter> adapters;

    private SchoolRegistry(Map<String, SchoolAdapter> adapters) { this.adapters = adapters; }

    public static SchoolRegistry load(Context context) throws Exception {
        Object parsed = new org.json.JSONTokener(readAsset(context, REGISTRY_ASSET)).nextValue();
        JSONArray schools = parsed instanceof JSONArray ? (JSONArray) parsed : ((JSONObject) parsed).optJSONArray("schools");
        if (schools == null || schools.length() == 0) throw new IllegalArgumentException("学校注册表为空");
        Map<String, SchoolAdapter> result = new LinkedHashMap<>();
        for (int i = 0; i < schools.length(); i++) {
            JSONObject entry = schools.optJSONObject(i);
            if (entry == null) throw new IllegalArgumentException("学校注册表格式无效");
            String id = entry.optString("id", "").trim();
            String configPath = entry.optString("config", "schools/" + id + "/config.json").trim();
            String adapter = entry.optString("adapter", "").trim();
            if (id.isEmpty() || configPath.isEmpty() || adapter.isEmpty()) throw new IllegalArgumentException("学校注册项不完整");
            SchoolConfig config = SchoolConfig.fromJson(new JSONObject(readAsset(context, configPath)));
            if (!id.equals(config.id)) throw new IllegalArgumentException("学校注册 ID 与配置不一致");
            if ("ytu-urp".equals(adapter)) result.put(id, new YtuUrpAdapter(config));
            else throw new IllegalArgumentException("未知学校适配器：" + adapter);
        }
        return new SchoolRegistry(result);
    }

    public SchoolAdapter get(String id) { return adapters.get(id == null ? "" : id.trim()); }
    public SchoolAdapter defaultAdapter() { return adapters.values().iterator().next(); }
    public List<SchoolAdapter> all() { return Collections.unmodifiableList(new ArrayList<>(adapters.values())); }

    public JSONArray toJson() throws Exception {
        JSONArray result = new JSONArray();
        for (SchoolAdapter adapter : adapters.values()) {
            result.put(new JSONObject().put("id", adapter.id()).put("name", adapter.name()));
        }
        return result;
    }

    static String readAsset(Context context, String path) throws Exception {
        try (InputStream input = context.getAssets().open(path)) {
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[4096]; int size;
            while ((size = input.read(buffer)) != -1) output.write(buffer, 0, size);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
}
