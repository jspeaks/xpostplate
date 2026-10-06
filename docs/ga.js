/* xpostplate site analytics: small GA4 event helpers (gtag is set up in each page's <head>). */
(function () {
  function send(name, params) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  }
  function clip(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  // copy_install: text copied from a code block (install and usage commands, flags, JSON).
  document.addEventListener('copy', function () {
    var sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed || !sel.anchorNode) return;
    var node = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    var code = node && node.closest('code, pre');
    if (!code) return;
    send('copy_install', { command: clip(sel.toString(), 100), page_path: location.pathname });
  });

  // outbound_click: links to github.com, npmjs.com, x.com (and their subdomains).
  var OUT = /(^|\.)(github\.com|npmjs\.com|x\.com)$/i;
  function onLink(e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || !a.hostname || !OUT.test(a.hostname)) return;
    if (e.type === 'auxclick' && e.button !== 1) return;
    send('outbound_click', { link_domain: a.hostname.replace(/^www\./i, ''), link_url: a.href, outbound: true });
  }
  document.addEventListener('click', onLink);
  document.addEventListener('auxclick', onLink);

  // harness_switch: fires if a Built-for-agents frame's data-harness changes (claude | codex | grok).
  if (window.MutationObserver) {
    var frames = document.querySelectorAll('.harness[data-harness]');
    if (frames.length) {
      var mo = new MutationObserver(function (list) {
        list.forEach(function (m) {
          var v = m.target.getAttribute('data-harness');
          if (v && v !== m.oldValue) send('harness_switch', { harness: v, previous: m.oldValue || '' });
        });
      });
      frames.forEach(function (el) {
        mo.observe(el, { attributes: true, attributeFilter: ['data-harness'], attributeOldValue: true });
      });
    }
  }
})();
