'use strict';
// Classic script factories also work from Android's offline file URL.
window.TimetableApp.createCourses = function ({ T, ui, model, persist, courseRow, reminderLabel }) {
  const { $, DAY, el, append, toast, showDialog, closeDialog } = ui;
  let editId = null,
    editKind = 'course',
    repeatMode = 'single';
  function detail(id) {
    const c = model.state.courses.find((x) => x.id === id);
    if (!c) return;
    const personal = c.kind === 'personal';
    $('courseDialogTitle').textContent = personal ? '安排详情' : '课程详情';
    const host = $('courseDetail');
    host.replaceChildren();
    host.append(el('h3', 'detail-name', c.name));
    const rows = [
      [
        '所选周',
        '第 ' + model.week + ' 周' + (c.weeks.includes(model.week) ? '上课' : '不上课（非本周）')
      ],
      ['星期', DAY[c.day]],
      ['节次', '第 ' + c.start + '–' + c.end + ' 节'],
      ['时间', model.state.times[c.start - 1][0] + '–' + model.state.times[c.end - 1][1]],
      ['周次', T.formatWeeks(c.weeks) + ' 周'],
      ['地点', c.room || '尚未填写'],
      ['教师', c.teacher || '尚未填写']
    ];
    if (personal) {
      rows[0] = [
        '所选周',
        '第 ' + model.week + ' 周' + (c.weeks.includes(model.week) ? '有安排' : '无安排')
      ];
      rows.pop();
      if (c.weeks.length === 1)
        rows.unshift(['日期', T.weekDates(model.state.startDate, c.weeks[0])[c.day - 1]]);
      rows.push(['备注', c.notes || '尚未填写']);
    }
    rows.push([
      '提醒',
      reminderLabel(
        personal
          ? c.reminderMinutes === undefined
            ? -1
            : c.reminderMinutes
          : model.state.reminders.courseMinutes
      )
    ]);
    for (const [key, value] of rows)
      host.append(append(el('div', 'detail-row'), el('span', '', key), el('span', '', value)));
    const actions = el('div', 'detail-actions'),
      edit = el('button', 'button primary', personal ? '修改安排' : '修改课程'),
      del = el('button', 'button danger', personal ? '删除安排' : '删除课程');
    edit.onclick = () => {
      closeDialog('courseDialog');
      openEdit(c);
    };
    del.onclick = () => {
      if (
        !confirm(
          personal
            ? '确定删除「' + c.name + '」及其设定的全部周次安排？'
            : '确定删除「' + c.name + '」的这一条上课安排？'
        )
      )
        return;
      if (
        persist(
          { ...model.state, courses: model.state.courses.filter((x) => x.id !== id) },
          personal ? '安排已删除' : '课程已删除'
        )
      ) {
        closeDialog('courseDialog');
        renderAll();
      }
    };
    append(actions, edit, del);
    host.append(actions);
    showDialog('courseDialog');
  }
  function openEdit(c, slot) {
    editId = c ? c.id : null;
    editKind = (c && c.kind === 'personal') || slot ? 'personal' : 'course';
    const personal = editKind === 'personal';
    $('editTitle').textContent = personal
      ? c
        ? '修改安排'
        : '添加个人安排'
      : c
        ? '修改课程'
        : '添加课程';
    $('entryNameLabel').textContent = personal ? '安排名称' : '课程名称';
    $('entryRoomLabel').textContent = personal ? '地点' : '教室';
    $('courseTeacherField').hidden = personal;
    $('notesField').hidden = !personal;
    $('personalReminderField').hidden = !personal;
    $('personalReminder').value =
      c && c.reminderMinutes !== undefined ? String(c.reminderMinutes) : '-1';
    $('entryWeeksLabel').textContent = personal ? '安排周次' : '上课周次';
    $('saveCourse').textContent = personal ? '保存安排' : '保存课程';
    $('editHint').textContent = personal
      ? '默认只安排在所选的第 ' +
        model.week +
        ' 周。可以修改节次，或填写连续周、单双周，让安排重复出现。'
      : '支持连续周、单双周和离散周次。超出学期或节次设置时会提示。';
    $('courseName').value = c ? c.name : '';
    $('courseTeacher').value = c ? c.teacher : '';
    $('courseRoom').value = c ? c.room : '';
    $('entryNotes').value = c ? c.notes || '' : '';
    $('notesDetails').open = personal && !!$('entryNotes').value;
    $('courseDay').value = c ? c.day : slot ? slot.day : 1;
    $('courseSections').value = c
      ? c.start + '-' + c.end
      : slot
        ? slot.start + (slot.end !== slot.start ? '-' + slot.end : '')
        : '';
    $('courseWeeks').value = c
      ? T.formatWeeks(c.weeks)
      : personal
        ? String(model.week)
        : '1-' + model.state.totalWeeks;
    const weeks = c
      ? c.weeks
      : personal
        ? [model.week]
        : Array.from({ length: model.state.totalWeeks }, (_, i) => i + 1);
    selectRepeat(
      weeks.length === 1 && weeks[0] === model.week
        ? 'single'
        : weeks.length === model.state.totalWeeks
          ? 'weekly'
          : 'custom',
      false
    );
    showDialog('editDialog');
  }
  function selectRepeat(mode, apply = true) {
    repeatMode = mode;
    if (apply && mode !== 'custom')
      $('courseWeeks').value =
        mode === 'single' ? String(model.week) : '1-' + model.state.totalWeeks;
    $('customWeeksField').hidden = mode !== 'custom';
    [
      ['repeatOnce', 'single'],
      ['repeatWeekly', 'weekly'],
      ['repeatCustom', 'custom']
    ].forEach(([id, value]) => $(id).setAttribute('aria-pressed', String(mode === value)));
    updateEditContext();
  }
  function updateEditContext() {
    try {
      const day = Number($('courseDay').value),
        sections = T.parseSections($('courseSections').value),
        weeks = T.parseWeeks($('courseWeeks').value);
      const date =
        weeks.length === 1 ? T.weekDates(model.state.startDate, weeks[0])[day - 1] : null;
      $('editContext').textContent =
        (date
          ? date.slice(5).replace('-', '月') + '日 ' + DAY[day]
          : repeatMode === 'weekly'
            ? '每周' + DAY[day]
            : DAY[day] + ' · 第 ' + T.formatWeeks(weeks) + ' 周') +
        (sections
          ? ' · 第 ' +
            sections.start +
            (sections.end === sections.start ? '' : '–' + sections.end) +
            ' 节'
          : '');
      $('editHint').textContent =
        editKind === 'personal'
          ? '个人安排仅在设定周次显示，提醒可独立设置。'
          : '课程按设定周次显示；提醒时间使用设置中的课程提醒。';
    } catch (error) {
      $('editContext').textContent = '选择星期、节次与周次，安排你的时间';
    }
  }
  function renderAll() {
    const host = $('allList');
    host.replaceChildren();
    [...model.state.courses]
      .sort((a, b) => a.day - b.day || a.start - b.start)
      .forEach((c) => host.append(courseRow(c, true)));
    if (!model.state.courses.length) host.append(el('p', 'small', '还没有课程。'));
  }
  function openAll() {
    renderAll();
    showDialog('allDialog');
  }
  function bindEvents() {
    $('allButton').onclick = openAll;
    $('allCoursesButton').onclick = openAll;
    $('addCourseButton').onclick = () => {
      closeDialog('addChoice');
      openEdit();
    };
    $('addPersonalButton').onclick = () => {
      closeDialog('addChoice');
      openEdit(null, { day: 1, start: 1, end: 1 });
    };
    $('repeatOnce').onclick = () => selectRepeat('single');
    $('repeatWeekly').onclick = () => selectRepeat('weekly');
    $('repeatCustom').onclick = () => selectRepeat('custom');
    $('cancelEdit').onclick = () => closeDialog('editDialog');
    $('courseForm').onsubmit = (event) => {
      event.preventDefault();
      try {
        const sections = T.parseSections($('courseSections').value);
        if (!sections) throw new Error('节次格式应为 1-2 或 3');
        const previous = model.state.courses.find((c) => c.id === editId);
        const c = T.validateCourse({
          id: editId || T.uid(),
          name: $('courseName').value,
          teacher: $('courseTeacher').value,
          room: $('courseRoom').value,
          day: Number($('courseDay').value),
          ...sections,
          weeks: T.parseWeeks($('courseWeeks').value),
          color: previous ? previous.color : model.state.courses.length % 8,
          ...(editKind === 'personal'
            ? {
                kind: 'personal',
                notes: $('entryNotes').value,
                reminderMinutes: Number($('personalReminder').value)
              }
            : {})
        });
        const courses = editId
          ? model.state.courses.map((x) => (x.id === editId ? c : x))
          : [...model.state.courses, c];
        if (
          persist(
            { ...model.state, courses },
            editKind === 'personal' ? '个人安排已保存' : '课程已保存'
          )
        ) {
          closeDialog('editDialog');
          renderAll();
        }
      } catch (error) {
        toast(error.message);
      }
    };
    ['courseDay', 'courseSections', 'courseWeeks'].forEach((id) =>
      $(id).addEventListener('input', updateEditContext)
    );
  }
  return { detail, openEdit, openAll, renderAll, bindEvents };
};
