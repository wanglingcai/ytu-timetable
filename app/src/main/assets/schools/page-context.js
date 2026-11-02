/* Inspect addresses only, including frames whose DOM is cross-origin; never read login fields. */
(function () {
  'use strict';
  var docs = [document],
    urls = [],
    i,
    j;
  function add(url) {
    if (typeof url === 'string' && url.length < 8192 && urls.indexOf(url) < 0 && urls.length < 40)
      urls.push(url);
  }
  for (i = 0; i < docs.length && i < 16; i++) {
    var doc = docs[i];
    add(doc.URL);
    var frames = doc.querySelectorAll('iframe,frame');
    for (j = 0; j < frames.length && j < 32; j++) {
      add(frames[j].src);
      try {
        var child = frames[j].contentDocument;
        if (child && docs.indexOf(child) < 0 && docs.length < 16) docs.push(child);
      } catch (ignored) {}
    }
  }
  return JSON.stringify(urls);
})();
