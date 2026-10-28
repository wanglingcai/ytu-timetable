package cn.ytu.timetable;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        if(intent==null)return;
        // Work off the receiver main thread, and hold the broadcast until state/alarm updates finish.
        PendingResult pending=goAsync();
        new Thread(()->{
            try {
                if(ReminderScheduler.ACTION.equals(intent.getAction()))ReminderScheduler.fire(context,intent);
                else ReminderScheduler.refresh(context,true);
                NextClassWidget.updateAll(context);
            } finally {pending.finish();}
        },"schedule-reminder").start();
    }
}
