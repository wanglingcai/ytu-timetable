package cn.ytu.timetable;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Iterator;

/** Converts the URP response used by the official page, keeping timetable fields only. */
final class PortalCourseData {
    static final class InvalidData extends Exception {
        final String code;
        InvalidData(String code) { super(code); this.code=code; }
    }

    private static String text(JSONObject object, String key) {
        return object.isNull(key) ? "" : object.optString(key,"").trim();
    }

    static JSONObject toPayload(JSONObject response) throws Exception {
        JSONArray groups=response.optJSONArray("xkxx");
        if (groups==null || groups.length()==0) throw new InvalidData("API_SCHEMA");
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
                if(day<1 || day>7 || start<1 || start>16 || length<1 || length>16 || start+length-1>16 || weeks.isEmpty()) {
                    warnings.put(name+"：官网上课信息不完整，未导入，请另行核对。"); continue;
                }
                if(rows.length()>=100) throw new InvalidData("API_LIMIT");
                String room=text(place,"campusName")+text(place,"teachingBuildingName")+text(place,"classroomName");
                rows.put(new JSONArray().put(name).put(day).put(start+"-"+(start+length-1)).put(weeks)
                    .put(text(course,"attendClassTeacher").replace("*","").trim()).put(room));
            }
        }
        if(rows.length()==1) throw new InvalidData("API_EMPTY");
        return new JSONObject().put("source","ytu-urp").put("rows",rows).put("merges",new JSONArray())
            .put("warnings",warnings).put("cardCount",rows.length()-1).put("transport","official-api");
    }
}
