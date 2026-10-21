package cn.ytu.timetable;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import android.view.*;
import android.webkit.WebView;
import org.json.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/** Run on a disposable emulator only: replaces state with synthetic reminder fixtures. */
final class ReminderChecks {
    private final Instrumentation test;
    private final Context context;
    private Activity activity;
    private int count;
    private final StringBuilder report=new StringBuilder();
    ReminderChecks(Instrumentation test){this.test=test;context=test.getTargetContext();}
    void run(String mode) {
        Bundle result=new Bundle();
        try {
            if("permissions".equals(mode)) {
                launch(null);await("!!window.Timetable && !!window.openReminder");save(liveFixture(150));
                check(!ReminderScheduler.notificationsAllowed(context)&&new JSONObject(ReminderScheduler.status(context)).getLong("nextAt")==0,"通知未授权时不安排闹钟，不误报已启用");
                context.getSharedPreferences("MainActivity",Context.MODE_PRIVATE).edit().remove("notificationAsked").commit();
                js("document.querySelector('#settingsButton').click();document.querySelector('#notificationPermission').click();true");
                long until=System.currentTimeMillis()+10000;boolean clicked=false;
                while(System.currentTimeMillis()<until&&!clicked) {
                    android.view.accessibility.AccessibilityNodeInfo root=test.getUiAutomation().getRootInActiveWindow();
                    if(root!=null)for(android.view.accessibility.AccessibilityNodeInfo node:root.findAccessibilityNodeInfosByViewId("com.android.permissioncontroller:id/permission_allow_button"))clicked|=node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK);
                    if(!clicked)Thread.sleep(200);
                }
                check(clicked,"应用按钮实际打开安卓通知权限申请，可通过系统允许按钮授权");
                until=System.currentTimeMillis()+10000;
                while(System.currentTimeMillis()<until&&!ReminderScheduler.notificationsAllowed(context))Thread.sleep(100);
                check(ReminderScheduler.notificationsAllowed(context),"系统授权后读取到通知可用状态");
                until=System.currentTimeMillis()+10000;
                while(System.currentTimeMillis()<until&&new JSONObject(ReminderScheduler.status(context)).getLong("nextAt")==0)Thread.sleep(100);
                check(!ReminderScheduler.exactAllowed(context)&&new JSONObject(ReminderScheduler.status(context)).getLong("nextAt")>System.currentTimeMillis(),"未授权精确闹钟时使用可延迟调度，授权通知后自动生效");
                await("document.querySelector('#reminderStatus').textContent.includes('可能延迟')");
                check("true".equals(js("!document.querySelector('#exactReminderPermission').hidden")),"界面明确显示可能延迟及准时提醒权限入口");
                result.putString("stream","\nPASS: "+count+" permission checks\n"+report);
            } else if("seed".equals(mode)) {
                launch(null);await("!!window.Timetable && !!window.openReminder");
                JSONObject fixture=liveFixture(150);
                save(fixture);check(new JSONObject(ReminderScheduler.status(context)).getLong("nextAt")>System.currentTimeMillis(),"进程退出/重启测试的模拟提醒已写入系统");
                result.putString("stream","\nPASS: seeded reminder at "+new JSONObject(ReminderScheduler.status(context)).getLong("nextAt")+"\n"+report);
            } else {
                calculations();launch(null);await("!!window.Timetable && !!window.openReminder");
                check(ReminderScheduler.notificationsAllowed(context)&&ReminderScheduler.exactAllowed(context),"专用模拟器通知与精确闹钟权限已开启");
                JSONObject fixture=liveFixture(90);save(fixture);
                long first=new JSONObject(ReminderScheduler.status(context)).getLong("nextAt");
                check(first>System.currentTimeMillis(),"保存课表后系统已调度最早提醒");
                android.content.SharedPreferences prefs=context.getSharedPreferences("reminder_runtime",Context.MODE_PRIVATE);
                Intent obsolete=new Intent(ReminderScheduler.ACTION).putExtra("token",prefs.getString("token","")).putExtra("at",first);
                // The normal editor writes the same native save bridge as imports.
                // Open the actual personal entry using its occurrence date, regardless of current selected week.
                ReminderPlanner.Occurrence personal=ReminderPlanner.occurrences(fixture,ZoneId.systemDefault()).stream().filter(o->o.id.equals("personal")).findFirst().get();
                js("openReminder({id:'personal',date:"+JSONObject.quote(personal.date)+"});document.querySelector('#courseDetail .detail-actions button').click();document.querySelector('#courseRoom').value='图书馆二楼';document.querySelector('#personalReminder').value='15';document.querySelector('#saveCourse').click();true");
                check(new JSONObject(ReminderScheduler.status(context)).getLong("nextAt")==first-5*60000L || new JSONObject(ReminderScheduler.status(context)).getLong("nextAt")==first,"编辑安排同步更新提醒（已过时间不补发）");
                ReminderScheduler.fire(context,obsolete);
                check(manager().getActiveNotifications().length==0&&!prefs.getString("token","").equals(obsolete.getStringExtra("token")),"修改后旧广播失效，不弹出陈旧提醒");
                save(fixture);
                JSONObject disabled=new JSONObject(fixture.toString());disabled.getJSONObject("reminders").put("courseMinutes",-1);disabled.getJSONArray("courses").getJSONObject(1).put("reminderMinutes",-1);save(disabled);
                check(new JSONObject(ReminderScheduler.status(context)).getLong("nextAt")==0,"课程关闭且个人安排关闭后取消系统闹钟");
                JSONObject deleted=new JSONObject(fixture.toString()).put("courses",new JSONArray());save(deleted);
                check(new JSONObject(ReminderScheduler.status(context)).getLong("nextAt")==0&&manager().getActiveNotifications().length==0,"删除全部安排同时取消闹钟和已显示通知");
                // Re-import via the app preview: new school data must replace old alarms, preserving personal plans.
                save(fixture);
                js("receivePortalImport({source:'ytu-urp',rows:[['课程名称','星期','节次','周次'],['新模拟课程','星期一','1','2']],warnings:[]});document.querySelector('#reviewCheck').checked=true;document.querySelector('#saveImport').click();true");
                JSONObject imported=ReminderScheduler.readState(context);
                check(imported.getJSONArray("courses").length()==2&&imported.toString().contains("新模拟课程")&&!imported.toString().contains("模拟数学"),"重新导入替换学校课程，保留个人安排");
                long expected=ReminderPlanner.next(imported,System.currentTimeMillis(),ZoneId.systemDefault()).get(0).trigger;
                check(new JSONObject(ReminderScheduler.status(context)).getLong("nextAt")==expected,"重新导入后提醒时间与最新完整课表一致");
                // Return to a fresh future fixture so the actual system alarm can deliver while Activity is closed.
                fixture=liveFixture(90);save(fixture);first=new JSONObject(ReminderScheduler.status(context)).getLong("nextAt");
                test.runOnMainSync(()->activity.finish());test.waitForIdleSync();
                waitNotifications(first+25000);
                StatusBarNotification math=notification("接下来：模拟数学"),plan=notification("接下来：模拟自习");
                check(math!=null&&plan!=null,"实际 AlarmManager 到时在关闭界面后弹出两条同刻通知");
                check(math.getNotification().extras.getCharSequence(Notification.EXTRA_TEXT).toString().endsWith(" · A101"),"通知包含开始时间和地点");
                check(new JSONObject(ReminderScheduler.status(context)).getLong("nextAt")==first+60000L,"触发后自动调度下一节，并保留重复周次");
                Instrumentation.ActivityMonitor monitor=test.addMonitor(MainActivity.class.getName(),null,false);
                math.getNotification().contentIntent.send();activity=test.waitForMonitorWithTimeout(monitor,10000);test.removeMonitor(monitor);
                check(activity!=null,"点击通知的 PendingIntent 能重新打开应用");
                await("document.querySelector('#courseDialog').open");
                check("true".equals(js("document.querySelector('#courseDetail').textContent.includes('模拟数学')")),"冷启动后定位通知对应课程详情");
                plan.getNotification().contentIntent.send();await("document.querySelector('#courseDetail').textContent.includes('模拟自习')");
                check("true".equals(js("document.querySelector('#courseDialog').open && document.querySelector('#courseDetail').textContent.includes('模拟自习')")),"应用已打开时通知定位个人安排详情");
                save(new JSONObject(fixture.toString()).put("courses",new JSONArray()));
                check(manager().getActiveNotifications().length==0&&new JSONObject(ReminderScheduler.status(context)).getLong("nextAt")==0,"触发后清空课表，显示通知与下一次提醒一并撤销");
                result.putString("stream","\nPASS: "+count+" reminder checks\n"+report);
            }
            test.finish(Activity.RESULT_OK,result);
        }catch(Throwable error){result.putString("stream","\nFAIL after "+count+" reminder checks: "+error+"\n"+report);test.finish(Activity.RESULT_CANCELED,result);}
    }
    private void calculations() throws Exception {
        ZoneId zone=ZoneId.of("Asia/Shanghai");
        JSONObject fixture=new JSONObject("{\"schemaVersion\":1,\"startDate\":\"2026-08-31\",\"totalWeeks\":18,\"times\":[[\"08:00\",\"08:45\"]],\"courses\":[{\"id\":\"a\",\"name\":\"模拟课\",\"day\":1,\"start\":1,\"end\":1,\"weeks\":[1,3]}]}");
        long start=LocalDateTime.of(2026,8,31,8,0).atZone(zone).toInstant().toEpochMilli();
        check(ReminderPlanner.next(fixture,start-3600000,zone).get(0).trigger==start-600000,"旧课表默认提前十分钟");
        for(int minutes:new int[]{0,5,10,15,30}) {
            fixture.put("reminders",new JSONObject().put("courseMinutes",minutes));
            check(ReminderPlanner.next(fixture,start-3600000,zone).get(0).trigger==start-minutes*60000L,"课程提前 "+minutes+" 分钟计算准确");
        }
        fixture.put("reminders",new JSONObject().put("courseMinutes",-1));
        check(ReminderPlanner.next(fixture,start-3600000,zone).isEmpty(),"课程关闭不产生提醒");
        fixture.put("reminders",new JSONObject().put("courseMinutes",10));
        long week2=start+7*86400000L;
        check(ReminderPlanner.next(fixture,week2-3600000,zone).get(0).week==3,"非实际周次不提醒，自动跳到下一次上课周");
        JSONObject personal=new JSONObject(fixture.getJSONArray("courses").getJSONObject(0).toString()).put("id","p").put("kind","personal").put("reminderMinutes",5);
        fixture.getJSONArray("courses").put(personal);
        check(ReminderPlanner.next(fixture,start-600000,zone).get(0).id.equals("p"),"个人安排提前时间独立于课程，并跳过已过的提醒");
        personal.put("reminderMinutes",10);
        check(ReminderPlanner.next(fixture,start-3600000,zone).size()==2,"同刻多项安排全部保留");
        personal.put("reminderMinutes",-1);
        check(ReminderPlanner.occurrences(fixture,zone).size()==2,"个人安排关闭不影响课程重复提醒");
        fixture.put("startDate","2026-12-28");
        check(ReminderPlanner.occurrences(fixture,zone).get(1).date.equals("2027-01-11"),"跨年重复周次按日历日期计算");
        fixture.put("startDate","2026-08-31");
        long utc=ReminderPlanner.occurrences(fixture,ZoneId.of("UTC")).get(0).trigger;
        check(utc-ReminderPlanner.occurrences(fixture,zone).get(0).trigger==8*3600000L,"更改时区后按手机当地课表时间计算");
        fixture.put("startDate","2026-03-02");fixture.getJSONArray("courses").getJSONObject(0).put("weeks",new JSONArray("[1,2]"));
        List<ReminderPlanner.Occurrence> dst=ReminderPlanner.occurrences(fixture,ZoneId.of("America/New_York"));
        check(dst.get(1).start-dst.get(0).start==7*86400000L-3600000L,"夏令时跨周仍保持当地八点开始");
    }
    private JSONObject liveFixture(int secondsAhead) throws Exception {
        ZonedDateTime trigger=ZonedDateTime.now().plusSeconds(secondsAhead).truncatedTo(ChronoUnit.MINUTES);
        ZonedDateTime start=trigger.plusMinutes(10);LocalDate date=start.toLocalDate();
        // evaluateJavascript returns a JSON string; decode it before constructing the state.
        JSONObject fixture=new JSONObject((String)new JSONTokener(js("JSON.stringify(Timetable.defaultState())")).nextValue());
        fixture.put("startDate",date.minusDays(date.getDayOfWeek().getValue()-1).toString()).put("semester","模拟提醒测试").put("totalWeeks",3);
        // UI times are minute precision; separate short mock sections by one minute.
        String time=start.format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")),later=start.plusMinutes(1).format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")),end=start.plusMinutes(2).format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"));
        if(start.getHour()==23&&start.getMinute()>=58)throw new AssertionError("Run live notification test away from midnight");
        fixture.put("times",new JSONArray().put(new JSONArray().put(time).put(later)).put(new JSONArray().put(later).put(end)));
        JSONObject school=new JSONObject().put("id","school").put("name","模拟数学").put("room","A101").put("day",date.getDayOfWeek().getValue()).put("start",1).put("end",1).put("weeks",new JSONArray("[1,3]"));
        JSONObject plan=new JSONObject(school.toString()).put("id","personal").put("kind","personal").put("name","模拟自习").put("room","图书馆").put("reminderMinutes",10);
        JSONObject second=new JSONObject(school.toString()).put("id","second").put("name","模拟下一节").put("start",2).put("end",2).put("weeks",new JSONArray("[1]"));
        fixture.put("courses",new JSONArray().put(school).put(plan).put(second)).put("reminders",new JSONObject().put("courseMinutes",10));
        return fixture;
    }
    private void save(JSONObject state) throws Exception {
        check("true".equals(js("AndroidLocal.saveState(JSON.stringify(Timetable.validateState("+state+")))")),"通过真实本地存储桥接保存模拟数据");
        test.runOnMainSync(()->activity.finish());test.waitForIdleSync();launch(null);
        await("!!window.openReminder && document.readyState==='complete'");
    }
    private void waitNotifications(long until) throws Exception {
        // Android may add its own automatic group summary; wait for both actual content tags.
        while(System.currentTimeMillis()<until){if(notification("接下来：模拟数学")!=null&&notification("接下来：模拟自习")!=null)return;Thread.sleep(200);}
        throw new AssertionError("System notification delivery timeout: "+manager().getActiveNotifications().length);
    }
    private NotificationManager manager(){return context.getSystemService(NotificationManager.class);}
    private StatusBarNotification notification(String title){for(StatusBarNotification item:manager().getActiveNotifications())if(title.contentEquals(item.getNotification().extras.getCharSequence(Notification.EXTRA_TITLE,"")))return item;return null;}
    private void check(boolean ok,String label){if(!ok)throw new AssertionError(label);count++;report.append("✓ ").append(label).append('\n');}
    private void launch(Intent requested){Intent intent=requested==null?context.getPackageManager().getLaunchIntentForPackage(context.getPackageName()):requested;intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);activity=test.startActivitySync(intent);}
    private WebView findWeb(View view){if(view instanceof WebView)return(WebView)view;if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){WebView found=findWeb(((ViewGroup)view).getChildAt(i));if(found!=null)return found;}return null;}
    private String js(String script) throws Exception {CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();test.runOnMainSync(()->findWeb(activity.getWindow().getDecorView()).evaluateJavascript(script,value->{result.set(value);latch.countDown();}));if(!latch.await(10,TimeUnit.SECONDS))throw new AssertionError("JS timeout");return result.get();}
    private void await(String condition)throws Exception{long until=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<until){if("true".equals(js(condition)))return;Thread.sleep(100);}throw new AssertionError(condition);}
}
