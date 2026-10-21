package cn.ytu.timetable;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.ZoneId;
import java.util.*;

/** One next alarm for the entire schedule; receiver chains the following occurrence group. */
@android.annotation.SuppressLint("ApplySharedPref") // Persist the generation before receiver completion/process death; work runs off the UI thread.
final class ReminderScheduler {
    static final Object LOCK=new Object();
    static final String CHANNEL="schedule_reminders", ACTION="cn.ytu.timetable.REMIND";
    private static final String PREFS="reminder_runtime";
    private static android.content.SharedPreferences prefs(Context context) {return context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    static JSONObject readState(Context context) throws Exception {
        synchronized(LOCK) {
            AtomicFile file=new AtomicFile(new File(context.getFilesDir(),"timetable.json"));
            try(InputStream stream=file.openRead()) {
                ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int size;
                while((size=stream.read(buffer))!=-1){if(bytes.size()+size>4*1024*1024)throw new IOException("State too large");bytes.write(buffer,0,size);}
                return new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            }
        }
    }
    static void channel(Context context) {
        NotificationChannel channel=new NotificationChannel(CHANNEL,"课程与个人安排",NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("按照课表实际周次提醒即将开始的课程和个人安排");
        channel.enableVibration(true);
        context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }
    static boolean notificationsAllowed(Context context) {
        channel(context);
        NotificationManager manager=context.getSystemService(NotificationManager.class);
        return (Build.VERSION.SDK_INT<33||context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)
            &&manager.areNotificationsEnabled()&&manager.getNotificationChannel(CHANNEL).getImportance()!=NotificationManager.IMPORTANCE_NONE;
    }
    static boolean exactAllowed(Context context) {
        return Build.VERSION.SDK_INT<31||context.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }
    private static PendingIntent alarmIntent(Context context,String token,long at) {
        Intent intent=new Intent(context,ReminderReceiver.class).setAction(ACTION).putExtra("token",token).putExtra("at",at);
        return PendingIntent.getBroadcast(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    static void refresh(Context context,boolean changed) {
        synchronized(LOCK) {
            if(changed)context.getSystemService(NotificationManager.class).cancelAll();
            long now=System.currentTimeMillis(),at=prefs(context).getLong("at",0);
            if(!changed&&at>0&&at<=now) {
                // Opening the UI as a due broadcast is queued must not cancel that reminder.
                fire(context,new Intent(ACTION).putExtra("at",at).putExtra("token",prefs(context).getString("token","")));
                return;
            }
            schedule(context,now);
        }
    }
    private static void schedule(Context context,long after) {
        AlarmManager manager=context.getSystemService(AlarmManager.class);
        manager.cancel(alarmIntent(context,"",0));
        String token=UUID.randomUUID().toString();
        prefs(context).edit().putString("token",token).putLong("at",0).putString("problem","").commit();
        try {
            if(!notificationsAllowed(context))return;
            List<ReminderPlanner.Occurrence> next=ReminderPlanner.next(readState(context),after,ZoneId.systemDefault());
            if(next.isEmpty())return;
            long at=next.get(0).trigger;
            PendingIntent pending=alarmIntent(context,token,at);
            // Permission may be revoked between checking it and scheduling.
            try {
                if(exactAllowed(context))manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);
                else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);
            } catch(SecurityException revoked) {manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);}
            prefs(context).edit().putLong("at",at).commit();
        } catch(FileNotFoundException empty) { /* first launch */ }
        catch(Exception failure) {prefs(context).edit().putString("problem","提醒调度失败，请检查课表日期与时间并重试。").commit();}
    }
    static void fire(Context context,Intent intent) {
        synchronized(LOCK) {
            long at=intent.getLongExtra("at",0),now=System.currentTimeMillis();
            if(!prefs(context).getString("token","").equals(intent.getStringExtra("token"))||at==0||at!=prefs(context).getLong("at",0))return;
            if(now<at)return;
            // Ignore obsolete/canceled broadcasts and never notify long after an occurrence ended.
            try {
                if(notificationsAllowed(context)&&now>=at) {
                    for(ReminderPlanner.Occurrence item:ReminderPlanner.occurrences(readState(context),ZoneId.systemDefault())) {
                        if(item.trigger==at&&now-at<=15*60000L&&now<=item.start+5*60000L)post(context,item);
                    }
                }
            } catch(Exception ignored) { /* state cannot be read; do not send stale data */ }
            schedule(context,Math.max(now,at));
        }
    }
    static Intent detailIntent(Context context,ReminderPlanner.Occurrence item) {
        return new Intent(context,MainActivity.class).setAction("cn.ytu.timetable.OPEN_REMINDER")
            .setData(new Uri.Builder().scheme("nextclass").authority("reminder").appendPath(item.id).appendPath(item.date).build())
            .putExtra("courseId",item.id).putExtra("occurrenceDate",item.date)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }
    private static void post(Context context,ReminderPlanner.Occurrence item) {
        PendingIntent open=PendingIntent.getActivity(context,0,detailIntent(context,item),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        String body=item.time+" · "+(item.room.isEmpty()?"地点待定":item.room);
        Notification notification=new Notification.Builder(context,CHANNEL).setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("接下来："+item.name).setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body)).setContentIntent(open).setAutoCancel(true)
            .setCategory(Notification.CATEGORY_EVENT).setVisibility(Notification.VISIBILITY_PRIVATE).setWhen(item.start).build();
        try {context.getSystemService(NotificationManager.class).notify(item.tag(),0,notification);}catch(SecurityException denied){ /* permission revoked */ }
    }
    static String status(Context context) {
        synchronized(LOCK) {
            JSONObject status=new JSONObject();
            try {status.put("notifications",notificationsAllowed(context));status.put("exact",exactAllowed(context));
                status.put("nextAt",prefs(context).getLong("at",0));status.put("problem",prefs(context).getString("problem",""));
            }catch(Exception ignored){}
            return status.toString();
        }
    }
}
