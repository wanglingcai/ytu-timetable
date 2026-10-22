'use strict';
// Classic script factories also work from Android's offline file URL.
window.TimetableApp.createImport = function ({ T, ui, model, persist, render }) {
  const { $, DAY, el, append, toast, showDialog, closeDialog } = ui;
  const MAX_BYTES = 12 * 1024 * 1024;
  let preview = null;
  function backup() {
    const json = JSON.stringify(model.state, null, 2);
    if (window.AndroidLocal) AndroidLocal.exportBackup(json);
    else {
      const a = el('a');
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.href = url;
      a.download = '下节啥课-备份.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  function chooseFile() {
    if (window.AndroidLocal) AndroidLocal.importFile();
    else $('fileInput').click();
  }
  async function receiveBytes(name, bytes) {
    if (bytes.length > MAX_BYTES) {
      toast('文件不能超过 12 MB');
      return;
    }
    toast('正在本机解析课表…');
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      preview = T.readImport(bytes, name, XLSX);
      preview.name = name;
      showPreview();
    } catch (error) {
      preview = null;
      toast(error.message || '未能解析文件，请检查文件格式');
    }
  }
  function showPreview() {
    const conflicts = T.findConflicts(preview.courses);
    if (conflicts.length)
      preview.warnings.push(
        '存在 ' + conflicts.length + ' 组时间重叠；所有课程均保留，导入后可切换列表核对。'
      );
    $('importFileName').textContent = preview.name + ' · ' + preview.format;
    $('importHint').textContent = preview.restore
      ? '保存将用备份替换全部课程、个人安排和学期设置，请先备份当前数据。'
      : '保存会替换学校课程；第一周日期相同则保留个人安排。换学期时会确认移除原学期安排。请核对日期和节次时间。';
    $('importSummary').replaceChildren();
    const maxWeek = Math.max(...preview.courses.flatMap((c) => c.weeks));
    for (const [value, label] of [
      [preview.courses.length, '上课安排'],
      [new Set(preview.courses.map((c) => c.name)).size, '课程名称'],
      [maxWeek, '最大周次']
    ])
      $('importSummary').append(
        append(el('div', 'summary-box'), el('b', '', value), el('span', '', label))
      );
    $('importWarnings').hidden = !preview.warnings.length;
    $('importWarnings').textContent =
      preview.warnings.slice(0, 60).join('\n') +
      (preview.warnings.length > 60
        ? '\n还有 ' + (preview.warnings.length - 60) + ' 条提示，请核对原文件。'
        : '');
    const base = preview.restore || model.state;
    $('importSemester').value = preview.restore
      ? base.semester
      : model.state.courses.length
        ? model.state.semester
        : preview.name.replace(/\.[^.]+$/, '');
    $('importStart').value = base.startDate;
    $('importWeeks').value = Math.max(base.totalWeeks, maxWeek);
    $('reviewCheck').checked = false;
    const list = $('previewList');
    list.replaceChildren();
    preview.courses.forEach((c) => {
      const row = el('div', 'list-card'),
        info = el('div', 'course-info');
      append(
        info,
        el('strong', '', c.name),
        el(
          'p',
          '',
          DAY[c.day] + ' · 第 ' + c.start + '–' + c.end + ' 节 · ' + (c.room || '地点待定')
        ),
        el('p', '', T.formatWeeks(c.weeks) + ' 周' + (c.teacher ? ' · ' + c.teacher : ''))
      );
      row.append(info);
      list.append(row);
    });
    $('toast').hidden = true;
    showDialog('importDialog');
  }
  function importSave() {
    if (!preview) return;
    if (!$('reviewCheck').checked) {
      toast('请先核对课程，并勾选确认后保存');
      return;
    }
    const base = preview.restore || model.state;
    let times = base.times.map((x) => x.slice());
    const maxSection = Math.max(...preview.courses.map((c) => c.end));
    if (maxSection > times.length) {
      toast('导入课程含第 ' + maxSection + ' 节，请先取消导入，在学期设置中补全节次时间');
      return;
    }
    const personal = preview.restore
      ? []
      : model.state.courses.filter((c) => c.kind === 'personal');
    const sameSemester = $('importStart').value === model.state.startDate;
    if (
      personal.length &&
      !sameSemester &&
      !confirm(
        '学期第一周日期已改变。继续将替换课表，并移除 ' +
          personal.length +
          ' 条原学期的个人安排。建议先取消并导出备份。确定继续？'
      )
    )
      return;
    const next = {
      ...base,
      semester: $('importSemester').value,
      startDate: $('importStart').value,
      totalWeeks: Number($('importWeeks').value),
      courses: [...preview.courses, ...(sameSemester ? personal : [])],
      times,
      sourceName: preview.name
    };
    if (persist(next, '课表已保存，之后可直接离线查看')) {
      model.week = Math.max(
        1,
        Math.min(model.state.totalWeeks, T.currentWeek(model.state.startDate))
      );
      render();
      closeDialog('importDialog');
      preview = null;
    }
  }
  function sample() {
    const rows = [
      ['课程名称', '星期', '节次', '周次', '教师', '教室'],
      ['示例 · 计算机网络', '星期二', '1-2', '1-17', '示例教师', '六教 306'],
      ['示例 · 软件设计', '星期二', '3-4', '1-17', '示例教师', '四教 301'],
      ['示例 · Web 技术', '星期五', '5-6', '1-17', '示例教师', '实验室 2'],
      ['示例 · 项目管理', '星期四', '3-4', '1-18单周', '示例教师', '三教 316'],
      ['示例 · 上机实践', '星期一', '5-6', '8-15', '示例教师', '网络实验室'],
      ['示例 · 指定周讲座', '星期六', '1-2', '第3周', '示例教师', '五教 305']
    ];
    preview = { ...T.parseMatrix(rows), name: '体验示例（非本人真实课表）' };
    showPreview();
    $('importSemester').value = '体验示例 · 请导入真实课表';
  }
  const receivePortalImport = (payload) => {
    try {
      if (
        !payload ||
        payload.source !== 'ytu-urp' ||
        !Array.isArray(payload.rows) ||
        payload.rows.length > 100 ||
        payload.rows.some((row) => !Array.isArray(row) || row.length > 32)
      )
        throw new Error('教务课表数据结构无效');
      preview = T.parseMatrix(payload.rows, payload.merges || [], '烟台大学教务系统');
      if (!preview.courses.length)
        throw new Error(
          '已读取到 ' +
            (Number(payload.cardCount) || 0) +
            ' 个课程卡片，但未能解析上课安排（COURSE_PARSE）。原课表未修改。' +
            preview.warnings.slice(0, 2).join(' ')
        );
      if (Array.isArray(payload.warnings))
        preview.warnings.push(
          ...payload.warnings
            .filter((x) => typeof x === 'string')
            .slice(0, 20)
            .map((x) => x.slice(0, 2000))
        );
      preview.name = '烟台大学教务系统';
      preview.format = '官网登录读取（测试）';
      showPreview();
    } catch (error) {
      preview = null;
      toast(error.message || '教务课表读取失败，原课表未修改');
    }
  };
  const receiveImport = (payload) => {
    try {
      const raw = atob(payload.data),
        bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      receiveBytes(payload.name, bytes);
    } catch (error) {
      toast('导入文件读取失败');
    }
  };
  function bindEvents() {
    $('portalImport').onclick = () => {
      closeDialog('importChoice');
      if (window.AndroidLocal && typeof AndroidLocal.importPortal === 'function')
        AndroidLocal.importPortal();
      else toast('官网登录导入需要在安卓应用中使用；浏览器预览可导入已保存的 HTML 课表。');
    };
    $('fileInput').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > MAX_BYTES) {
        toast('文件不能超过 12 MB');
        return;
      }
      receiveBytes(file.name, new Uint8Array(await file.arrayBuffer()));
    });
    $('fileImport').onclick = () => {
      closeDialog('importChoice');
      chooseFile();
    };
    $('sampleButton').onclick = sample;
    $('backupButton').onclick = backup;
    $('cancelImport').onclick = () => closeDialog('importDialog');
    $('saveImport').onclick = importSave;
    ['importButton', 'emptyImport'].forEach(
      (id) => ($(id).onclick = () => showDialog('importChoice'))
    );
  }
  return { receivePortalImport, receiveImport, bindEvents };
};
