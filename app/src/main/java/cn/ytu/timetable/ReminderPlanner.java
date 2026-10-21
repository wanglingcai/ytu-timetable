package cn.ytu.timetable;

import org.json.JSONArray;
import org.json.JSONObject;
import java.time.*;
import java.util.ArrayList;
import java.util.List;

/** Calendar calculations use real occurrence weeks, independent of the week displayed in the UI. */
final class ReminderPlanner {
    static final int[] MINUTES = {-1, 0, 5, 10, 15, 30};
    static boolean validMinutes(int value) {
        for (int allowed : MINUTES) if (value == allowed) return true;
        return false;
    }
    static final class Occurrence {
        final String id, name, room, date, time;
        final int week;
        final long start, trigger;
        Occurrence(JSONObject course, LocalDate date, String time, int week, long start, int minutes) {
            id=course.optString("id");name=course.optString("name");room=course.optString("room");
            this.date=date.toString();this.time=time;this.week=week;this.start=start;trigger=start-minutes*60000L;
        }
        String tag() { return id+":"+date; }
    }
    static List<Occurrence> occurrences(JSONObject state, ZoneId zone) throws Exception {
        ArrayList<Occurrence> result=new ArrayList<>();
        if (state.optInt("schemaVersion")!=1) return result;
        LocalDate first=LocalDate.parse(state.getString("startDate"));
        if(first.getDayOfWeek()!=DayOfWeek.MONDAY) return result;
        int total=state.getInt("totalWeeks");
        if(total<1 || total>60) return result;
        JSONObject settings=state.optJSONObject("reminders");
        int courseMinutes=settings==null?10:settings.optInt("courseMinutes",10);
        if(!validMinutes(courseMinutes)) return result;
        JSONArray courses=state.getJSONArray("courses"),times=state.getJSONArray("times");
        if(courses.length()>3000 || times.length()>16) return result;
        for(int i=0;i<courses.length();i++) {
            JSONObject course=courses.getJSONObject(i);
            int minutes="personal".equals(course.optString("kind"))?course.optInt("reminderMinutes",-1):courseMinutes;
            int day=course.optInt("day"),section=course.optInt("start");
            if(!validMinutes(minutes)||minutes<0||day<1||day>7||section<1||section>times.length()
                ||course.optString("id").isEmpty()||course.optString("name").isEmpty())continue;
            String time=times.getJSONArray(section-1).getString(0);
            LocalTime clock=LocalTime.parse(time);
            JSONArray weeks=course.getJSONArray("weeks");
            for(int j=0;j<weeks.length();j++) {
                int week=weeks.getInt(j);
                if(week<1||week>total)continue;
                LocalDate date=first.plusDays((week-1)*7L+day-1);
                long start=date.atTime(clock).atZone(zone).toInstant().toEpochMilli();
                result.add(new Occurrence(course,date,time,week,start,minutes));
            }
        }
        return result;
    }
    static List<Occurrence> next(JSONObject state, long after, ZoneId zone) throws Exception {
        ArrayList<Occurrence> next=new ArrayList<>();long earliest=Long.MAX_VALUE;
        for(Occurrence item:occurrences(state,zone)) {
            if(item.trigger<=after||item.trigger>earliest)continue;
            if(item.trigger<earliest){next.clear();earliest=item.trigger;}
            next.add(item);
        }
        return next;
    }
}
