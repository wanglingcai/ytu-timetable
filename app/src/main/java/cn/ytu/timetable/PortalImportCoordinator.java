package cn.ytu.timetable;

import android.content.Context;
import org.json.JSONArray;

/** Resolves a registered school without exposing registry details to activities. */
public final class PortalImportCoordinator {
    private final SchoolRegistry registry;

    private PortalImportCoordinator(SchoolRegistry registry) { this.registry = registry; }

    public static PortalImportCoordinator load(Context context) throws Exception {
        return new PortalImportCoordinator(SchoolRegistry.load(context));
    }

    public SchoolAdapter adapter(String schoolId) {
        if (schoolId == null || schoolId.trim().isEmpty()) return registry.defaultAdapter();
        SchoolAdapter adapter = registry.get(schoolId);
        if (adapter == null) throw new IllegalArgumentException("未注册的学校");
        return adapter;
    }

    public JSONArray schools() throws Exception { return registry.toJson(); }
}
