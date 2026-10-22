'use strict';
// Classic script factories also work from Android's offline file URL.
window.TimetableApp.createSettings = function ({ T, ui, model, persist, render, detail }) {
  const { $, el, toast, showDialog, closeDialog, closeAll } = ui;
  function openSettings() {
    $('semesterInput').value = model.state.semester;
    $('startInput').value = model.state.startDate;
    $('weeksInput').value = model.state.totalWeeks;
    $('courseReminder').value = String(model.state.reminders.courseMinutes);
    refreshReminderStatus();
    renderTimes(model.state.times);
    showDialog('settingsDialog');
  }
  function reminderLabel(minutes) {
    return minutes < 0 ? '关闭' : minutes === 0 ? '准点提醒' : '提前 ' + minutes + ' 分钟';
  }
  function refreshReminderStatus() {
    let message = '提醒在安卓应用中生效；浏览器仅保存设置。',
      needsPermission = false;
    const native = window.AndroidLocal && typeof AndroidLocal.reminderStatus === 'function';
    if (native) {
      try {
        const status = JSON.parse(AndroidLocal.reminderStatus());
        needsPermission = !status.notifications || !status.exact;
        message = !status.notifications
          ? '通知未开启，当前无法发送提醒。'
          : !status.exact
            ? '通知已开启；准时提醒权限未开启，系统可能延迟发送。'
            : '通知和准时提醒权限已开启。';
        if (status.nextAt)
          message +=
            ' 下一次提醒：' +
            new Date(status.nextAt).toLocaleString('zh-CN', {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            }) +
            '。';
        else if (status.notifications) message += ' 暂无未来提醒；已过提醒时间的安排不补发。';
        if (status.problem) message += ' ' + status.problem;
        $('exactReminderPermission').hidden = status.exact;
        $('notificationPermission').textContent = status.notifications
          ? '通知声音与振动设置'
          : '开启通知';
      } catch (error) {
        message = '无法读取提醒状态，请重新打开应用检查。';
        needsPermission = true;
      }
    }
    $('reminderStatus').textContent = message;
    $('notificationPermission').hidden = !native;
    if (!native) $('exactReminderPermission').hidden = true;
    $('reminderPermissionHint').hidden = !(
      needsPermission &&
      model.state.courses.some((c) =>
        c.kind === 'personal'
          ? c.reminderMinutes !== undefined && c.reminderMinutes >= 0
          : model.state.reminders.courseMinutes >= 0
      )
    );
  }
  function renderTimes(times) {
    $('timeInputs').replaceChildren();
    times.forEach((pair, i) => {
      const row = el('div', 'time-row');
      row.append(el('span', '', '第 ' + (i + 1) + ' 节'));
      pair.forEach((time, j) => {
        if (j) row.append(el('span', '', '—'));
        const input = el('input');
        input.type = 'time';
        input.required = true;
        input.value = time;
        input.setAttribute('aria-label', '第' + (i + 1) + '节' + (j ? '结束' : '开始') + '时间');
        row.append(input);
      });
      $('timeInputs').append(row);
    });
  }
  function readTimes() {
    return Array.from($('timeInputs').children, (row) =>
      Array.from(row.querySelectorAll('input'), (i) => i.value)
    );
  }
  const openReminder = (payload) => {
    const c = model.state.courses.find((c) => c.id === payload.id);
    if (!c) {
      toast('这条课程或安排已被删除或替换。');
      return;
    }
    let occurrenceWeek;
    try {
      const date = T.parseDate(payload.date);
      occurrenceWeek = T.currentWeek(model.state.startDate, date);
      if (
        !c.weeks.includes(occurrenceWeek) ||
        T.weekDates(model.state.startDate, occurrenceWeek)[c.day - 1] !== payload.date
      )
        throw new Error();
    } catch (error) {
      toast('这条安排的日期已改变，请查看最新课表。');
      return;
    }
    closeAll();
    model.week = occurrenceWeek;
    render();
    detail(c.id);
  };
  function bindEvents() {
    $('settingsButton').onclick = openSettings;
    $('reminderSettingsButton').onclick = openSettings;
    $('notificationPermission').onclick = () => AndroidLocal.reminderPermission('notifications');
    $('exactReminderPermission').onclick = () => AndroidLocal.reminderPermission('exact');
    $('settingsForm').onsubmit = (event) => {
      event.preventDefault();
      if (
        persist(
          {
            ...model.state,
            semester: $('semesterInput').value,
            startDate: $('startInput').value,
            totalWeeks: Number($('weeksInput').value),
            times: readTimes(),
            reminders: { courseMinutes: Number($('courseReminder').value) }
          },
          '设置已保存'
        )
      )
        closeDialog('settingsDialog');
    };
    $('addTimeButton').onclick = () => {
      const times = readTimes();
      if (times.length >= 16) {
        toast('最多支持 16 节');
        return;
      }
      const last = times[times.length - 1],
        start = Number(last[1].slice(0, 2)) * 60 + Number(last[1].slice(3)) + 10,
        end = start + 45;
      if (end >= 1440) {
        toast('末节时间已接近午夜，请先调整时间');
        return;
      }
      const hm = (m) =>
        String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
      renderTimes([...times, [hm(start), hm(end)]]);
    };
    $('removeTimeButton').onclick = () => {
      const times = readTimes();
      if (times.length <= 1) {
        toast('至少保留一节');
        return;
      }
      if (model.state.courses.some((c) => c.end >= times.length)) {
        toast('末节仍有课程，不能删除');
        return;
      }
      renderTimes(times.slice(0, -1));
    };
    $('clearButton').onclick = () => {
      if (!confirm('确定清空本机课表？建议先取消并导出备份。此操作无法撤销。')) return;
      if (persist({ ...model.state, courses: [], sourceName: '' }, '课表已清空')) closeAll();
    };
  }
  return { openSettings, reminderLabel, refreshReminderStatus, openReminder, bindEvents };
};
