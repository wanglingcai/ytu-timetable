'use strict';
// Composition root: owns timetable state, persistence, and feature wiring.
(() => {
  const T = window.Timetable;
  const factories = window.TimetableApp;
  const ui = factories.createUI();
  const { $, toast, showDialog } = ui;
  const KEY = 'ytu-timetable-v1';
  // Only model.state is persisted. Navigation/rendering fields never enter backups.
  const model = {
    state: T.defaultState(),
    week: 1,
    listMode: false,
    storageProblem: false,
    renderedDate: ''
  };
  window.receiveNativeError = (payload) => toast(payload.message || '操作失败，请重试');
  window.handleAndroidBack = ui.handleAndroidBack;
  function load() {
    try {
      const json = window.AndroidLocal ? AndroidLocal.readState() : localStorage.getItem(KEY);
      if (json) model.state = T.validateState(JSON.parse(json));
    } catch (error) {
      model.storageProblem = true;
      setTimeout(() => toast('本机数据读取失败，尚未覆盖。可重新导入备份恢复。'), 50);
    }
    model.week = Math.max(
      1,
      Math.min(model.state.totalWeeks, T.currentWeek(model.state.startDate))
    );
  }
  function persist(raw, message) {
    try {
      const next = T.validateState({ ...raw, savedAt: new Date().toISOString() });
      const json = JSON.stringify(next);
      if (window.AndroidLocal) {
        if (!AndroidLocal.saveState(json))
          throw new Error('手机存储写入失败，请先导出备份并检查剩余空间');
      } else {
        localStorage.setItem(KEY, json);
        if (localStorage.getItem(KEY) !== json) throw new Error('浏览器无法保存数据');
      }
      model.state = next;
      model.storageProblem = false;
      model.week = Math.min(model.week, model.state.totalWeeks);
      render();
      refreshReminderStatus();
      if (message) toast(message);
      return true;
    } catch (error) {
      toast(error.message || '保存失败');
      return false;
    }
  }
  function render() {
    view.render();
  }
  function refreshReminderStatus() {
    settings.refreshReminderStatus();
  }
  const view = factories.createTimetableView({
    T,
    ui,
    model,
    detail: (id) => courses.detail(id),
    openEdit: (...args) => courses.openEdit(...args),
    openReminder: (payload) => settings.openReminder(payload)
  });
  const settings = factories.createSettings({
    T,
    ui,
    model,
    persist,
    render,
    detail: (id) => courses.detail(id)
  });
  const courses = factories.createCourses({
    T,
    ui,
    model,
    persist,
    courseRow: (...args) => view.courseRow(...args),
    reminderLabel: settings.reminderLabel
  });
  const imports = factories.createImport({
    T,
    ui,
    model,
    persist,
    render,
    appearance: window.TimetableAppearance
  });
  window.refreshReminderStatus = settings.refreshReminderStatus;
  window.openReminder = settings.openReminder;
  window.receiveImport = imports.receiveImport;
  window.receivePortalImport = imports.receivePortalImport;
  view.bindEvents();
  settings.bindEvents();
  courses.bindEvents();
  imports.bindEvents();
  function goWeek(value) {
    model.week = Math.max(1, Math.min(model.state.totalWeeks, value));
    render();
    view.animateEntrance();
  }
  $('prevWeek').onclick = () => {
    if (model.week > 1) goWeek(model.week - 1);
  };
  $('nextWeek').onclick = () => {
    if (model.week < model.state.totalWeeks) goWeek(model.week + 1);
  };
  $('weekSelect').onchange = (event) => goWeek(Number(event.target.value));
  $('todayButton').onclick = () => goWeek(T.currentWeek(model.state.startDate));
  $('viewToggle').onclick = () => {
    model.listMode = !model.listMode;
    render();
  };
  $('addButton').onclick = () => showDialog('addChoice');
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      render();
      refreshReminderStatus();
    }
  });
  load();
  render();
  view.animateEntrance();
  refreshReminderStatus();
  setInterval(() => {
    if (!document.hidden) {
      if (model.renderedDate !== T.dateString(new Date())) render();
      else view.updateTimeCues();
    }
  }, 30000);
})();
