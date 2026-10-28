package cn.ytu.timetable;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

/** Home-screen widget showing the next saved class or personal arrangement. */
public final class NextClassWidget extends AppWidgetProvider {
    private static final String PACKAGE = "cn.ytu.timetable";

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) update(context, manager, id);
    }

    @Override public void onEnabled(Context context) { updateAll(context); }

    static void updateAll(Context context) {
        Context app = context.getApplicationContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(app);
        ComponentName component = new ComponentName(app, NextClassWidget.class);
        for (int id : manager.getAppWidgetIds(component)) update(app, manager, id);
    }

    private static void update(Context context, AppWidgetManager manager, int id) {
        RemoteViews views = new RemoteViews(PACKAGE, R.layout.widget_next_class);
        views.setOnClickPendingIntent(R.id.widget_root, openApp(context));
        try {
            JSONObject state = ReminderScheduler.readState(context);
            JSONObject widgetState = new JSONObject(state.toString());
            includeAllCourses(widgetState);
            List<ReminderPlanner.Occurrence> upcoming = ReminderPlanner.next(
                widgetState, System.currentTimeMillis(), ZoneId.systemDefault());
            if (upcoming.isEmpty()) {
                views.setTextViewText(R.id.widget_course, "今天没有后续课程");
                views.setTextViewText(R.id.widget_meta, "打开应用查看完整课表");
                views.setTextViewText(R.id.widget_countdown, "下节啥课");
            } else {
                ReminderPlanner.Occurrence item = upcoming.get(0);
                ZoneId zone = ZoneId.systemDefault();
                LocalDate today = LocalDate.now(zone);
                LocalDate date = LocalDate.parse(item.date);
                views.setTextViewText(R.id.widget_course, item.name);
                views.setTextViewText(R.id.widget_meta, dateLabel(date, today) + "  " + item.time + " · " +
                    (item.room.isEmpty() ? "地点待定" : item.room));
                views.setTextViewText(R.id.widget_countdown, countdown(item.start - System.currentTimeMillis()));
            }
        } catch (Exception failed) {
            views.setTextViewText(R.id.widget_course, "还没有课表");
            views.setTextViewText(R.id.widget_meta, "打开应用导入你的课表");
            views.setTextViewText(R.id.widget_countdown, "点击开始");
        }
        manager.updateAppWidget(id, views);
    }

    /** ReminderPlanner intentionally skips courses with reminders disabled; widgets show all courses. */
    private static void includeAllCourses(JSONObject state) throws Exception {
        JSONObject reminders = state.optJSONObject("reminders");
        if (reminders == null) {
            reminders = new JSONObject();
            state.put("reminders", reminders);
        }
        reminders.put("courseMinutes", 0);
        JSONArray courses = state.optJSONArray("courses");
        if (courses == null) return;
        for (int i = 0; i < courses.length(); i++) {
            JSONObject course = courses.optJSONObject(i);
            if (course != null && "personal".equals(course.optString("kind"))) {
                course.put("reminderMinutes", 0);
            }
        }
    }

    private static PendingIntent openApp(Context context) {
        Intent intent = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String dateLabel(LocalDate date, LocalDate today) {
        if (date.equals(today)) return "今天";
        if (date.equals(today.plusDays(1))) return "明天";
        return date.getMonthValue() + "月" + date.getDayOfMonth() + "日";
    }

    private static String countdown(long millis) {
        if (millis <= 60_000L) return "马上开始";
        Duration duration = Duration.ofMillis(millis);
        long hours = duration.toHours();
        long minutes = duration.toMinutes() % 60;
        if (hours > 0) return "还有 " + hours + " 小时 " + minutes + " 分";
        return "还有 " + minutes + " 分钟";
    }
}
