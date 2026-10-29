package cn.ytu.timetable;

import org.json.JSONObject;

/** @deprecated Kept as a compatibility facade for existing instrumentation checks. */
@Deprecated
final class PortalCourseData {
    static final class InvalidData extends Exception {
        final String code;
        InvalidData(String code) { super(code); this.code=code; }
    }

    static JSONObject toPayload(JSONObject response) throws Exception {
        try { return cn.ytu.timetable.adapters.YtuUrpAdapter.toPayload(response); }
        catch (cn.ytu.timetable.adapters.YtuUrpAdapter.InvalidData error) { throw new InvalidData(error.code); }
    }
}
