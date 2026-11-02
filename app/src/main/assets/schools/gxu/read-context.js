/* Only the currently selected semester and school query fields; never account/password inputs. */
(function () {
  var docs = [document];
  for (var i = 0; i < docs.length && i < 8; i++) {
    var doc = docs[i];
    var year = doc.getElementById('xnm'),
      term = doc.getElementById('xqm');
    if (
      year &&
      term &&
      /^(?:https:\/\/jwxt2018\.gxu\.edu\.cn(?::443)?|http:\/\/jwxt2018\.gxu\.edu\.cn(?::80)?)\//i.test(
        doc.URL
      )
    ) {
      var result = {
        pageUrl: doc.URL,
        xnm: String(year.value || ''),
        xqm: String(term.value || '')
      };
      ['xsdm', 'kclbdm', 'kclxdm', 'validate'].forEach(function (id) {
        var node = doc.getElementById(id);
        if (node && String(node.value || '').length <= 2048) result[id] = String(node.value || '');
      });
      return JSON.stringify(result);
    }
    var frames = doc.querySelectorAll('iframe,frame');
    for (var j = 0; j < frames.length && docs.length < 8; j++) {
      try {
        var child = frames[j].contentDocument;
        if (child && docs.indexOf(child) < 0) docs.push(child);
      } catch (ignored) {}
    }
  }
  return '{}';
})();
