/* Read only timetable DOM. ES5 syntax also works in older Android WebViews. */
(function () {
  'use strict';
  function fail(message, code, retryable) {
    return JSON.stringify({ error: message, code: code, retryable: !!retryable });
  }
  function valueOf(node) {
    return String(node.textContent || '')
      .replace(/\u00a0/g, ' ')
      .trim();
  }
  function findTable(doc) {
    var exact = doc.getElementById('courseTable');
    if (exact && exact.rows && exact.querySelector('.class_div')) return exact;
    var tables = doc.querySelectorAll('table');
    for (var i = 0; i < tables.length; i++) {
      var header = tables[i].rows[0];
      if (
        header &&
        (valueOf(header).match(/星期[一二三四五六日天]|周[一二三四五六日天]/g) || []).length >= 3
      )
        return tables[i];
    }
    return exact && exact.rows ? exact : null;
  }
  try {
    var docs = [document],
      table = null,
      tableDoc = document,
      inaccessible = 0;
    for (var d = 0; d < docs.length && d < 8; d++) {
      var candidate = findTable(docs[d]);
      if (candidate && (!table || candidate.querySelector('.class_div'))) {
        table = candidate;
        tableDoc = docs[d];
      }
      if (table && table.querySelector('.class_div')) break;
      var frames = docs[d].querySelectorAll('iframe,frame');
      for (var f = 0; f < frames.length && docs.length < 8; f++) {
        try {
          var child = frames[f].contentDocument;
          if (child && docs.indexOf(child) < 0) docs.push(child);
          else if (!child) inaccessible++;
        } catch (ignored) {
          inaccessible++;
        }
      }
    }
    if (!table)
      return fail(
        inaccessible
          ? '课程可能位于无法读取的嵌入页面，请直接打开上方「选课结果」后再试。'
          : '尚未找到课表网格。请确认已经进入「选课结果」并能看到课程卡片。',
        inaccessible ? 'FRAME_UNAVAILABLE' : 'NO_TABLE',
        true
      );
    if (table.rows.length > 100)
      return fail('课表行数异常，请使用文件导入。', 'TABLE_LIMIT', false);
    var rows = [],
      merges = [],
      cards = 0;
    for (var r = 0; r < table.rows.length; r++) {
      rows[r] = rows[r] || [];
      var c = 0,
        cells = table.rows[r].cells;
      for (var k = 0; k < cells.length; k++) {
        var cell = cells[k];
        while (rows[r][c] !== undefined) c++;
        var rs = cell.rowSpan || 1,
          cs = cell.colSpan || 1;
        if (r + rs > 100 || c + cs > 32)
          return fail('课表合并单元格异常，请使用文件导入。', 'CELL_LIMIT', false);
        var blocks = cell.querySelectorAll('.class_div'),
          records = [],
          paragraphs,
          p,
          lines,
          b;
        for (b = 0; b < blocks.length; b++) {
          paragraphs = blocks[b].querySelectorAll('p');
          lines = [];
          for (p = 0; p < paragraphs.length; p++)
            if (valueOf(paragraphs[p])) lines.push(valueOf(paragraphs[p]));
          if (lines.length) {
            records.push(lines.join('\n'));
            cards++;
          }
        }
        var value;
        if (records.length) value = records.join('\n\n');
        else {
          paragraphs = cell.querySelectorAll('p');
          lines = [];
          for (p = 0; p < paragraphs.length; p++)
            if (valueOf(paragraphs[p])) lines.push(valueOf(paragraphs[p]));
          value = lines.length
            ? lines.join('\n')
            : cell.tagName.toLowerCase() === 'th'
              ? valueOf(cell)
              : String(cell.innerText || cell.textContent || '').trim();
          if (/\d\s*周/.test(value) && /\d\s*(?:小)?节/.test(value)) cards++;
        }
        if (value.length > 16000)
          return fail('课表单元格过长，请使用文件导入。', 'CELL_LIMIT', false);
        rows[r][c] = value;
        if (rs > 1 || cs > 1) {
          merges.push({ s: { r: r, c: c }, e: { r: r + rs - 1, c: c + cs - 1 } });
          for (var y = r; y < r + rs; y++)
            for (var x = c; x < c + cs; x++) {
              rows[y] = rows[y] || [];
              if (y !== r || x !== c) rows[y][x] = '';
            }
        }
        c += cs;
      }
    }
    if (!cards) {
      var hasNames = false,
        gridCells = table.querySelectorAll('td');
      for (var z = 0; z < gridCells.length; z++) if (valueOf(gridCells[z])) hasNames = true;
      for (var q = 0; q < docs.length; q++)
        if (docs[q].querySelector('.class_div,[class*="div-kcb-"],[class*="p-kcm-"]'))
          hasNames = true;
      return hasNames
        ? fail(
            '页面已显示课程，但当前手机版网格未提供可读取的完整周次和节次，官网数据查询也未完成。请重开选课结果后再试。',
            'MOBILE_DETAILS',
            true
          )
        : fail('尚未读取到课程内容，请确认课表已加载。', 'EMPTY_TABLE', true);
    }
    var heading = tableDoc.getElementById('h4_id1');
    var missing = (heading ? valueOf(heading) : '').match(/(\d+)门课程未显示/);
    var warnings =
      missing && Number(missing[1]) > 0
        ? [
            '官网提示有 ' +
              missing[1] +
              ' 门课程未在网格显示，本次只读取网格内有明确时间的安排，请另行核对。'
          ]
        : [];
    var parsed = Timetable.parseMatrix(rows, merges, '学校课表');
    if (!parsed.courses.length)
      return fail(
        '当前学校页面结构发生变化，请使用 HTML 或 Excel 导入，或者提交学校适配请求。',
        'UNSUPPORTED_LAYOUT',
        false
      );
    warnings = warnings.concat(parsed.warnings);
    return JSON.stringify({
      source: 'ytu-urp',
      courses: parsed.courses.map(function (course) {
        return {
          name: course.name,
          teacher: course.teacher,
          room: course.room,
          day: course.day,
          start: course.start,
          end: course.end,
          weeks: course.weeks
        };
      }),
      warnings: warnings,
      cardCount: cards,
      collectorVersion: 3
    });
  } catch (error) {
    return fail(
      '网页读取脚本未能完成，请刷新页面后重试；也可使用 HTML 文件导入。',
      'SCRIPT_ERROR',
      false
    );
  }
})();
