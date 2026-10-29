package cn.ytu.timetable;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** The adapter boundary model consumed by the import UI. */
public final class StandardCourse {
    public final String name, teacher, room;
    public final int day, start, end;
    public final List<Integer> weeks;

    public StandardCourse(String name, String teacher, String room, int day, int start, int end, List<Integer> weeks) {
        this.name = name == null ? "" : name.trim();
        this.teacher = teacher == null ? "" : teacher.trim();
        this.room = room == null ? "" : room.trim();
        this.day = day;
        this.start = start;
        this.end = end;
        this.weeks = Collections.unmodifiableList(new ArrayList<>(weeks));
    }

    public JSONObject toJson() throws Exception {
        JSONArray values = new JSONArray();
        for (Integer week : weeks) values.put(week);
        return new JSONObject().put("name", name).put("teacher", teacher).put("room", room)
            .put("day", day).put("start", start).put("end", end).put("weeks", values);
    }
}
