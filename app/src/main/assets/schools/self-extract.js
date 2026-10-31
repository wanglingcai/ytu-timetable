/* Read the visible timetable structures only; never return the page or login fields. */
(function () {
  'use strict';
  var fallback =
    '未识别到完整课表。请导出 Excel、保存课表页面为 HTML，或使用通用表格导入。原课表未修改。';
  try {
    var docs = [document],
      candidates = [],
      warnings = [],
      i,
      j;
    for (i = 0; i < docs.length && i < 8; i++) {
      var frames = docs[i].querySelectorAll('iframe,frame');
      for (j = 0; j < frames.length && docs.length < 8; j++) {
        try {
          var child = frames[j].contentDocument;
          if (child && docs.indexOf(child) < 0) docs.push(child);
        } catch (ignored) {}
      }
      var tables = docs[i].querySelectorAll('table');
      for (j = 0; j < tables.length && j < 40; j++) {
        var table = tables[j],
          rows = [],
          merges = [];
        if (table.rows.length > 100) continue;
        for (var r = 0; r < table.rows.length; r++) {
          rows[r] = rows[r] || [];
          var cells = table.rows[r].cells,
            col = 0;
          for (var k = 0; k < cells.length; k++) {
            while (rows[r][col] !== undefined) col++;
            var cell = cells[k],
              rs = cell.rowSpan || 1,
              cs = cell.colSpan || 1;
            if (r + rs > 100 || col + cs > 32) throw new Error('table limit');
            rows[r][col] = String(cell.innerText || cell.textContent || '')
              .trim()
              .slice(0, 16000);
            if (rs > 1 || cs > 1) {
              merges.push({ s: { r: r, c: col }, e: { r: r + rs - 1, c: col + cs - 1 } });
              for (var y = r; y < r + rs; y++)
                for (var x = col; x < col + cs; x++) {
                  rows[y] = rows[y] || [];
                  if (y !== r || x !== col) rows[y][x] = '';
                }
            }
            col += cs;
          }
        }
        try {
          var parsed = Timetable.parseMatrix(rows, merges, '网页课表');
          if (parsed.courses.length) candidates.push(parsed);
        } catch (ignored) {}
      }
      // Card fields must be explicitly labelled; incomplete cards are reported, not guessed.
      var cards = docs[i].querySelectorAll(
        '.course-card,.course-item,.timetable-card,[data-course-card]'
      );
      if (cards.length && cards.length <= 100) {
        var cardRows = [['课程名称', '星期', '节次', '周次', '教师', '教室']],
          skipped = 0;
        for (j = 0; j < cards.length; j++) {
          var lines = String(cards[j].innerText || cards[j].textContent || '').split(/\n+/),
            values = {};
          for (var n = 0; n < lines.length; n++) {
            var m = lines[n]
              .trim()
              .match(
                /^(课程名称|课程名|课程|星期|周几|节次|上课节次|周次|上课周次|教师|任课教师|教室|地点)\s*[：:]\s*(.+)$/
              );
            if (m) values[m[1]] = m[2];
          }
          var name = values['课程名称'] || values['课程名'] || values['课程'];
          if (name)
            cardRows.push([
              name,
              values['星期'] || values['周几'] || '',
              values['节次'] || values['上课节次'] || '',
              values['周次'] || values['上课周次'] || '',
              values['教师'] || values['任课教师'] || '',
              values['教室'] || values['地点'] || ''
            ]);
          else skipped++;
        }
        try {
          var cardResult = Timetable.parseMatrix(cardRows, [], '网页课程卡片');
          if (skipped)
            cardResult.warnings.push(
              '有 ' + skipped + ' 个课程卡片缺少明确的课程名称，未导入，请核对。'
            );
          if (cardResult.courses.length) candidates.push(cardResult);
        } catch (ignored) {}
      }
    }
    if (!candidates.length) return JSON.stringify({ error: fallback });
    // Prefer one complete structure rather than merging duplicate views of the same courses.
    candidates.sort(function (a, b) {
      return b.courses.length - a.courses.length;
    });
    var best = candidates[0];
    if (best.courses.length > 100) return JSON.stringify({ error: fallback });
    warnings = best.warnings.concat(['自助识别可能遗漏或误识别课程，请对照官网逐项核对。']);
    return JSON.stringify({
      source: 'self-portal',
      schoolName: '自助官网导入',
      courses: best.courses,
      warnings: warnings
    });
  } catch (error) {
    return JSON.stringify({ error: fallback });
  }
})();
