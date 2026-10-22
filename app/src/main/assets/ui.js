'use strict';
window.TimetableApp = {};
window.TimetableApp.createUI = function () {
  const $ = (id) => document.getElementById(id);
  const DAY = ['', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
  let toastTimer,
    toastTask,
    dialogStack = [];
  const el = (tag, className, value) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (value !== undefined) n.textContent = value;
    return n;
  };
  const append = (parent, ...children) => {
    children.forEach((c) => parent.append(c));
    return parent;
  };
  const courseTitle = (course) =>
    course.kind === 'personal' ? course.name : course.name.replace(/_\d+$/, '') || course.name;
  function toast(message) {
    const t = $('toast');
    t.textContent = message;
    clearTimeout(toastTask);
    clearTimeout(toastTimer);
    toastTask = setTimeout(() => {
      const open = dialogStack.filter((d) => d.open),
        host = open[open.length - 1];
      t.classList.toggle('in-dialog', !!host);
      if (host) host.querySelector('.dialog-head').after(t);
      else document.body.append(t);
      t.hidden = false;
      toastTimer = setTimeout(() => (t.hidden = true), 3500);
    }, 0);
  }
  function showDialog(id) {
    const d = $(id);
    if (!d.open) {
      dialogStack = dialogStack.filter((x) => x.open);
      d.showModal();
      dialogStack.push(d);
      d.scrollTop = 0;
      $('toast').hidden = true;
    }
  }
  function closeDialog(id) {
    $(id).close();
  }
  function closeAll() {
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  }
  const handleAndroidBack = () => {
    const dialogs = dialogStack.filter((d) => d.open);
    if (!dialogs.length) return false;
    dialogs[dialogs.length - 1].close();
    return true;
  };
  document
    .querySelectorAll('.close-dialog')
    .forEach((button) => (button.onclick = () => button.closest('dialog').close()));
  return {
    $,
    DAY,
    el,
    append,
    courseTitle,
    toast,
    showDialog,
    closeDialog,
    closeAll,
    handleAndroidBack
  };
};
