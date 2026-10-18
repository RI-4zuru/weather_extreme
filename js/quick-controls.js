/* Weather Extreme v2 additive UI. Works without frameworks and retains legacy handlers. */
(() => {
  'use strict';
  if (window.__wxExtremeV2) return;
  window.__wxExtremeV2 = true;
  const VERSION = '3';
  const AUTO_KEY = 'weather_extreme:v2:auto_refresh_minutes';
  const ALLOWED_AUTO = [0, 2, 5, 10, 15];
  const GROUPS = [
    ['北海道', ['北海道', '道央', '道南', '道北', '道東']],
    ['東北', ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県']],
    ['関東甲信', ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '山梨県', '長野県']],
    ['北陸', ['新潟県', '富山県', '石川県', '福井県']],
    ['東海', ['岐阜県', '静岡県', '愛知県', '三重県']],
    ['近畿', ['滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県']],
    ['中国', ['鳥取県', '島根県', '岡山県', '広島県', '山口県']],
    ['四国', ['徳島県', '香川県', '愛媛県', '高知県']],
    ['九州北部', ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県']],
    ['九州南部', ['宮崎県', '鹿児島県']],
    ['沖縄', ['沖縄県']]
  ];
  const state = { popup: null, popupSignature: '', lastRefresh: Date.now(), lastCheck: Date.now(), attached: false,
    quick: null, quickSignature: '', quickTimer: 0, observer: null, toastTimer: 0 };
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clean = (s) => String(s ?? '').replace(/\s+/g, '').replace(/[▼▾▽←→]/g, '').trim();
  const shown = (el) => el && el.getClientRects().length > 0;
  const normLabel = (s) => clean(s).replace(/^(?:選択中|現在|選択)[:：]?/, '').replace(/[（(](?:選択中|現在)[）)]/, '');
  const btnText = (b) => (b?.getAttribute('aria-label') || b?.innerText || b?.textContent || '').trim();
  const active = (b) => b?.classList.contains('active') || b?.classList.contains('is-active') ||
      b?.classList.contains('selected') || b?.getAttribute('aria-pressed') === 'true' || b?.getAttribute('aria-selected') === 'true';
  const family = (pref) => GROUPS.find(g => g[1].some(p => clean(p) === clean(pref))) || null;
  const ownContext = () => $('#legacyApp') || $('.legacy-app') || ($('#settingsPanels') && document.body);
  const sameOrigin = (w) => { try { return !!w?.document; } catch (_) { return false; } };
  const targetOrigin = () => location.origin === 'null' ? '*' : location.origin;

  // Browser-cached observation JSON must be revalidated, while historical tables,
  // scripts, styles and other large static resources keep their normal cache.
  const nativeFetch = window.fetch?.bind(window);
  if (nativeFetch) {
    window.fetch = function wxFetch(input, init) {
      try {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
        const url = new URL(raw, location.href);
        const path = url.pathname;
        const live = /(?:^|\/)(?:amedas|observations?|realtime|live|obs)(?:\/|[_\-.])/i.test(path) &&
          /\.(?:json|geojson)$/i.test(path);
        if (live && (url.protocol === 'https:' || url.protocol === 'http:')) {
          url.searchParams.set('_wx_refresh', String(Math.floor(Date.now() / 60000)));
          const request = (typeof Request !== 'undefined' && input instanceof Request)
            ? new Request(url.href, input) : url.href;
          return nativeFetch(request, { ...init, cache: 'no-store' });
        }
      } catch (_) { /* use the original request */ }
      return nativeFetch(input, init);
    };
  }

  function isLiveElement(button) {
    const d = button.dataset || {};
    for (const k of ['hasObservation', 'live', 'hasLive', 'realtime', 'hasRealtime']) {
      if (k in d) return /^(?:true|1|yes|あり)$/i.test(d[k]);
    }
    if (button.classList.contains('no-live') || button.classList.contains('no-observation')) return false;
    if (button.classList.contains('has-live') || button.classList.contains('live-observation')) return true;
    const label = clean(btnText(button));
    if (/(?:平年|前年差|累年|統計開始|月間|年間|順位|過去|歴代)/.test(label)) return false;
    if (/(?:^|日)(?:最高|最低|平均)?気温|降水量|降雪|積雪|風速|日照時間|湿度|気圧|最大瞬間風速/.test(label)) return true;
    return false;
  }

  function legacyWindow(pane = 0) {
    const frames = getPaneFrames();
    if (frames.length) {
      const frame = frames[Math.max(0, Math.min(pane, frames.length - 1))];
      return sameOrigin(frame.contentWindow) ? frame.contentWindow : null;
    }
    return window;
  }
  function getPaneFrames() {
    if (!$('#desktopDashboard') || !shown($('#desktopDashboard'))) return [];
    return $$('iframe', $('#desktopDashboard')).filter(f => shown(f) && (f.getAttribute('src') || f.contentDocument));
  }
  function fromPane(pane = 0) {
    const win = legacyWindow(pane);
    return win ? { win, doc: win.document } : null;
  }
  function readSelectOptions(node) {
    return node ? [...node.options].map(o => ({ value: o.value, text: (o.textContent || '').trim() })) : [];
  }
  function getSnapshot(pane = 0) {
    const ctx = fromPane(pane);
    const doc = ctx?.doc;
    if (!doc) return { pane, paneCount: 0, status: '画面を読み込んでいます。' };
    const summary = s => normLabel($(s, doc)?.textContent || '');
    const pref = summary('#areaSelectionSummary');
    const month = $('#monthSelect', doc);
    const monthValue = month?.value || '';
    const element = summary('#elementSelectionSummary');
    const prefs = $$('#prefButtons .pref-button', doc);
    const groups = $$('.region-tabs button, .region-tabs [role=tab]', doc);
    const elements = $$('#elementPanel .element-button', doc);
    const f = family(pref);
    const frameList = getPaneFrames();
    const paneCount = frameList.length || 1;
    return {
      pane, paneCount, paneLabels: frameList.map((frame, idx) => {
        const heading = frame.closest('.dashboard-frame-card')?.querySelector('.dashboard-frame-title')?.textContent?.trim();
        return heading || (idx === 0 ? '左側' : '右側');
      }),
      selection: { pref, month: monthValue, monthText: month?.selectedOptions?.[0]?.textContent?.trim() || '', element },
      group: f?.[0] || '', groupPrefs: f?.[1] || [],
      regions: groups.map((b, i) => ({ name: btnText(b), i, active: active(b) })),
      prefectures: prefs.map((b, i) => ({ name: btnText(b), i, active: active(b) })),
      months: readSelectOptions(month),
      elements: elements.map((b, i) => ({ name: btnText(b), i, live: isLiveElement(b), active: active(b) })),
      autoMinutes: getAutoMinutes(), status: ''
    };
  }
  function getAutoMinutes() {
    try { const n = Number(localStorage.getItem(AUTO_KEY)); return ALLOWED_AUTO.includes(n) && localStorage.getItem(AUTO_KEY) !== null ? n : 5; }
    catch (_) { return 5; }
  }
  function setAutoMinutes(n) {
    const mins = Number(n);
    if (!ALLOWED_AUTO.includes(mins)) return;
    try { localStorage.setItem(AUTO_KEY, String(mins)); } catch (_) {}
    sendSnapshot();
  }
  function originalClick(button) { if (!button) return false; button.click(); return true; }
  function lookupText(btns, label) {
    const target = clean(label);
    return btns.find(b => clean(btnText(b)) === target) ||
      btns.find(b => clean(btnText(b)).includes(target) && target.length >= 3);
  }
  function scheduleSync(delay = 90) {
    if (state.quickTimer) clearTimeout(state.quickTimer);
    state.quickTimer = window.setTimeout(() => { state.quickTimer = 0; rebuildQuickBar(); sendSnapshot(); }, delay);
  }
  function applyCommand(cmd, pane = 0) {
    const ctx = fromPane(pane);
    if (!ctx?.doc) { toast('画面を読み込めません。'); return; }
    const doc = ctx.doc;
    const action = cmd?.action;
    if (action === 'refresh') { refreshPane(pane); return; }
    if (action === 'auto') { setAutoMinutes(cmd.value); return; }
    if (action === 'month') {
      const select = $('#monthSelect', doc);
      if (!select || ![...select.options].some(o => o.value === cmd.value)) return toast('対象期間を選べませんでした。');
      select.value = cmd.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (action === 'element') {
      const choices = $$('#elementPanel .element-button', doc);
      const target = choices[cmd.index] && clean(btnText(choices[cmd.index])) === clean(cmd.value)
        ? choices[cmd.index] : lookupText(choices, cmd.value);
      if (!originalClick(target)) return toast('この要素を選べませんでした。');
    } else if (action === 'region') {
      const choices = $$('.region-tabs button, .region-tabs [role=tab]', doc);
      const target = choices[cmd.index] && clean(btnText(choices[cmd.index])) === clean(cmd.value)
        ? choices[cmd.index] : lookupText(choices, cmd.value);
      if (!originalClick(target)) return toast('地域を切り替えられませんでした。');
    } else if (action === 'pref') {
      return choosePrefecture(doc, cmd.value, pane);
    } else return;
    scheduleSync(100);
    window.setTimeout(() => scheduleSync(40), 450);
  }
  function choosePrefecture(doc, name, pane) {
    const exact = () => lookupText($$('#prefButtons .pref-button', doc), name);
    if (originalClick(exact())) { scheduleSync(100); window.setTimeout(() => scheduleSync(40), 450); return; }
    // Some site versions render only prefectures in the currently selected region.
    const targetGroup = family(name)?.[0];
    const regionButtons = $$('.region-tabs button, .region-tabs [role=tab]', doc);
    const region = regionButtons.find(b => clean(btnText(b)).includes(clean(targetGroup))) || null;
    if (!region) { toast('該当する府県が現在の元画面にありません。設定から地域を選んでください。'); return; }
    region.click();
    let attempts = 0;
    const tick = () => {
      if (originalClick(exact())) { scheduleSync(70); return; }
      if (++attempts < 10) return window.setTimeout(tick, 90);
      toast('府県を切り替えられませんでした。'); scheduleSync();
    };
    window.setTimeout(tick, 40);
  }
  function toast(message) {
    const el = document.createElement('div');
    el.className = 'wx-popup-message'; el.setAttribute('role', 'status'); el.textContent = message;
    document.body.append(el); window.setTimeout(() => el.remove(), 4000);
    if (state.popup && !state.popup.closed) safeSend({ kind: 'notice', message });
  }
  function safeSend(payload) {
    if (!state.popup || state.popup.closed) return;
    try { state.popup.postMessage({ wxExtremeV2: true, ...payload }, targetOrigin()); } catch (_) {}
  }
  function sendSnapshot() {
    if (!state.popup || state.popup.closed) return;
    const data = getSnapshot(state.popupPane || 0);
    const signature = JSON.stringify(data);
    if (state.popupSignature === signature) return;
    state.popupSignature = signature;
    safeSend({ kind: 'snapshot', data });
  }
  function openSettings(pane = 0) {
    const url = new URL('./settings-window.html', document.baseURI || location.href);
    const popupName = 'weather_extreme_settings_' + (window === window.top ? 'desktop' : 'pane');
    const popup = window.open(url.href, popupName, 'popup=yes,width=710,height=800,resizable=yes,scrollbars=yes');
    if (!popup) { toast('設定画面を開けませんでした。ブラウザでポップアップを許可してください。'); return; }
    state.popup = popup; state.popupPane = pane; state.popupSignature = ''; 
    popup.focus();
    window.setTimeout(sendSnapshot, 150);
  }
  function formatTime(d) {
    return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(d);
  }
  function refreshLocal() {
    // Cache-busting applies to the document URL and data requests; static assets remain cacheable.
    const url = new URL(location.href);
    url.searchParams.set('wx_fresh', String(Date.now()));
    location.replace(url.href);
  }
  function refreshPane(pane = 0) {
    const frames = getPaneFrames();
    if (frames.length) {
      const frame = frames[Math.max(0, Math.min(frames.length - 1, pane))];
      if (frame && frame.src) {
        const url = new URL(frame.src, location.href);
        url.searchParams.set('wx_fresh', String(Date.now()));
        frame.src = url.href;
        state.lastRefresh = Date.now();
      }
      return;
    }
    // When invoked inside an iframe, this refreshes only that pane.
    refreshLocal();
  }
  function refreshVisible() {
    const frames = getPaneFrames();
    if (frames.length) {
      const visible = frames.map((frame, index) => ({ frame, index })).filter(item => shown(item.frame));
      visible.forEach((item, order) => window.setTimeout(() => refreshPane(item.index), order * 700));
    } else refreshPane(0);
  }
  function bindMessages() {
    window.addEventListener('message', (event) => {
      if (!event.data?.wxExtremeV2 || !event.data.kind?.startsWith?.('settings-')) return;
      if (event.source !== state.popup) return;
      if (location.origin !== 'null' && event.origin !== location.origin) return;
      if (event.data.kind === 'settings-ready') { state.popupSignature = ''; sendSnapshot(); }
      if (event.data.kind === 'settings-pane') { state.popupPane = Number(event.data.pane) || 0; state.popupSignature = ''; sendSnapshot(); }
      if (event.data.kind === 'settings-command') applyCommand(event.data.command, state.popupPane || 0);
    });
  }
  function makeButton(label, className, handler, pressed = false) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = className; btn.textContent = label;
    if (className === 'wx-pref-btn') btn.setAttribute('aria-pressed', String(pressed));
    btn.addEventListener('click', handler);
    return btn;
  }
  function makeSelect(className, aria, options, current, onChange) {
    const node = document.createElement('select');
    node.className = 'wx-quickselect ' + className; node.setAttribute('aria-label', aria);
    options.forEach(item => {
      const opt = document.createElement('option'); opt.value = item.value; opt.textContent = item.text;
      node.append(opt);
    });
    if (options.some(o => o.value === current)) node.value = current;
    node.addEventListener('change', () => onChange(node.value));
    return node;
  }
  function rebuildQuickBar() {
    const quick = state.quick;
    if (!quick?.isConnected) return;
    const snap = getSnapshot(0);
    const selectedPref = snap.selection.pref;
    const signature = JSON.stringify({pref: snap.selection.pref, month: snap.selection.month, element: snap.selection.element,
      group: snap.group, prefectures: snap.prefectures.map(p => p.name), months: snap.months.map(m => m.value),
      elements: snap.elements.map(e => [e.name, e.live]), online: navigator.onLine});
    if (state.quickSignature === signature) return;
    state.quickSignature = signature;
    let peers = snap.groupPrefs;
    // Prefer the original page's region list; do not show unavailable nested Hokkaido areas.
    const available = snap.prefectures.map(p => p.name);
    if (!peers?.length) peers = available;
    if (peers.length > 9 && available.length && available.length <= 9) peers = available;
    if (!peers.length) peers = selectedPref ? [selectedPref] : [];
    const strip = $('.wx-prefstrip', quick);
    const existing = strip?.scrollLeft || 0;
    if (strip) {
      strip.replaceChildren(...peers.map(name => makeButton(
        (name === '北海道' ? name : name.replace(/[都道府県]$/, '')) || name, 'wx-pref-btn', () => applyCommand({ action: 'pref', value: name }), clean(name) === clean(selectedPref)
      )));
      strip.scrollLeft = existing;
    }
    const months = snap.months;
    const monthHolder = $('.wx-month-holder', quick);
    if (monthHolder && months.length) {
      monthHolder.replaceChildren(makeSelect('wx-month', '通年または対象月', months, snap.selection.month,
        value => applyCommand({ action: 'month', value })));
    }
    const live = snap.elements.filter(e => e.live);
    const elementHolder = $('.wx-element-holder', quick);
    if (elementHolder) {
      const selection = live.find(e => clean(e.name) === clean(snap.selection.element));
      const items = live.map(e => ({ value: String(e.i), text: e.name }));
      if (!selection) items.unshift({ value: 'none', text: snap.selection.element ? '実況なし（設定）' : '実況対応要素' });
      const list = makeSelect('wx-element', '実況のある要素', items,
        selection ? String(selection.i) : 'none', value => {
          if (value === 'none') return;
          const item = live.find(e => String(e.i) === value);
          if (item) applyCommand({ action: 'element', index: item.i, value: item.name });
        });
      list.disabled = live.length === 0;
      list.title = live.length ? '実況がある要素のみ表示。全要素は設定から選択できます。' : '元サイトの要素がまだ読み込まれていません。';
      elementHolder.replaceChildren(list);
    }
    const status = $('.wx-quick-status', quick);
    if (status) { status.textContent = navigator.onLine === false ? 'オフライン' : '確認 ' + formatTime(new Date());
      status.classList.toggle('wx-offline', navigator.onLine === false); }
  }
  function installQuickBar() {
    if (state.quick?.isConnected) return true;
    const legacy = ownContext();
    const header = $('.app-header', legacy || document);
    if (!header || !$('#monthSelect', legacy) || !$('#elementPanel', legacy)) return false;
    document.body.classList.add('wx-v2');
    const quick = document.createElement('nav');
    quick.className = 'wx-quickbar'; quick.setAttribute('aria-label', '府県、対象月、実況要素のクイック操作');
    const strip = document.createElement('div'); strip.className = 'wx-prefstrip'; strip.setAttribute('aria-label', '同じ地方の府県');
    const month = document.createElement('div'); month.className = 'wx-month-holder';
    const element = document.createElement('div'); element.className = 'wx-element-holder';
    const settings = makeButton('⚙ 設定', 'wx-quick-btn', () => openSettings(0)); settings.title = '別ウインドウで詳細設定';
    const refresh = makeButton('↻ 更新', 'wx-quick-btn', () => {
      if (window !== window.top && sameOrigin(window.top) && window.top.wxExtremeRefreshOne) {
        window.top.wxExtremeRefreshOne(window); return;
      }
      refreshPane();
    }); refresh.title = 'この表示を再取得します（ページ単位）';
    const status = document.createElement('span'); status.className = 'wx-quick-status';
    quick.append(strip, month, element, settings, refresh, status);
    header.append(quick);
    state.quick = quick;
    rebuildQuickBar();
    const watch = ['#areaSelectionSummary', '#monthSelectionSummary', '#elementSelectionSummary', '#prefButtons', '#elementPanel', '#settingsPanels'];
    const roots = watch.map(s => $(s, legacy)).filter(Boolean);
    state.observer = new MutationObserver(() => scheduleSync(100));
    roots.forEach(node => state.observer.observe(node, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'aria-selected'] }));
    $('#monthSelect', legacy)?.addEventListener('change', () => scheduleSync(100));
    return true;
  }
  function moveTableUtility() {
    const bar = $('#tableUtilityBar');
    const heading = $('.table-section .table-heading-row');
    if (!bar || !heading) return false;
    if (bar.parentElement !== heading) heading.append(bar); // preserve legacy querySelector hierarchy and handlers
    const box = $('.table-search-box', bar);
    if (box) box.remove(); // unwanted station search; no impact on ranking data
    $$('.table-search-clear', bar).forEach(el => el.remove());
    const legend = $('.table-section > .legend');
    const headingInfo = $('.table-section .table-heading-row > div:first-child');
    if (legend && headingInfo && legend.parentElement !== headingInfo) headingInfo.append(legend);
    return true;
  }
  function renameComparison() {
    $$('.dashboard-mode-button').forEach(el => {
      if (el.dataset.dashboardMode === 'compare' || /左右比較/.test(el.textContent)) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
          textNode.nodeValue = textNode.nodeValue.replace(/左右比較/g, '２府県比較');
        }
        el.title = '２府県比較';
      }
    });
    $$('.dashboard-context-title').forEach(el => { el.textContent = el.textContent.replace(/左右比較/g, '２府県比較'); });
  }
  function installDashboard() {
    const header = $('#desktopDashboard .dashboard-header');
    if (!header) return;
    document.body.classList.add('wx-v2');
    renameComparison();
    const actions = $('#desktopDashboard .dashboard-action-groups');
    const theme = $('#dashboardThemeToggle');
    if (actions && actions.parentElement !== header) header.insertBefore(actions, theme || null);
    // Settings and refresh are provided by each visible pane's quick bar.
    // Do not duplicate them in the dashboard header.
    $('#dashboardTableJumpButton')?.remove();
    $('#wxDashboardSettings')?.remove();
    $('#wxDashboardRefresh')?.remove();
    $$('.dashboard-mode-button', header).forEach(button => button.addEventListener('click', () => window.setTimeout(sendSnapshot, 400)));
    window.wxExtremeRefreshOne = (childWindow) => {
      const frames = getPaneFrames(); const idx = frames.findIndex(frame => frame.contentWindow === childWindow);
      if (idx !== -1) refreshPane(idx);
    };
  }
  function init() {
    bindMessages();
    if ($('#desktopDashboard')) installDashboard();
    if (!installQuickBar()) {
      const pending = new MutationObserver(() => { if (installQuickBar()) pending.disconnect(); });
      pending.observe(document.body, { childList: true, subtree: true });
      window.setTimeout(() => pending.disconnect(), 25000);
    }
    if (!moveTableUtility() && ownContext()) {
      const tableObserver = new MutationObserver(() => { if (moveTableUtility()) tableObserver.disconnect(); });
      tableObserver.observe(document.body, { childList: true, subtree: true });
      window.setTimeout(() => tableObserver.disconnect(), 25000);
    }
    window.addEventListener('online', () => scheduleSync());
    window.addEventListener('offline', () => scheduleSync());
    // One timer per desktop root. Child frames do not issue duplicate network requests.
    const parentControls = () => {
      try { return window !== window.top && !!window.top.__wxExtremeV2; } catch (_) { return false; }
    };
    window.setInterval(sendSnapshot, 3000);
    window.setInterval(() => {
      if (parentControls() || document.hidden || getAutoMinutes() === 0) return;
      const now = Date.now();
      if (now - state.lastRefresh >= getAutoMinutes() * 60000) {
        state.lastRefresh = now; refreshVisible();
      }
    }, 30000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
