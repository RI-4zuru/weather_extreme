const BUILD_VERSION = "20260717-4";
const APP_PREFIX = "weather_extreme:";
const DASHBOARD_THEME_KEY = "weather_extreme:dashboard_theme";
const DASHBOARD_MODE_KEY = "weather_extreme:dashboard_mode";
const DASHBOARD_LINKED_SCROLL_KEY = "weather_extreme:dashboard_linked_scroll";
const DASHBOARD_SETTINGS_VISIBLE_KEY = "weather_extreme:dashboard_settings_visible";
const MONTH_PANEL_COLLAPSED_KEY = "weather_extreme:month_panel_collapsed";
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
const requestedPaneName = params.get("pane") || "";
const paneName = requestedPaneName === "nation" ? "single" : requestedPaneName;
const isEmbeddedPane = Boolean(paneName);
const isDesktopDashboard = !isEmbeddedPane && window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`).matches;
let dashboardSettingsVisible = rawStorage.get(DASHBOARD_SETTINGS_VISIBLE_KEY) !== "false";


async function retireLegacyServiceWorker() {
  // 以前のPWA用Service Workerは、古いindex.html / app.jsをキャッシュ優先で返す。
  // 現行版ではPWAキャッシュを使わないため、残存登録と専用キャッシュを明示的に破棄する。
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => {
            try {
              return new URL(registration.scope).pathname.includes("/weather_extreme/");
            } catch {
              return true;
            }
          })
          .map((registration) => registration.unregister())
      );
    } catch (error) {
      console.warn("旧Service Workerの解除に失敗しました:", error);
    }
  }

  if ("caches" in window) {
    try {
      const cacheNames = await window.caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("weather-extreme-"))
          .map((name) => window.caches.delete(name))
      );
    } catch (error) {
      console.warn("旧キャッシュの削除に失敗しました:", error);
    }
  }
}

async function loadApplicationModule() {
  try {
    const appUrl = new URL(`./app.js?v=${BUILD_VERSION}`, import.meta.url);
    const response = await fetch(appUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`app.js の取得に失敗しました（HTTP ${response.status}）`);
    }

    let source = await response.text();
    source = rewriteApplicationModuleImports(source);

    const moduleBlob = new Blob([source], { type: "text/javascript" });
    const moduleUrl = URL.createObjectURL(moduleBlob);
    try {
      await import(moduleUrl);
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(moduleUrl), 1000);
    }
    return true;
  } catch (error) {
    console.error("アプリ本体の読み込みに失敗しました:", error);
    renderApplicationLoadError(error);
    return false;
  }
}

function rewriteApplicationModuleImports(source) {
  const resolveImport = (specifier) => {
    const clean = String(specifier || "").split("?")[0];
    if (clean === "./ranking.js") {
      return new URL(`./ranking-live-policy.js?v=${BUILD_VERSION}`, import.meta.url).href;
    }
    return new URL(specifier, import.meta.url).href;
  };

  return String(source)
    .replace(/(\bfrom\s*["'])(\.\/[^"']+)(["'])/g, (_, before, specifier, after) => {
      return `${before}${resolveImport(specifier)}${after}`;
    })
    .replace(/(\bimport\s*\(\s*["'])(\.\/[^"']+)(["']\s*\))/g, (_, before, specifier, after) => {
      return `${before}${resolveImport(specifier)}${after}`;
    });
}

function renderApplicationLoadError(error) {
  const message = error?.message || String(error || "不明なエラー");
  const safeMessage = escapeForHtml(message);
  const tableTitle = document.getElementById("tableTitle");
  const statusText = document.getElementById("statusText");
  const rankTableBody = document.getElementById("rankTableBody");

  if (tableTitle) tableTitle.textContent = "表の読み込みに失敗しました";
  if (statusText) {
    statusText.textContent = "ページを再読み込みしても直らない場合は、診断情報を確認してください。";
  }
  if (rankTableBody) {
    rankTableBody.innerHTML = `
      <tr>
        <td class="message-cell" colspan="12">
          アプリ本体を読み込めませんでした。<br>
          <small>${safeMessage}</small>
        </td>
      </tr>
    `;
  }
  document.body.classList.add("embedded-ready");
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

function cleanControlText(value, fallback = "") {
  const cleaned = String(value || "")
    .replace(/[●•]+\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function initializeEnhancedControls(scope = "legacy") {
  const appHeader = document.querySelector(".app-header");
  const settingsPanels = document.getElementById("settingsPanels");
  if (!appHeader || !settingsPanels || appHeader.dataset.enhancedControlsReady === "true") return false;
  appHeader.dataset.enhancedControlsReady = "true";

  const settingsToggle = document.getElementById("settingsVisibilityToggle");
  const scrollToTableButton = document.getElementById("scrollToTableButton");
  const areaToggle = document.getElementById("controlPanelToggle");
  const areaBody = document.getElementById("controlPanelBody");
  const monthToggle = document.getElementById("monthPanelToggle");
  const monthPanel = document.getElementById("monthPanel");
  const elementToggle = document.getElementById("elementPanelToggle");
  const elementPanel = document.getElementById("elementPanel");
  const monthSelect = document.getElementById("monthSelect");

  const updateAreaToggleLabel = () => {
    if (!areaToggle) return;
    const expanded = areaToggle.getAttribute("aria-expanded") !== "false" && !areaBody?.hidden;
    const nextLabel = expanded ? "都道府県・地域選択を閉じる" : "都道府県・地域選択を開く";
    if (areaToggle.textContent.trim() !== nextLabel) areaToggle.textContent = nextLabel;
  };

  const updateElementToggleLabel = () => {
    if (!elementToggle) return;
    const expanded = elementToggle.getAttribute("aria-expanded") === "true" && !elementPanel?.hidden;
    const nextLabel = expanded ? "要素選択を閉じる" : "要素選択を開く";
    if (elementToggle.textContent.trim() !== nextLabel) elementToggle.textContent = nextLabel;
  };

  const setMonthExpanded = (expanded, { persist = true } = {}) => {
    const normalized = Boolean(expanded);
    if (monthPanel) monthPanel.hidden = !normalized;
    if (monthToggle) {
      monthToggle.setAttribute("aria-expanded", String(normalized));
      monthToggle.textContent = normalized ? "月選択を閉じる" : "月選択を開く";
    }
    if (persist) rawStorage.set(MONTH_PANEL_COLLAPSED_KEY, String(!normalized));
  };

  const notifyParentSettingsVisibility = (visible) => {
    if (window.parent === window) return;
    window.parent.postMessage({
      source: "weather-extreme",
      type: "settings-visibility",
      visible: Boolean(visible),
      scope,
    }, "*");
  };

  const setSettingsVisible = (visible, { persist = true, notify = true } = {}) => {
    const normalized = Boolean(visible);
    settingsPanels.hidden = !normalized;
    appHeader.classList.toggle("settings-collapsed", !normalized);
    if (settingsToggle) {
      settingsToggle.setAttribute("aria-pressed", String(normalized));
      settingsToggle.textContent = normalized ? "設定を隠す" : "設定を表示";
      settingsToggle.title = normalized ? "都道府県・月・要素の設定欄を隠す" : "都道府県・月・要素の設定欄を表示";
    }
    if (persist) rawStorage.set(DASHBOARD_SETTINGS_VISIBLE_KEY, String(normalized));
    if (notify) notifyParentSettingsVisibility(normalized);
  };

  const scrollToTable = () => {
    document.querySelector(".table-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const chooseMonth = (value) => {
    if (!monthSelect) return;
    const normalized = String(value);
    if (![...monthSelect.options].some((option) => option.value === normalized)) return;
    monthSelect.value = normalized;
    monthSelect.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const moveMonth = (amount) => {
    const currentMonth = new Date().getMonth() + 1;
    const selected = Number(monthSelect?.value);
    const base = Number.isInteger(selected) && selected >= 1 && selected <= 12 ? selected : currentMonth;
    chooseMonth(((base - 1 + amount + 12) % 12) + 1);
  };

  let summaryUpdateTimer = 0;
  const updateSelectionSummary = () => {
    const areaSummary = document.getElementById("areaSelectionSummary");
    const monthSummary = document.getElementById("monthSelectionSummary");
    const elementSummary = document.getElementById("elementSelectionSummary");

    const activePref = document.querySelector("#prefButtons .pref-button.active, #prefButtons [aria-pressed='true']");
    const activeRegion = document.querySelector("#regionTabs .region-tab.active, #regionTabs [aria-pressed='true']");
    const nationSelected = scope === "nation" || document.body.classList.contains("embedded-nation");
    const areaText = nationSelected
      ? "全国"
      : cleanControlText(activePref?.textContent, cleanControlText(activeRegion?.textContent, "地域・都道府県"));

    const selectedMonth = monthSelect?.selectedOptions?.[0]?.textContent || "通年";
    const activeElement = document.querySelector("#elementPanel .element-button.active, #elementPanel [aria-pressed='true'], #elementPanel .selected");
    const tableTitle = document.getElementById("tableTitle")?.textContent?.trim();
    const elementText = cleanControlText(activeElement?.textContent, tableTitle && tableTitle !== "読み込み待ち" ? tableTitle : "要素を選択");

    if (areaSummary) areaSummary.textContent = areaText;
    if (monthSummary) monthSummary.textContent = cleanControlText(selectedMonth, "通年");
    if (elementSummary) elementSummary.textContent = elementText;
  };

  const scheduleSummaryUpdate = () => {
    window.clearTimeout(summaryUpdateTimer);
    summaryUpdateTimer = window.setTimeout(updateSelectionSummary, 40);
  };

  monthToggle?.addEventListener("click", () => {
    setMonthExpanded(monthToggle.getAttribute("aria-expanded") !== "true");
  });
  document.getElementById("previousMonthButton")?.addEventListener("click", () => moveMonth(-1));
  document.getElementById("nextMonthButton")?.addEventListener("click", () => moveMonth(1));
  document.getElementById("currentMonthButton")?.addEventListener("click", () => chooseMonth(getCurrentJstMonthNumber()));
  monthSelect?.addEventListener("change", scheduleSummaryUpdate);
  settingsToggle?.addEventListener("click", () => setSettingsVisible(settingsPanels.hidden));
  scrollToTableButton?.addEventListener("click", scrollToTable);

  document.querySelectorAll("[data-open-setting]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.openSetting;
      setSettingsVisible(true);
      if (target === "area" && areaToggle?.getAttribute("aria-expanded") === "false") areaToggle.click();
      if (target === "month") setMonthExpanded(true);
      if (target === "element" && (elementToggle?.getAttribute("aria-expanded") !== "true" || elementPanel?.hidden)) elementToggle?.click();
      const panel = target === "area"
        ? document.querySelector(".area-panel")
        : target === "month"
          ? document.querySelector(".month-panel-wrap")
          : document.querySelector(".element-panel-wrap");
      panel?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    });
  });

  if (areaToggle) {
    new MutationObserver(() => {
      updateAreaToggleLabel();
      scheduleSummaryUpdate();
    }).observe(areaToggle, { attributes: true, childList: true, subtree: true, attributeFilter: ["aria-expanded"] });
  }
  if (elementToggle) {
    new MutationObserver(() => {
      updateElementToggleLabel();
      scheduleSummaryUpdate();
    }).observe(elementToggle, { attributes: true, childList: true, subtree: true, attributeFilter: ["aria-expanded"] });
  }

  new MutationObserver(scheduleSummaryUpdate).observe(settingsPanels, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
    attributeFilter: ["class", "aria-pressed", "selected"],
  });

  const tableTitle = document.getElementById("tableTitle");
  if (tableTitle) new MutationObserver(scheduleSummaryUpdate).observe(tableTitle, { childList: true, subtree: true, characterData: true });

  setMonthExpanded(rawStorage.get(MONTH_PANEL_COLLAPSED_KEY) !== "true", { persist: false });
  setSettingsVisible(rawStorage.get(DASHBOARD_SETTINGS_VISIBLE_KEY) !== "false", { persist: false, notify: false });
  updateAreaToggleLabel();
  updateElementToggleLabel();
  updateSelectionSummary();
  initializeReferenceObservationUI();
  initializeTableUtilities();
  initializeScrollAssist();

  window.weatherExtremePaneControls = {
    setSettingsVisible: (visible) => setSettingsVisible(visible, { persist: true, notify: false }),
    getSettingsVisible: () => !settingsPanels.hidden,
    scrollToTable,
    updateSelectionSummary,
  };
  return true;
}


function getCurrentJstMonthNumber() {
  try {
    return Number(new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
    }).format(new Date()));
  } catch {
    return new Date().getMonth() + 1;
  }
}

function getJstMonthFromDateLike(value) {
  const text = String(value || "").trim();
  const direct = text.match(/(?:^|\D)(\d{4})[\/.\-年](\d{1,2})(?:[\/.\-月]|月)/u);
  if (direct) {
    const month = Number(direct[2]);
    if (month >= 1 && month <= 12) return month;
  }

  const compact = text.match(/(?:^|\D)(\d{4})(\d{2})(\d{2})(?:\D|$)/u);
  if (compact) {
    const month = Number(compact[2]);
    if (month >= 1 && month <= 12) return month;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    try {
      return Number(new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Tokyo",
        month: "numeric",
      }).format(parsed));
    } catch {
      return parsed.getMonth() + 1;
    }
  }
  return getCurrentJstMonthNumber();
}

function initializeReferenceObservationUI() {
  document.body.classList.add("reference-observation-mode");

  const legendChip = document.querySelector(".legend .live-chip");
  if (legendChip) {
    legendChip.textContent = "実況値：参考表示（順位には反映しません）";
    legendChip.classList.add("reference-only");
    legendChip.title = "実況値は右端の参考列にのみ表示し、1位〜10位の記録は変更しません。";
  }

  const metaLabel = document.querySelector(".header-meta .meta-label");
  if (metaLabel) metaLabel.textContent = "参考実況";

  const liveToggle = document.getElementById("liveColumnToggle");
  if (liveToggle) {
    liveToggle.title = "実況値を参考列として表示します。ランキング順位には反映しません。";
    const syncLabel = () => {
      const visible = liveToggle.getAttribute("aria-pressed") === "true";
      const next = visible ? "参考実況を隠す" : "参考実況を表示";
      if (liveToggle.textContent.trim() !== next) liveToggle.textContent = next;
    };
    new MutationObserver(syncLabel).observe(liveToggle, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["aria-pressed"],
    });
    syncLabel();
  }
}

function initializeTableUtilities() {
  const tableSection = document.querySelector(".table-section");
  const tableBody = document.getElementById("rankTableBody");
  const legend = tableSection?.querySelector(".legend");
  if (!tableSection || !tableBody || document.getElementById("tableUtilityBar")) return;

  const bar = document.createElement("div");
  bar.id = "tableUtilityBar";
  bar.className = "table-utility-bar";
  bar.innerHTML = `
    <label class="table-search-box">
      <span aria-hidden="true">⌕</span>
      <input type="search" inputmode="search" autocomplete="off" placeholder="地点・都道府県を絞り込み" aria-label="表の地点・都道府県を検索">
      <button type="button" class="table-search-clear" title="検索をクリア" aria-label="検索をクリア">×</button>
    </label>
    <div class="table-utility-actions">
      <button type="button" class="table-legend-toggle" aria-pressed="false">凡例を隠す</button>
      <button type="button" class="table-density-toggle" aria-pressed="false">コンパクト表示</button>
      <span class="table-filter-count" aria-live="polite"></span>
    </div>
  `;
  if (legend) tableSection.insertBefore(bar, legend);
  else tableSection.firstElementChild?.insertAdjacentElement("afterend", bar);

  const input = bar.querySelector("input[type='search']");
  const clearButton = bar.querySelector(".table-search-clear");
  const legendButton = bar.querySelector(".table-legend-toggle");
  const densityButton = bar.querySelector(".table-density-toggle");
  const count = bar.querySelector(".table-filter-count");
  const densityKey = `${APP_PREFIX}table_density`;
  const legendKey = `${APP_PREFIX}table_legend_visible`;

  const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase("ja").trim();
  const isDataRow = (row) => !row.querySelector(".message-cell");

  const applyFilter = () => {
    const query = normalize(input?.value);
    const rows = [...tableBody.querySelectorAll(":scope > tr")];
    let total = 0;
    let visible = 0;
    rows.forEach((row) => {
      if (!isDataRow(row)) {
        row.hidden = false;
        return;
      }
      total += 1;
      const matchesText = !query || normalize(row.textContent).includes(query);
      row.hidden = !matchesText;
      if (!row.hidden) visible += 1;
    });
    if (count) count.textContent = total ? `${visible} / ${total} 行` : "";
    if (clearButton) clearButton.hidden = !input?.value;
  };

  const setDensity = (compact, { persist = true } = {}) => {
    const normalized = Boolean(compact);
    document.body.classList.toggle("table-density-compact", normalized);
    densityButton?.setAttribute("aria-pressed", String(normalized));
    if (densityButton) densityButton.textContent = normalized ? "標準表示" : "コンパクト表示";
    if (persist) rawStorage.set(densityKey, normalized ? "compact" : "standard");
  };

  const setLegendVisible = (visible, { persist = true } = {}) => {
    const normalized = Boolean(visible);
    if (legend) legend.hidden = !normalized;
    legendButton?.setAttribute("aria-pressed", String(!normalized));
    if (legendButton) legendButton.textContent = normalized ? "凡例を隠す" : "凡例を表示";
    if (persist) rawStorage.set(legendKey, String(normalized));
  };

  input?.addEventListener("input", applyFilter);
  clearButton?.addEventListener("click", () => {
    if (input) input.value = "";
    input?.focus();
    applyFilter();
  });
  legendButton?.addEventListener("click", () => {
    setLegendVisible(Boolean(legend?.hidden));
  });
  densityButton?.addEventListener("click", () => {
    setDensity(!document.body.classList.contains("table-density-compact"));
  });

  new MutationObserver(applyFilter).observe(tableBody, { childList: true, subtree: true });
  setDensity(rawStorage.get(densityKey) === "compact", { persist: false });
  setLegendVisible(rawStorage.get(legendKey) !== "false", { persist: false });
  applyFilter();
}

function initializeScrollAssist() {
  if (document.getElementById("scrollTopAssist")) return;
  const button = document.createElement("button");
  button.id = "scrollTopAssist";
  button.className = "scroll-top-assist";
  button.type = "button";
  button.textContent = "↑";
  button.title = "ページ上部へ戻る";
  button.setAttribute("aria-label", "ページ上部へ戻る");
  button.hidden = true;
  document.body.append(button);

  const update = () => {
    button.hidden = window.scrollY < 520;
  };
  window.addEventListener("scroll", update, { passive: true });
  button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  update();
}

async function initializeLegacyView() {
  document.body.classList.add("legacy-view");
  document.getElementById("desktopDashboard")?.setAttribute("hidden", "");
  const legacyApp = document.getElementById("legacyApp");
  if (legacyApp) legacyApp.hidden = false;
  const loaded = await loadApplicationModule();
  if (loaded) initializeEnhancedControls("legacy");
}

async function initializeEmbeddedPane(scope) {
  document.documentElement.dataset.embedded = scope;
  document.body.classList.add("embedded-view", `embedded-${sanitizeClassName(scope)}`);
  document.getElementById("desktopDashboard")?.setAttribute("hidden", "");
  const legacyApp = document.getElementById("legacyApp");
  if (legacyApp) legacyApp.hidden = false;

  seedPaneStorage(scope);
  installPaneStorageScope(scope);

  const loaded = await loadApplicationModule();
  if (!loaded) return;
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
    initializeEnhancedControls(scope);

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

function applySettingsVisibilityToFrame(frame, visible = dashboardSettingsVisible) {
  try {
    frame?.contentWindow?.weatherExtremePaneControls?.setSettingsVisible(Boolean(visible));
  } catch {
    // 同一オリジンでない場合や、フレーム準備前はload時に再試行する。
  }
}

function updateDashboardSettingsButton() {
  const button = document.getElementById("dashboardSettingsToggle");
  if (!button) return;
  button.setAttribute("aria-pressed", String(dashboardSettingsVisible));
  button.classList.toggle("active", !dashboardSettingsVisible);
  button.textContent = dashboardSettingsVisible ? "設定を隠す" : "設定を表示";
  button.title = dashboardSettingsVisible ? "各画面の設定欄をまとめて隠す" : "各画面の設定欄をまとめて表示";
}

function setDashboardSettingsVisibility(visible, { applyFrames = true } = {}) {
  dashboardSettingsVisible = Boolean(visible);
  rawStorage.set(DASHBOARD_SETTINGS_VISIBLE_KEY, String(dashboardSettingsVisible));
  updateDashboardSettingsButton();
  if (applyFrames) {
    document.querySelectorAll("[data-dashboard-frame]").forEach((frame) => {
      applySettingsVisibilityToFrame(frame, dashboardSettingsVisible);
    });
  }
}

function getActiveDashboardFrames() {
  const activeView = document.querySelector("[data-dashboard-view]:not([hidden])");
  return activeView ? [...activeView.querySelectorAll("[data-dashboard-frame]")] : [];
}

function scrollActiveFramesToTable() {
  getActiveDashboardFrames().forEach((frame) => {
    try {
      const controls = frame.contentWindow?.weatherExtremePaneControls;
      if (controls?.scrollToTable) controls.scrollToTable();
      else frame.contentDocument?.querySelector(".table-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      // no-op
    }
  });
}

function bindDashboardUtilityControls() {
  const settingsButton = document.getElementById("dashboardSettingsToggle");
  if (settingsButton && settingsButton.dataset.bound !== "true") {
    settingsButton.dataset.bound = "true";
    settingsButton.addEventListener("click", () => setDashboardSettingsVisibility(!dashboardSettingsVisible));
  }

  const jumpButton = document.getElementById("dashboardTableJumpButton");
  if (jumpButton && jumpButton.dataset.bound !== "true") {
    jumpButton.dataset.bound = "true";
    jumpButton.addEventListener("click", scrollActiveFramesToTable);
  }

  if (window.__weatherExtremeSettingsMessageBound !== true) {
    window.__weatherExtremeSettingsMessageBound = true;
    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.source === "weather-extreme" && data.type === "settings-visibility") {
        setDashboardSettingsVisibility(Boolean(data.visible));
      }
    });
  }

  updateDashboardSettingsButton();
}

function initializeDesktopDashboard() {
  document.body.classList.add("dashboard-view-active");
  const dashboard = document.getElementById("desktopDashboard");
  const legacyApp = document.getElementById("legacyApp");
  if (legacyApp) legacyApp.hidden = true;
  if (dashboard) dashboard.hidden = false;

  bindThemeButton(document.getElementById("dashboardThemeToggle"));
  bindDashboardUtilityControls();

  const modeButtons = [...document.querySelectorAll("[data-dashboard-mode]")];
  const savedMode = rawStorage.get(DASHBOARD_MODE_KEY);
  const initialMode = ["single", "compare"].includes(savedMode) ? savedMode : "compare";
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
    description: "2つの都道府県を独立して選び、同じ条件でも別条件でも順位表を見比べます。",
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
    window.setTimeout(() => applySettingsVisibilityToFrame(frame, dashboardSettingsVisible), 120);
  });
}

function attachFrameStatusObserver(frame, name) {
  const doc = frame.contentDocument;
  const output = document.querySelector(`[data-frame-current="${name}"]`);
  if (!doc || !output) return;

  const update = () => {
    const tableTitle = doc.getElementById("tableTitle")?.textContent?.trim();
    const observedAt = doc.getElementById("observedLatestAt")?.textContent?.trim();
    const area = doc.getElementById("areaSelectionSummary")?.textContent?.trim();
    const month = doc.getElementById("monthSelectionSummary")?.textContent?.trim();
    const element = doc.getElementById("elementSelectionSummary")?.textContent?.trim();
    const selection = [area, month, element]
      .filter((value) => value && !value.includes("読み込み中") && value !== "要素を選択")
      .join(" ｜ ");

    if (selection || (tableTitle && tableTitle !== "読み込み待ち")) {
      output.textContent = selection || tableTitle;
      output.title = [tableTitle, observedAt && observedAt !== "読み込み待ち" ? observedAt : ""]
        .filter(Boolean)
        .join(" ｜ ");
    }
  };

  const observedNodes = [
    doc.getElementById("tableTitle"),
    doc.getElementById("observedLatestAt"),
    doc.getElementById("areaSelectionSummary"),
    doc.getElementById("monthSelectionSummary"),
    doc.getElementById("elementSelectionSummary"),
  ].filter(Boolean);
  observedNodes.forEach((node) => new MutationObserver(update).observe(node, { childList: true, subtree: true, characterData: true }));
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

async function startApplication() {
  await retireLegacyServiceWorker();
  initializeTheme();

  if (isEmbeddedPane) {
    await initializeEmbeddedPane(paneName);
  } else if (isDesktopDashboard) {
    initializeDesktopDashboard();
  } else {
    await initializeLegacyView();
  }
}

try {
  await startApplication();
} catch (error) {
  console.error("画面の初期化に失敗しました:", error);

  if (isDesktopDashboard) {
    document.body.classList.add("dashboard-view-active");
    const dashboard = document.getElementById("desktopDashboard");
    const legacyApp = document.getElementById("legacyApp");
    if (dashboard) dashboard.hidden = false;
    if (legacyApp) legacyApp.hidden = true;

    const stage = document.querySelector(".dashboard-stage");
    if (stage) {
      stage.innerHTML = `
        <section class="dashboard-startup-error">
          <h2>画面の初期化に失敗しました</h2>
          <p>${escapeForHtml(error?.message || String(error))}</p>
          <p>ブラウザーを再読み込みしてください。</p>
        </section>
      `;
    }
  } else {
    renderApplicationLoadError(error);
  }
}

