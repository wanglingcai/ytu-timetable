'use strict';
// Classic script factories also work from Android's offline file URL.
window.TimetableApp.createTimetableView = function ({
  T,
  ui,
  model,
  detail,
  openEdit,
  openReminder
}) {
  const { $, DAY, el, append, courseTitle } = ui;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let entranceAnimations = [];
  const stopMotion = () => {
    if (motionPreference.matches) {
      entranceAnimations.forEach((animation) => animation.cancel());
      entranceAnimations = [];
    }
  };
  if (motionPreference.addEventListener) motionPreference.addEventListener('change', stopMotion);
  else motionPreference.addListener(stopMotion);
  function animateEntrance() {
    entranceAnimations.forEach((animation) => animation.cancel());
    entranceAnimations = [];
    if (motionPreference.matches) return;
    const enter = (node, delay) => {
      if (!node || node.hidden || !node.animate || !node.getClientRects().length) return;
      entranceAnimations.push(
        node.animate(
          [
            { opacity: 0, transform: 'translateY(6px)' },
            { opacity: 1, transform: 'translateY(0)' }
          ],
          { duration: 250, delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' }
        )
      );
    };
    enter($('nextCard'), 0);
    enter(document.querySelector('.week-card'), 30);
    const view = model.listMode ? $('listView') : $('gridView');
    enter(view, 60);
    view
      .querySelectorAll(model.listMode ? '.list-card' : '.course-card')
      .forEach((card) => enter(card, 90 + (Number(card.dataset.day) - 1) * 30));
  }
  function activeCourses() {
    return T.coursesInWeek(model.state.courses, model.week);
  }
  function render() {
    model.renderedDate = T.dateString(new Date());
    $('semesterLabel').textContent = model.state.semester;
    $('saveLabel').textContent = model.storageProblem
      ? '本机数据读取失败，请从备份恢复'
      : model.state.savedAt
        ? '已保存 · ' +
          new Date(model.state.savedAt).toLocaleString('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          })
        : '不加载广告 · 不需要登录';
    $('weekSelect').replaceChildren();
    const current = T.currentWeek(model.state.startDate);
    for (let w = 1; w <= model.state.totalWeeks; w++) {
      const opt = el('option', '', '第 ' + w + ' 周');
      opt.value = w;
      opt.selected = w === model.week;
      $('weekSelect').append(opt);
    }
    const dates = T.weekDates(model.state.startDate, model.week);
    $('weekRange').textContent =
      (model.week === current ? '本周 · ' : '') +
      dates[0].slice(5).replace('-', '.') +
      ' — ' +
      dates[6].slice(5).replace('-', '.');
    $('prevWeek').disabled = model.week <= 1;
    $('nextWeek').disabled = model.week >= model.state.totalWeeks;
    const notice = $('semesterNotice');
    notice.hidden = current >= 1 && current <= model.state.totalWeeks;
    notice.textContent =
      current < 1
        ? '学期还未开始。当前展示第 ' + model.week + ' 周，可在设置里核对第一周日期。'
        : '已超出学期范围。当前展示第 ' + model.week + ' 周，可切换周次或在设置中调整学期。';
    const hasCourses = model.state.courses.length > 0;
    $('emptyState').hidden = hasCourses;
    $('scheduleSection').hidden = !hasCourses;
    $('backupButton').disabled = !hasCourses;
    $('allButton').disabled = !hasCourses;
    if (!hasCourses) {
      updateTimeCues();
      return;
    }
    const active = activeCourses(),
      conflicts = T.findConflicts(active),
      displayed = T.coursesForWeekView(model.state.courses, model.week);
    $('scheduleHeading').textContent =
      (model.week === current ? '本周安排' : '第 ' + model.week + ' 周安排') +
      ' · ' +
      active.length +
      ' 项';
    $('inactiveCount').textContent = '非本周 ' + (displayed.length - active.length) + ' 项';
    $('conflictNotice').hidden = !conflicts.length;
    $('conflictNotice').textContent =
      '有 ' + conflicts.length + ' 组课程或安排时间重叠，均已保留。请点击“切换列表”逐一核对。';
    $('noWeekCourses').hidden = active.length > 0;
    $('noWeekLabel').textContent = displayed.length
      ? '这一周没有安排，灰色卡片可查看其他周课程。'
      : '这一周还没有安排，点空白格试试。';
    $('gridView').hidden = model.listMode;
    $('listView').hidden = !model.listMode;
    $('viewToggle').textContent = model.listMode ? '切换周视图' : '切换列表';
    renderGrid(displayed, dates, conflicts);
    renderList(displayed, dates);
    updateTimeCues();
  }
  function updateTimeCues() {
    const now = new Date(),
      next = T.nextOccurrence(model.state, now),
      card = $('nextCard');
    card.hidden = !model.state.courses.length;
    card.disabled = !next;
    card.onclick = null;
    $('nextLabel').textContent = next && next.ongoing ? '此刻' : '接下来';
    $('nextName').textContent = next ? courseTitle(next.course) : '暂时没有新安排';
    $('nextMeta').textContent = '点课表空白格，留一点时间给自己';
    $('nextCountdown').textContent = '';
    if (next) {
      const today = T.dateString(now),
        tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const day =
        next.date === today
          ? '今天'
          : next.date === T.dateString(tomorrow)
            ? '明天'
            : (next.start.getFullYear() === now.getFullYear()
                ? next.date.slice(5)
                : next.date
              ).replace(/-/g, '/') +
              ' ' +
              DAY[next.course.day];
      const minutes = Math.max(1, Math.ceil((next.start - now) / 60000));
      const calendarDays = Math.round((T.parseDate(next.date) - T.parseDate(today)) / 86400000);
      $('nextCountdown').textContent = next.ongoing
        ? next.course.kind === 'personal'
          ? '正在进行'
          : '正在上课'
        : minutes < 60
          ? '还有 ' + minutes + ' 分钟'
          : minutes < 1440
            ? '还有 ' +
              Math.floor(minutes / 60) +
              ' 小时' +
              (minutes % 60 ? ' ' + (minutes % 60) + ' 分' : '')
            : calendarDays + ' 天后';
      $('nextMeta').textContent =
        day +
        ' ' +
        model.state.times[next.course.start - 1][0] +
        '–' +
        model.state.times[next.course.end - 1][1] +
        ' · ' +
        (next.course.room || '地点待定');
      card.onclick = () => openReminder({ id: next.course.id, date: next.date });
      card.setAttribute(
        'aria-label',
        $('nextLabel').textContent +
          '，' +
          next.course.name +
          '，' +
          $('nextCountdown').textContent +
          '，' +
          $('nextMeta').textContent +
          '，查看详情'
      );
    } else card.removeAttribute('aria-label');
    const grid = $('scheduleGrid');
    grid.querySelectorAll('.current-time').forEach((n) => n.remove());
    if (!$('scheduleSection').hidden && !model.listMode) {
      const day = T.weekDates(model.state.startDate, model.week).indexOf(T.dateString(now)),
        position = T.timePosition(model.state.times, now);
      if (day >= 0 && position) {
        const line = el('div', 'current-time');
        line.style.gridColumn = day + 2;
        line.style.gridRow = position.section + 2;
        line.style.marginTop = 'calc(var(--row-size) * ' + position.fraction + ')';
        line.setAttribute('role', 'img');
        line.setAttribute(
          'aria-label',
          '当前时间 ' +
            String(now.getHours()).padStart(2, '0') +
            ':' +
            String(now.getMinutes()).padStart(2, '0')
        );
        grid.append(line);
      }
    }
  }
  function renderGrid(active, dates, conflicts) {
    const grid = $('scheduleGrid');
    grid.replaceChildren();
    grid.style.setProperty('--sections', model.state.times.length);
    const today = T.dateString(new Date());
    for (let d = 0; d <= 7; d++) {
      const head = el('div', 'day-head' + (d && dates[d - 1] === today ? ' today' : ''));
      head.style.gridColumn = d + 1;
      head.style.gridRow = 1;
      head.append(el('span', '', d ? ['一', '二', '三', '四', '五', '六', '日'][d - 1] : '节次'));
      if (d) head.append(el('span', 'date', dates[d - 1].slice(5).replace('-', '/')));
      grid.append(head);
    }
    const todayIndex = dates.indexOf(today);
    if (todayIndex >= 0) {
      const highlight = el('div', 'today-column-highlight');
      highlight.style.gridColumn = todayIndex + 2;
      highlight.setAttribute('aria-hidden', 'true');
      grid.append(highlight);
    }
    for (let i = 1; i <= model.state.times.length; i++) {
      const label = el('div', 'time-label');
      label.style.gridColumn = 1;
      label.style.gridRow = i + 1;
      append(
        label,
        el('b', '', i),
        el('span', '', model.state.times[i - 1][0]),
        el('span', '', model.state.times[i - 1][1])
      );
      grid.append(label);
      for (let d = 1; d <= 7; d++) {
        const occupied = active.some((c) => c.day === d && c.start <= i && c.end >= i);
        const slot = el(
          occupied ? 'div' : 'button',
          'grid-slot' +
            (occupied ? '' : ' empty-slot') +
            (dates[d - 1] === today ? ' today-column' : '')
        );
        slot.style.gridColumn = d + 1;
        slot.style.gridRow = i + 1;
        if (!occupied) {
          slot.type = 'button';
          slot.dataset.day = d;
          slot.dataset.section = i;
          slot.setAttribute(
            'aria-label',
            '添加个人安排，' + DAY[d] + '第' + i + '节，第' + model.week + '周'
          );
          slot.onclick = () => openEdit(null, { day: d, start: i, end: i });
        }
        grid.append(slot);
      }
    }
    // Assign overlapping courses to separate lanes; all remain clickable.
    const positions = T.layoutCourses(active),
      stacks = new Map();
    for (const c of active) {
      const position = positions.get(c.id),
        { lane: index, count } = position;
      const inactive = !c.isActive;
      const card = el(
        'button',
        'course-card palette-' +
          T.coursePalette(c) +
          (inactive ? ' inactive' : '') +
          (conflicts.some((x) => x.a === c.id || x.b === c.id) ? ' conflict' : '')
      );
      if (c.start === c.end) card.classList.add('single-section');
      card.type = 'button';
      card.setAttribute(
        'aria-label',
        (inactive ? '非本周，' : '本周上课，') +
          c.name +
          '，' +
          DAY[c.day] +
          '第' +
          c.start +
          '-' +
          c.end +
          '节，' +
          c.room
      );
      card.dataset.day = c.day;
      card.title = c.name + ' · ' + (c.room || '地点待定');
      if (c.kind === 'personal') {
        card.classList.add('personal-entry');
        card.setAttribute(
          'aria-label',
          '个人安排，' + c.name + '，' + DAY[c.day] + '第' + c.start + '-' + c.end + '节'
        );
      }
      card.style.gridColumn = c.day + 1;
      card.style.gridRow = c.start + 1 + ' / ' + (c.end + 2);
      if (count > 1) {
        card.style.width = 'calc(' + 100 / count + '% - 2px)';
        card.style.marginLeft = 'calc(' + (100 * index) / count + '% + 1px)';
      }
      if (inactive) card.append(el('span', 'course-status', '非本周'));
      else if (c.kind === 'personal') card.append(el('span', 'course-status', '个人'));
      append(card, el('strong', '', courseTitle(c)), el('small', '', c.room || '地点待定'));
      card.addEventListener('click', () => detail(c.id));
      if (position.stackKey) {
        let host = stacks.get(position.stackKey);
        if (!host) {
          host = el('div', 'course-stack');
          host.style.gridColumn = c.day + 1;
          host.style.gridRow = c.start + 1 + ' / ' + (c.end + 2);
          stacks.set(position.stackKey, host);
          grid.append(host);
        }
        card.classList.add('stacked');
        card.style.top = position.stackOffset * 100 + '%';
        card.style.height = 'calc(' + position.stackSize * 100 + '% - 3px)';
        host.append(card);
      } else grid.append(card);
    }
    fitCourseCards();
  }
  function fitCourseCards() {
    const measurements = Array.from($('scheduleGrid').querySelectorAll('.course-card'), (card) => {
      if (!card.clientHeight) return null;
      const title = card.querySelector('strong'),
        room = card.querySelector('small'),
        status = card.querySelector('.course-status');
      const css = getComputedStyle(card),
        line = parseFloat(getComputedStyle(title).lineHeight),
        roomHeight = parseFloat(getComputedStyle(room).lineHeight),
        statusHeight = status ? parseFloat(getComputedStyle(status).lineHeight) : 0,
        gap = parseFloat(css.gap) || 4;
      const available =
        card.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
      let showStatus = !!status,
        showRoom = true;
      if (available < line + roomHeight + gap + (status ? statusHeight + gap : 0))
        showStatus = false;
      if (available < line + roomHeight + gap) showRoom = false;
      const reserved = (showStatus ? statusHeight + gap : 0) + (showRoom ? roomHeight + gap : 0);
      return {
        card,
        title,
        room,
        status,
        showRoom,
        showStatus,
        lines: Math.min(3, Math.max(1, Math.floor((available - reserved + 0.1) / line))),
        hideTitle: available < line
      };
    });
    measurements.filter(Boolean).forEach((item) => {
      item.card.style.setProperty('--title-lines', item.lines);
      item.room.hidden = !item.showRoom;
      if (item.status) item.status.hidden = !item.showStatus;
      item.title.style.visibility = item.hideTitle ? 'hidden' : '';
    });
  }
  function courseRow(c, withWeeks = false) {
    const inactive = !c.weeks.includes(model.week);
    const button = el('button', 'list-card' + (inactive ? ' inactive' : ''));
    button.type = 'button';
    button.dataset.day = c.day;
    const chip = el(
      'span',
      'time-chip palette-' + T.coursePalette(c) + (inactive ? ' inactive' : ''),
      c.start + '–' + c.end + ' 节'
    );
    const info = el('span', 'course-info');
    append(
      info,
      el('strong', '', c.name),
      el('p', '', [DAY[c.day], c.room || '地点待定', c.teacher].filter(Boolean).join(' · '))
    );
    if (c.kind === 'personal')
      info.append(el('p', 'course-status', '个人安排 · ' + T.formatWeeks(c.weeks) + ' 周'));
    if (inactive)
      info.append(
        el(
          'p',
          'course-status',
          '非本周 · ' + T.formatWeeks(c.weeks) + (c.kind === 'personal' ? ' 周安排' : ' 周上课')
        )
      );
    else if (withWeeks && c.kind !== 'personal')
      info.append(el('p', '', T.formatWeeks(c.weeks) + ' 周'));
    append(button, chip, info, el('span', 'arrow', '›'));
    button.addEventListener('click', () => detail(c.id));
    return button;
  }
  function renderList(active, dates) {
    const list = $('listView');
    list.replaceChildren();
    for (let day = 1; day <= 7; day++) {
      const courses = active.filter((c) => c.day === day);
      if (!courses.length) continue;
      const group = el('div', 'day-list');
      group.append(el('h3', '', DAY[day] + ' · ' + dates[day - 1]));
      courses.forEach((c) => group.append(courseRow(c)));
      list.append(group);
    }
  }
  function sizeViewport() {
    document.documentElement.style.setProperty(
      '--visual-height',
      Math.floor(window.visualViewport ? window.visualViewport.height : window.innerHeight) + 'px'
    );
  }
  function bindEvents() {
    window.addEventListener('resize', sizeViewport);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', sizeViewport);
    sizeViewport();
    if (window.ResizeObserver) new ResizeObserver(fitCourseCards).observe($('scheduleGrid'));
    else window.addEventListener('resize', fitCourseCards);
  }
  return { render, updateTimeCues, animateEntrance, courseRow, bindEvents };
};
