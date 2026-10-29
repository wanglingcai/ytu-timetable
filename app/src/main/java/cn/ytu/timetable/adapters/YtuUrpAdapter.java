package cn.ytu.timetable.adapters;

import cn.ytu.timetable.SchoolAdapter;
import cn.ytu.timetable.SchoolConfig;
import cn.ytu.timetable.AdapterException;
import cn.ytu.timetable.PortalErrorCode;
import cn.ytu.timetable.StandardCourse;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.SocketTimeoutException;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Yantai University URP adapter. It only normalizes read-only timetable data. */
public final class YtuUrpAdapter implements SchoolAdapter {
    private final SchoolConfig config;
    public YtuUrpAdapter(SchoolConfig config) { this.config = config; }
    @Override public String id() { return config.id; }
    @Override public String name() { return config.name; }
    @Override public String loginUrl() { return config.entryUrl; }
    @Override public String coursePageUrl() { return config.resultUrl; }
    @Override public String extractorAsset() { return config.extractorAsset; }
    @Override public String readMethod() { return config.readMethod; }
    @Override public String parser() { return config.parser; }
    @Override public Set<String> allowedHosts() { return config.allowedHosts; }
    @Override public SchoolConfig config() { return config; }

    @Override public JSONObject readApi(String cookie, String userAgent) throws AdapterException {
        if (cookie == null || cookie.trim().isEmpty())
            throw new AdapterException(PortalErrorCode.LOGIN_REQUIRED, "请先完成学校官网登录，再读取课表。", true);
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection) new URL(config.dataUrl).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(4000);
            connection.setReadTimeout(4000);
            connection.setUseCaches(false);
            connection.setRequestProperty("Cookie", cookie);
            if (userAgent != null) connection.setRequestProperty("User-Agent", userAgent);
            connection.setRequestProperty("Referer", config.resultUrl);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("X-Requested-With", "XMLHttpRequest");
            int status = connection.getResponseCode();
            if (status == 401 || status == 403 || status == 302 || status == 303)
                throw new AdapterException(PortalErrorCode.LOGIN_REQUIRED, "学校登录会话已失效，请重新登录。", true);
            if (status != 200)
                throw new AdapterException(PortalErrorCode.NETWORK_UNAVAILABLE, "学校课表接口暂时不可用（HTTP " + status + "）。", true);
            String json;
            try (InputStream input = connection.getInputStream()) {
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > 2 * 1024 * 1024)
                        throw new AdapterException(PortalErrorCode.RESPONSE_TOO_LARGE, "学校返回的数据过大，请使用 HTML 或 Excel 导入。");
                    output.write(buffer, 0, count);
                }
                json = output.toString(StandardCharsets.UTF_8.name());
            }
            if (json.startsWith("\uFEFF")) json = json.substring(1);
            JSONObject payload = parseApi(json);
            if (payload.toString().getBytes(StandardCharsets.UTF_8).length > MAX_RESULT_BYTES)
                throw new AdapterException(PortalErrorCode.RESPONSE_TOO_LARGE, "学校返回的课表过大，请使用 HTML 或 Excel 导入。");
            return payload;
        } catch (AdapterException error) {
            throw error;
        } catch (SocketTimeoutException error) {
            throw new AdapterException(PortalErrorCode.TIMEOUT, "学校课表接口响应超时，请确认已连接校园网或学校 VPN。", true);
        } catch (InvalidData error) {
            PortalErrorCode code = "COURSE_NOT_FOUND".equals(error.code) ? PortalErrorCode.COURSE_NOT_FOUND :
                ("API_SCHEMA".equals(error.code) ? PortalErrorCode.API_SCHEMA_CHANGED :
                    ("API_LIMIT".equals(error.code) ? PortalErrorCode.RESPONSE_TOO_LARGE : PortalErrorCode.UNSUPPORTED_LAYOUT));
            throw new AdapterException(code, "当前学校页面结构发生变化，请使用 HTML 或 Excel 导入，或者提交学校适配请求。");
        } catch (org.json.JSONException error) {
            throw new AdapterException(PortalErrorCode.API_SCHEMA_CHANGED, "当前学校接口返回格式发生变化，请使用 HTML 或 Excel 导入，或者提交学校适配请求。");
        } catch (Exception error) {
            throw new AdapterException(PortalErrorCode.NETWORK_UNAVAILABLE, "无法连接学校课表接口，请确认已连接校园网或学校 VPN。", true);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @Override public JSONObject parseApi(String json) throws Exception {
        return toPayload(new JSONObject(json));
    }

    public static JSONObject toPayload(JSONObject response) throws Exception {
        JSONArray groups=response.optJSONArray("xkxx");
        if (groups == null) throw new InvalidData("API_SCHEMA");
        if (groups.length() == 0) throw new InvalidData("COURSE_NOT_FOUND");
        Object group=groups.opt(0);
        JSONArray courses=new JSONArray();
        if (group instanceof JSONObject) {
            JSONObject map=(JSONObject)group;
            Iterator<String> keys=map.keys();
            while(keys.hasNext()) courses.put(map.get(keys.next()));
        } else if (group instanceof JSONArray) courses=(JSONArray)group;
        else throw new InvalidData("API_SCHEMA");
        if (courses.length()>1000) throw new InvalidData("API_LIMIT");
        JSONArray rows=new JSONArray(),warnings=new JSONArray();
        rows.put(new JSONArray().put("课程名称").put("星期").put("节次").put("周次").put("教师").put("教室"));
        for(int i=0;i<courses.length();i++) {
            JSONObject course=courses.optJSONObject(i);
            if(course==null) throw new InvalidData("API_SCHEMA");
            String name=text(course,"courseName");
            if(name.isEmpty()) throw new InvalidData("API_SCHEMA");
            JSONObject id=course.optJSONObject("id");
            String sequence=id==null ? "" : text(id,"coureSequenceNumber");
            if(!sequence.isEmpty()) name+="_"+sequence;
            JSONArray places=course.optJSONArray("timeAndPlaceList");
            if(places==null || places.length()==0) {warnings.put(name+"：官网未提供明确上课安排，请另行核对。"); continue;}
            if(places.length()>100) throw new InvalidData("API_LIMIT");
            for(int p=0;p<places.length();p++) {
                JSONObject place=places.optJSONObject(p);
                if(place==null) throw new InvalidData("API_SCHEMA");
                int day=place.optInt("classDay",0),start=place.optInt("classSessions",0),length=place.optInt("continuingSession",0);
                String weeks=text(place,"weekDescription");
                if(day<1 || day>7 || start<1 || start>16 || length<1 || length>16 || start+length-1>16 || expandWeeks(weeks).isEmpty()) {
                    warnings.put(name+"：官网上课信息不完整，未导入，请另行核对。"); continue;
                }
                if(rows.length()>=100) throw new InvalidData("API_LIMIT");
                String room=text(place,"campusName")+text(place,"teachingBuildingName")+text(place,"classroomName");
                rows.put(new JSONArray().put(name).put(day).put(start+"-"+(start+length-1)).put(weeks)
                    .put(text(course,"attendClassTeacher").replace("*","").trim()).put(room));
            }
        }
        if(rows.length()==1) throw new InvalidData("COURSE_NOT_FOUND");
        JSONArray standard = new JSONArray();
        for (int i = 1; i < rows.length(); i++) {
            JSONArray row = rows.getJSONArray(i);
            int[] sections = parseSections(row.optString(2));
            standard.put(new StandardCourse(row.optString(0), row.optString(4), row.optString(5),
                parseDay(row.optString(1)), sections[0], sections[1],
                expandWeeks(row.optString(3))).toJson());
        }
        return new JSONObject().put("source", "ytu-urp").put("rows", rows).put("merges", new JSONArray())
            .put("warnings", warnings).put("cardCount", rows.length()-1).put("transport", "official-api")
            .put("courses", standard);
    }

    private static List<Integer> expandWeeks(String value) {
        Set<Integer> result = new LinkedHashSet<>();
        String text = value == null ? "" : value.replace('－', '-').replace('—', '-').replace('–', '-').replace('～', '-').replace('~', '-').replace('至', '-').replace('，', ',').replace('、', ',').replace('（', '(').replace('）', ')').replaceAll("\\s+", "");
        boolean odd = text.contains("单");
        boolean even = text.contains("双");
        if (odd && even) return new ArrayList<>();
        text = text.replace("第", "").replace("周", "").replace("单", "").replace("双", "").replace("(", "").replace(")", "");
        if (!text.matches("\\d+(?:-\\d+)?(?:,\\d+(?:-\\d+)?)*")) return new ArrayList<>();
        for (String part : text.split(",")) {
            String[] ends = part.split("-");
            int from, to;
            try { from = Integer.parseInt(ends[0]); to = ends.length == 1 ? from : Integer.parseInt(ends[1]); }
            catch (NumberFormatException invalid) { return new ArrayList<>(); }
            if (from < 1 || to > 60 || from > to) return new ArrayList<>();
            for (int week = from; week <= to; week++) if ((!odd && !even) || (odd && week % 2 == 1) || (even && week % 2 == 0)) result.add(week);
        }
        List<Integer> weeks = new ArrayList<>(result);
        java.util.Collections.sort(weeks);
        return weeks;
    }

    private static int parseDay(String value) {
        try { return Integer.parseInt(value.trim()); } catch (Exception ignored) { }
        String[] days = {"一", "二", "三", "四", "五", "六", "日", "天"};
        for (int i = 0; i < days.length; i++) if (value.contains(days[i])) return i + 1;
        return 0;
    }

    private static int[] parseSections(String value) {
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("(\\d+)\\s*(?:-|~|至|到)\\s*(\\d+)").matcher(value == null ? "" : value);
        if (matcher.find()) return new int[]{Integer.parseInt(matcher.group(1)), Integer.parseInt(matcher.group(2))};
        try { int section = Integer.parseInt(value.trim()); return new int[]{section, section}; } catch (Exception ignored) { return new int[]{0, 0}; }
    }

    private static String text(JSONObject object, String key) { return object.isNull(key) ? "" : object.optString(key," ").trim(); }
    public static final class InvalidData extends Exception {
        public final String code;
        public InvalidData(String code) { super(code); this.code=code; }
    }
}
