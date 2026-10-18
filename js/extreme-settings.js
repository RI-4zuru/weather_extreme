/* Popup-only settings UI: communicates with originating same-origin weather_extreme window. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let snapshot = null;
  const targetOrigin = location.origin === 'null' ? '*' : location.origin;
  function send(kind, detail = {}) {
    if (!window.opener || window.opener.closed) return showMessage('元のページが閉じられました。', true);
    window.opener.postMessage({ wxExtremeV2: true, kind: 'settings-' + kind, ...detail }, targetOrigin);
  }
  function showMessage(message, isError = false) {
    $('message').hidden = false; $('message').textContent = message;
    $('message').classList.toggle('error', isError);
    $('status').textContent = isError ? '操作を確認してください。' : '';
  }
  function makeButton(value, selected, callback) {
    const node = document.createElement('button');
    node.type = 'button'; node.className = 'choose' + (selected ? ' active' : '');
    node.textContent = value; node.addEventListener('click', callback);
    return node;
  }
  function renderItems(container, items) { container.replaceChildren(...items); }
  function selectItems(select, options, current) {
    const oldFocus = document.activeElement === select;
    select.replaceChildren(...options.map(o => {
      const option = document.createElement('option'); option.textContent = o.text; option.value = o.value;
      return option;
    }));
    if (options.some(o => o.value === current)) select.value = current;
    // Preserve focus after replacing options, but do not force change events.
    if (oldFocus) select.focus({ preventScroll: true });
  }
  function action(action, value, index) { send('command', { command: { action, value, index } }); }
  function normalizeLabel(v) { return String(v || '').replace(/\s/g, '').replace(/[都道府県]$/, ''); }
  function render(snap) {
    snapshot = snap;
    if (!snap.paneCount) return showMessage(snap.status || '元の画面を読み込み中です。');
    $('message').hidden = true;
    $('panePanel').hidden = snap.paneCount <= 1;
    renderItems($('paneButtons'), Array.from({ length: snap.paneCount }, (_, i) =>
      makeButton(snap.paneLabels?.[i] || (i + 1) + '画面目', i === snap.pane,
        () => send('pane', { pane: i }))));
    renderItems($('regionButtons'), snap.regions.map(item =>
      makeButton(item.name, item.active || normalizeLabel(item.name) === normalizeLabel(snap.group),
        () => action('region', item.name, item.i))));
    let prefs = snap.prefectures;
    // Give access to family members also when legacy UI currently shows another region.
    if ((!prefs.length || prefs.length === 1) && snap.groupPrefs?.length > 1) {
      prefs = snap.groupPrefs.map(name => ({ name, active: name === snap.selection.pref }));
    }
    renderItems($('prefButtons'), prefs.map(item =>
      makeButton(item.name, item.active || normalizeLabel(item.name) === normalizeLabel(snap.selection.pref),
        () => action('pref', item.name, item.i))));
    selectItems($('periodSelect'), snap.months, snap.selection.month);
    const els = snap.elements.map(e => ({ value: String(e.i), text: e.name + (e.live ? '  ●' : '') }));
    const found = snap.elements.find(e => normalizeLabel(e.name) === normalizeLabel(snap.selection.element));
    selectItems($('elementSelect'), els, found ? String(found.i) : '');
    $('refreshSelect').value = String(snap.autoMinutes);
  }
  $('periodSelect').addEventListener('change', e => action('month', e.target.value));
  $('elementSelect').addEventListener('change', e => {
    const item = snapshot?.elements.find(x => String(x.i) === e.target.value);
    if (item) action('element', item.name, item.i);
  });
  $('refreshSelect').addEventListener('change', e => action('auto', e.target.value));
  $('manualRefresh').addEventListener('click', () => action('refresh'));
  $('closeWindow').addEventListener('click', () => window.close());
  window.addEventListener('message', (event) => {
    if (!event.data?.wxExtremeV2 || event.source !== window.opener) return;
    if (location.origin !== 'null' && event.origin !== location.origin) return;
    if (event.data.kind === 'snapshot') render(event.data.data);
    if (event.data.kind === 'notice') showMessage(event.data.message, true);
  });
  if (!window.opener || window.opener.closed) showMessage('元ページから「設定」ボタンで開いてください。', true);
  else send('ready');
})();
