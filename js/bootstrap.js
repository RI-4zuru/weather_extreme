const APP_PREFIX = "weather_extreme:";
const DASHBOARD_THEME_KEY = "weather_extreme:dashboard_theme";
const DASHBOARD_MODE_KEY = "weather_extreme:dashboard_mode";
const DASHBOARD_LINKED_SCROLL_KEY = "weather_extreme:dashboard_linked_scroll";
const DESKTOP_MIN_WIDTH = 1181;

const rawStorage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch {
      // 保存できない環境では、その場の表示だけを継続する。
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // no-op
    }
  },
};

const params = new URLSearchParams(window.location.search);
const paneName = params.get("pane") || "";
const isEmbeddedPane = Boolean(paneName);
const isDesktopDashboard = !isEmbeddedPane && window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`).matches;

initializeTheme();

if (isEmbeddedPane) {
  await initializeEmbeddedPane(paneName);
} else if (isDesktopDashboard) {
  initializeDesktopDashboard();
} else {
  await initializeLegacyView();
}

function initializeTheme() {
  const saved = rawStorage.get(DASHBOARD_THEME_KEY);
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));

  window.addEventListener("storage", (event) => {
    if (event.key === DASHBOARD_THEME_KEY && event.newValue) {
      applyTheme(event.newValue);
    }
  });
}

function applyTheme(theme) {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalized;
  document.documentElement.style.colorScheme = normalized;
  updateThemeButton(document.getElementById("themeToggle"), normalized);
  updateThemeButton(document.getElementById("dashboardThemeToggle"), normalized);
}

function updateThemeButton(button, theme) {
  if (!button) return;
  const isDark = theme === "dark";
  button.textContent = isDark ? "☀" : "☾";
  button.title = isDark ? "ライト表示に切り替え" : "ダーク表示に切り替え";
  button.setAttribute("aria-label", button.title);
}

function bindThemeButton(button) {
  if (!button || button.dataset.themeBound === "true") return;
  button.dataset.themeBound = "true";
  button.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    rawStorage.set(DASHBOARD_THEME_KEY, next);
    applyTheme(next);
    syncThemeToFrames(next);
  });
  updateThemeButton(button, document.documentElement.dataset.theme);
}

async function initializeLegacyView() {
  document.body.classList.add("legacy-view");
  document.getElementById("desktopDashboard")?.setAttribute("hidden", "");
  const legacyApp = document.getElementById("legacyApp");
  if (legacyApp) legacyApp.hidden = false;
  await import("./app.js");
}

async function initializeEmbeddedPane(scope) {
  document.documentElement.dataset.embedded = scope;
  document.body.classList.add("embedded-view", `embedded-${sanitizeClassName(scope)}`);
  document.getElementById("desktopDashboard")?.setAttribute("hidden", "");
  const legacyApp = document.getElementById("legacyApp");
  if (legacyApp) legacyApp.hidden = false;

  seedPaneStorage(scope);
  installPaneStorageScope(scope);

  await import("./app.js");
  applyTheme(rawStorage.get(DASHBOARD_THEME_KEY) || document.documentElement.dataset.theme);
  prepareEmbeddedPane(scope);
}

function sanitizeClassName(value) {
  return String(value || "pane").replace(/[^a-zA-Z0-9_-]/g, "-");
}

function paneStorageKey(scope, appKey) {
  const suffix = String(appKey).startsWith(APP_PREFIX)
    ? String(appKey).slice(APP_PREFIX.length)
    : String(appKey);
  return `${APP_PREFIX}pane:${scope}:${suffix}`;
}

function isGlobalAppKey(key) {
  return key === "weather_extreme:live_value_cache" || key.startsWith("weather_extreme:dashboard_");
}

function seedPaneStorage(scope) {
  const setIfMissing = (appKey, value) => {
    const scoped = paneStorageKey(scope, appKey);
    if (rawStorage.get(scoped) == null && value != null && value !== "") {
      rawStorage.set(scoped, value);
    }
  };

  const copySharedPreference = (suffix) => {
    const appKey = `${APP_PREFIX}${suffix}`;
    setIfMissing(appKey, rawStorage.get(appKey));
  };

  ["last_month", "last_element", "within_mode", "show_live_column", "enabled_prefs", "enabled_areas", "nation_mode_enabled"].forEach(copySharedPreference);

  if (scope === "nation") {
    rawStorage.set(paneStorageKey(scope, `${APP_PREFIX}area_selection`), "nation");
    rawStorage.set(paneStorageKey(scope, `${APP_PREFIX}nation_mode_enabled`), "true");
    rawStorage.set(paneStorageKey(scope, `${APP_PREFIX}enabled_areas`), JSON.stringify(["nation:all"]));
    rawStorage.set(paneStorageKey(scope, `${APP_PREFIX}control_panel_collapsed`), "false");
    setIfMissing(`${APP_PREFIX}last_month`, "all");
    return;
  }

  const existingPref = rawStorage.get(`${APP_PREFIX}last_pref`);
  const existingRegion = rawStorage.get(`${APP_PREFIX}last_region`);
  const defaultPref = scope === "right" ? "kyoto" : (existingPref || "osaka");

  setIfMissing(`${APP_PREFIX}last_pref`, defaultPref);
  setIfMissing(`${APP_PREFIX}last_region`, existingRegion || "近畿");

  if (scope === "single") {
    const existingSelection = rawStorage.get(`${APP_PREFIX}area_selection`) || "prefecture";
    setIfMissing(`${APP_PREFIX}area_selection`, existingSelection);
  } else {
    setIfMissing(`${APP_PREFIX}area_selection`, "prefecture");
  }

  setIfMissing(`${APP_PREFIX}control_panel_collapsed`, "false");
}

function installPaneStorageScope(scope) {
  const proto = window.Storage?.prototype;
  if (!proto || proto.__weatherExtremeScoped) return;

  const nativeGetItem = proto.getItem;
  const nativeSetItem = proto.setItem;
  const nativeRemoveItem = proto.removeItem;

  const convert = (key) => {
    const text = String(key);
    if (!text.startsWith(APP_PREFIX) || isGlobalAppKey(text) || text.startsWith(`${APP_PREFIX}pane:`)) {
      return text;
    }
    return paneStorageKey(scope, text);
  };

  proto.getItem = function getItem(key) {
    return nativeGetItem.call(this, convert(key));
  };
  proto.setItem = function setItem(key, value) {
    return nativeSetItem.call(this, convert(key), value);
  };
  proto.removeItem = function removeItem(key) {
    return nativeRemoveItem.call(this, convert(key));
  };

  Object.defineProperty(proto, "__weatherExtremeScoped", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

function prepareEmbeddedPane(scope) {
  const tryPrepare = () => {
    const tableTitle = document.getElementById("tableTitle");
    const summaryHeader = document.getElementById("summaryHeader");
    const liveSummaryBody = document.getElementById("liveSummaryBody");
    if (!tableTitle || !summaryHeader || !liveSummaryBody) return false;

    document.body.classList.add("embedded-ready");

    if (scope === "nation") {
      const nationButton = document.querySelector("[data-nation-tab], [data-nation-select]");
      if (nationButton && !nationButton.classList.contains("active")) {
        nationButton.click();
      }
      if (liveSummaryBody.hidden) summaryHeader.click();
      initializeNationOverview();
    }

    return true;
  };

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (tryPrepare() || attempts > 80) {
      window.clearInterval(timer);
    }
  }, 150);
}

function initializeNationOverview() {
  if (document.getElementById("nationOverview")) return;
  const appMain = document.querySelector(".app-main");
  const summarySection = document.querySelector(".summary-section");
  const tableBody = document.getElementById("rankTableBody");
  if (!appMain || !summarySection || !tableBody) return;

  const overview = document.createElement("section");
  overview.id = "nationOverview";
  overview.className = "nation-overview";
  overview.innerHTML = `
    <div class="nation-overview-heading">
      <div>
        <span class="nation-overview-kicker">PREFECTURE INDEX</span>
        <h2>都道府県別・実況ランクイン</h2>
      </div>
      <div class="nation-overview-stats" aria-live="polite"></div>
    </div>
    <div class="nation-prefecture-chips"></div>
  `;
  appMain.insertBefore(overview, summarySection);

  let updateTimer = 0;
  const scheduleUpdate = () => {
    window.clearTimeout(updateTimer);
    updateTimer = window.setTimeout(updateNationOverview, 120);
  };

  const updateNationOverview = () => {
    const chipHost = overview.querySelector(".nation-prefecture-chips");
    const statsHost = overview.querySelector(".nation-overview-stats");
    if (!chipHost || !statsHost) return;

    const aggregateRows = [...tableBody.querySelectorAll("tr.prefecture-aggregate-row")];
    const entries = aggregateRows.map((row, index) => {
      const label = row.querySelector(".station-name")?.textContent?.trim() || `都道府県 ${index + 1}`;
      const liveCells = [...row.querySelectorAll(".rank-cell.live-target, .rank-cell.live-and-year")];
      const top1Cell = row.children?.[1];
      const isTop1 = Boolean(top1Cell?.classList?.contains("live-target") || top1Cell?.classList?.contains("live-and-year"));
      return { row, label: label.replace(/総合$/u, ""), count: liveCells.length, isTop1 };
    }).filter((entry) => entry.count > 0);

    chipHost.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "nation-overview-empty";
      empty.textContent = aggregateRows.length ? "現在、都道府県総合での実況ランクインはありません。" : "全国データを読み込んでいます。";
      chipHost.append(empty);
      statsHost.textContent = "";
      return;
    }

    const totalHits = entries.reduce((sum, entry) => sum + entry.count, 0);
    const top1Count = entries.filter((entry) => entry.isTop1).length;
    statsHost.innerHTML = `<strong>${entries.length}</strong> 都道府県　<span>${totalHits} 件</span>${top1Count ? `　<em>1位更新 ${top1Count}</em>` : ""}`;

    entries.forEach((entry, index) => {
      const id = `nation-prefecture-row-${index}`;
      entry.row.id = id;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `nation-prefecture-chip${entry.isTop1 ? " top1" : ""}`;
      button.innerHTML = `<span>${escapeForHtml(entry.label)}</span><strong>${entry.count}</strong>`;
      button.addEventListener("click", () => {
        entry.row.scrollIntoView({ behavior: "smooth", block: "center" });
        entry.row.classList.add("nation-row-flash");
        window.setTimeout(() => entry.row.classList.remove("nation-row-flash"), 1200);
      });
      chipHost.append(button);
    });
  };

  new MutationObserver(scheduleUpdate).observe(tableBody, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  scheduleUpdate();
}

function escapeForHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initializeDesktopDashboard() {
  document.body.classList.add("dashboard-view-active");
  const dashboard = document.getElementById("desktopDashboard");
  const legacyApp = document.getElementById("legacyApp");
  if (legacyApp) legacyApp.hidden = true;
  if (dashboard) dashboard.hidden = false;

  bindThemeButton(document.getElementById("dashboardThemeToggle"));

  const modeButtons = [...document.querySelectorAll("[data-dashboard-mode]")];
  const savedMode = rawStorage.get(DASHBOARD_MODE_KEY);
  const initialMode = ["single", "compare", "nation"].includes(savedMode) ? savedMode : "compare";
  modeButtons.forEach((button) => {
    button.addEventListener("click", () => activateDashboardMode(button.dataset.dashboardMode || "compare"));
  });

  document.getElementById("syncComparisonButton")?.addEventListener("click", syncComparisonSettings);
  document.getElementById("swapComparisonButton")?.addEventListener("click", swapComparisonPanes);

  const linkedButton = document.getElementById("linkedScrollButton");
  let linkedScrollEnabled = rawStorage.get(DASHBOARD_LINKED_SCROLL_KEY) === "true";
  const updateLinkedButton = () => {
    if (!linkedButton) return;
    linkedButton.setAttribute("aria-pressed", String(linkedScrollEnabled));
    linkedButton.classList.toggle("active", linkedScrollEnabled);
    linkedButton.textContent = `スクロール連動：${linkedScrollEnabled ? "ON" : "OFF"}`;
  };
  linkedButton?.addEventListener("click", () => {
    linkedScrollEnabled = !linkedScrollEnabled;
    rawStorage.set(DASHBOARD_LINKED_SCROLL_KEY, String(linkedScrollEnabled));
    updateLinkedButton();
  });
  updateLinkedButton();

  let scrollSyncLock = false;
  const attachLinkedScroll = (source, target) => {
    if (!source || !target || source.dataset.scrollBound === target.dataset.dashboardFrame) return;
    source.dataset.scrollBound = target.dataset.dashboardFrame || "target";
    source.addEventListener("load", () => {
      const sourceWindow = source.contentWindow;
      if (!sourceWindow) return;
      sourceWindow.addEventListener("scroll", () => {
        if (!linkedScrollEnabled || scrollSyncLock) return;
        const targetWindow = target.contentWindow;
        const sourceDocument = source.contentDocument;
        const targetDocument = target.contentDocument;
        if (!targetWindow || !sourceDocument || !targetDocument) return;

        const sourceMax = Math.max(1, sourceDocument.documentElement.scrollHeight - sourceWindow.innerHeight);
        const targetMax = Math.max(0, targetDocument.documentElement.scrollHeight - targetWindow.innerHeight);
        const ratio = sourceWindow.scrollY / sourceMax;
        scrollSyncLock = true;
        targetWindow.scrollTo({ top: targetMax * ratio, behavior: "auto" });
        window.requestAnimationFrame(() => {
          scrollSyncLock = false;
        });
      }, { passive: true });
    });
  };

  const leftFrame = getDashboardFrame("left");
  const rightFrame = getDashboardFrame("right");
  attachLinkedScroll(leftFrame, rightFrame);
  attachLinkedScroll(rightFrame, leftFrame);

  activateDashboardMode(initialMode);
}

const DASHBOARD_MODE_META = {
  single: {
    title: "単独表示",
    description: "都道府県・地域・全国の極値表を、横幅いっぱいに表示します。",
  },
  compare: {
    title: "左右比較",
    description: "2つの都道府県を独立して選び、同じ画面内で順位表を見比べます。",
  },
  nation: {
    title: "全国ランクイン",
    description: "実況で極値10位以内に入った都道府県を一覧化し、該当行へすぐ移動できます。",
  },
};

function activateDashboardMode(mode) {
  const normalized = DASHBOARD_MODE_META[mode] ? mode : "compare";
  rawStorage.set(DASHBOARD_MODE_KEY, normalized);

  document.querySelectorAll("[data-dashboard-mode]").forEach((button) => {
    const active = button.dataset.dashboardMode === normalized;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });

  document.querySelectorAll("[data-dashboard-view]").forEach((view) => {
    view.hidden = view.dataset.dashboardView !== normalized;
  });

  const meta = DASHBOARD_MODE_META[normalized];
  const title = document.getElementById("dashboardModeTitle");
  const description = document.getElementById("dashboardModeDescription");
  const actions = document.getElementById("comparisonActions");
  if (title) title.textContent = meta.title;
  if (description) description.textContent = meta.description;
  if (actions) actions.hidden = normalized !== "compare";

  if (normalized === "compare") {
    ensureFrameLoaded("left");
    ensureFrameLoaded("right");
  } else {
    ensureFrameLoaded(normalized);
  }
}

function getDashboardFrame(name) {
  return document.querySelector(`[data-dashboard-frame="${name}"]`);
}

function ensureFrameLoaded(name) {
  const frame = getDashboardFrame(name);
  if (!frame || frame.dataset.loaded === "true") return;

  const query = frame.dataset.frameQuery || `pane=${name}`;
  const url = new URL(window.location.href);
  url.search = query;
  url.hash = "";
  frame.src = url.href;
  frame.dataset.loaded = "true";
  frame.addEventListener("load", () => {
    attachFrameStatusObserver(frame, name);
    syncThemeToFrame(frame, document.documentElement.dataset.theme);
  });
}

function attachFrameStatusObserver(frame, name) {
  const doc = frame.contentDocument;
  const output = document.querySelector(`[data-frame-current="${name}"]`);
  if (!doc || !output) return;

  const update = () => {
    const tableTitle = doc.getElementById("tableTitle")?.textContent?.trim();
    const observedAt = doc.getElementById("observedLatestAt")?.textContent?.trim();
    if (tableTitle && tableTitle !== "読み込み待ち") {
      output.textContent = observedAt && observedAt !== "読み込み待ち"
        ? `${tableTitle} ｜ ${observedAt}`
        : tableTitle;
      output.title = output.textContent;
    }
  };

  const titleNode = doc.getElementById("tableTitle");
  const observedNode = doc.getElementById("observedLatestAt");
  if (titleNode) new MutationObserver(update).observe(titleNode, { childList: true, subtree: true, characterData: true });
  if (observedNode) new MutationObserver(update).observe(observedNode, { childList: true, subtree: true, characterData: true });
  doc.addEventListener("click", () => window.setTimeout(update, 250));
  update();
}

function syncThemeToFrames(theme) {
  document.querySelectorAll("[data-dashboard-frame]").forEach((frame) => syncThemeToFrame(frame, theme));
}

function syncThemeToFrame(frame, theme) {
  try {
    if (frame?.contentDocument?.documentElement) {
      frame.contentDocument.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
    }
  } catch {
    // 同一オリジンでない場合は何もしない。
  }
}

function panePrefix(scope) {
  return `${APP_PREFIX}pane:${scope}:`;
}

function syncComparisonSettings() {
  const suffixes = ["last_month", "last_element", "within_mode", "show_live_column"];
  suffixes.forEach((suffix) => {
    const value = rawStorage.get(`${panePrefix("left")}${suffix}`);
    if (value != null) rawStorage.set(`${panePrefix("right")}${suffix}`, value);
  });
  reloadDashboardFrame("right");
  showDashboardToast("左側の月・要素・表示条件を右側へ揃えました。 ");
}

function swapComparisonPanes() {
  const leftValues = collectPaneStorage("left");
  const rightValues = collectPaneStorage("right");
  clearPaneStorage("left");
  clearPaneStorage("right");
  restorePaneStorage("left", rightValues);
  restorePaneStorage("right", leftValues);
  reloadDashboardFrame("left");
  reloadDashboardFrame("right");
  showDashboardToast("左右の選択内容を入れ替えました。 ");
}

function collectPaneStorage(scope) {
  const prefix = panePrefix(scope);
  const values = new Map();
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) {
        values.set(key.slice(prefix.length), window.localStorage.getItem(key));
      }
    }
  } catch {
    // no-op
  }
  return values;
}

function clearPaneStorage(scope) {
  const prefix = panePrefix(scope);
  const keys = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // no-op
  }
}

function restorePaneStorage(scope, values) {
  values.forEach((value, suffix) => {
    if (value != null) rawStorage.set(`${panePrefix(scope)}${suffix}`, value);
  });
}

function reloadDashboardFrame(name) {
  const frame = getDashboardFrame(name);
  if (!frame) return;
  try {
    frame.contentWindow?.location.reload();
  } catch {
    const src = frame.src;
    frame.src = "about:blank";
    window.setTimeout(() => {
      frame.src = src;
    }, 0);
  }
}

function showDashboardToast(message) {
  document.querySelector(".dashboard-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "dashboard-toast";
  toast.textContent = message.trim();
  document.body.append(toast);
  window.requestAnimationFrame(() => toast.classList.add("show"));
  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 220);
  }, 2200);
}
