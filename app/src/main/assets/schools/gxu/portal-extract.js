(function () {
  try {
    var docs = [document],
      best = null;
    for (var i = 0; i < docs.length && i < 8; i++) {
      var result = Timetable.parseZhengfangDocument(docs[i]);
      if (result && (!best || result.courses.length > best.courses.length)) best = result;
      var frames = docs[i].querySelectorAll('iframe,frame');
      for (var j = 0; j < frames.length && docs.length < 8; j++) {
        try {
          var child = frames[j].contentDocument;
          if (child && docs.indexOf(child) < 0) docs.push(child);
        } catch (ignored) {}
      }
    }
    if (best && best.courses.length)
      return JSON.stringify({
        source: 'gxu-zhengfang',
        courses: best.courses,
        warnings: best.warnings,
        cardCount: best.cardCount
      });
    return JSON.stringify({
      error:
        '尚未读取到完整的个人课表，请选择学年、学期并查询后再试。也可使用 HTML 或 Excel 导入。',
      retryable: true
    });
  } catch (error) {
    return JSON.stringify({ error: '广西大学课表页面读取未完成，请使用 HTML 或 Excel 导入。' });
  }
})();
