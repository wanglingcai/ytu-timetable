'use strict';
window.TimetableApp.createOnboarding = function ({ ui, model, sample }) {
  const { $, showDialog, closeDialog } = ui;
  const KEY = 'ytu-onboarding-v1';
  let state = {},
    step = -1,
    mode = '',
    activeSteps = [];
  const steps = [
    {
      selector: '.week-card',
      title: '查看不同周的安排',
      text: '左右滑动或选择周次，点“回到本周”快速返回。'
    },
    {
      selector: '#gridView .course-card, #listView .list-card',
      title: '点开查看课程详情',
      text: '查看教室、教师、周次，也能编辑课程。'
    },
    {
      selector: '#toggleInactive',
      title: '灰色课程不在本周上课',
      text: '点这里可以显示或隐藏非本周课程。'
    },
    {
      selector: '#addButton',
      title: '把自己的安排也记下来',
      text: '添加自习、运动等安排，也能手动补课。'
    }
  ];
  function read() {
    try {
      const raw =
        window.AndroidLocal && typeof AndroidLocal.readGuideState === 'function'
          ? AndroidLocal.readGuideState()
          : localStorage.getItem(KEY);
      const value = raw && JSON.parse(raw);
      return value && typeof value === 'object' ? value : {};
    } catch (error) {
      return {};
    }
  }
  function write() {
    try {
      const raw = JSON.stringify(state);
      if (window.AndroidLocal && typeof AndroidLocal.saveGuideState === 'function')
        AndroidLocal.saveGuideState(raw);
      else localStorage.setItem(KEY, raw);
    } catch (error) {
      /* An unavailable preference must not block the timetable. */
    }
  }
  function visibleTarget(item) {
    return Array.from(document.querySelectorAll(item.selector)).find((node) => {
      const style = getComputedStyle(node);
      return (
        node.getClientRects().length && style.visibility !== 'hidden' && style.display !== 'none'
      );
    });
  }
  function position() {
    if (step < 0) return;
    const target = visibleTarget(activeSteps[step]);
    if (!target) {
      move(1);
      return;
    }
    const rect = target.getBoundingClientRect(),
      spot = $('guideSpotlight'),
      card = $('guideCard');
    const left = Math.max(4, rect.left - 5),
      right = Math.min(innerWidth - 4, rect.right + 5);
    const top = Math.max(4, rect.top - 5),
      bottom = Math.min(innerHeight - 4, rect.bottom + 5);
    Object.assign(spot.style, {
      left: left + 'px',
      top: top + 'px',
      width: Math.max(0, right - left) + 'px',
      height: Math.max(0, bottom - top) + 'px'
    });
    card.style.top = '';
    card.style.bottom = '';
    if (bottom + card.offsetHeight + 20 <= innerHeight) card.style.top = bottom + 10 + 'px';
    else if (top >= card.offsetHeight + 20) card.style.top = top - card.offsetHeight - 10 + 'px';
    else card.style.bottom = '12px';
  }
  function showStep() {
    if (step < 0 || step >= activeSteps.length) {
      finish();
      return;
    }
    const item = activeSteps[step],
      target = visibleTarget(item);
    if (!target) {
      move(1);
      return;
    }
    $('guideProgress').textContent = step + 1 + ' / ' + activeSteps.length;
    $('guideTitle').textContent = item.title;
    $('guideText').textContent = item.text;
    $('guidePrevious').hidden = step === 0;
    $('guideNext').textContent = step === activeSteps.length - 1 ? '开始使用' : '下一步';
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    requestAnimationFrame(() => {
      position();
      $('guideCard').focus({ preventScroll: true });
    });
  }
  function move(delta) {
    step += delta;
    showStep();
  }
  function finish() {
    if (step < 0) return;
    if (mode === 'real') {
      state.realGuideDone = true;
      write();
    }
    step = -1;
    $('guideOverlay').hidden = true;
    document.body.classList.remove('guide-open');
  }
  function start(kind) {
    mode = kind;
    activeSteps = steps.filter(visibleTarget);
    if (!activeSteps.length) return;
    step = 0;
    $('guideOverlay').hidden = false;
    document.body.classList.add('guide-open');
    showStep();
  }
  function initialize(hadStoredState) {
    state = read();
    if (!state.initialized) {
      state.initialized = true;
      if (hadStoredState) {
        state.welcomeSeen = true;
        if (model.state.courses.length && !String(model.state.sourceName).includes('体验示例'))
          state.realGuideDone = true;
      }
      write();
    }
    if (!state.welcomeSeen) {
      state.welcomeSeen = true;
      write();
      showDialog('welcomeDialog');
    }
  }
  function onImported(kind) {
    if (kind === 'backup') {
      state.realGuideDone = true;
      write();
      return;
    }
    if (kind === 'sample') start('sample');
    else if (!state.realGuideDone) start('real');
  }
  function exit() {
    if (step >= 0) {
      finish();
      return true;
    }
    return false;
  }
  function bindEvents() {
    $('welcomeImport').onclick = () => {
      closeDialog('welcomeDialog');
      showDialog('importChoice');
    };
    $('welcomeSample').onclick = () => {
      closeDialog('welcomeDialog');
      sample();
    };
    $('welcomeSkip').onclick = () => closeDialog('welcomeDialog');
    $('replayGuide').onclick = () => {
      closeDialog('settingsDialog');
      start('replay');
    };
    $('guidePrevious').onclick = () => move(-1);
    $('guideNext').onclick = () => move(1);
    $('guideSkip').onclick = finish;
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, { passive: true });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && exit()) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }
  return { initialize, onImported, bindEvents, exit };
};
