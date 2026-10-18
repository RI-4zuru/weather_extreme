/* weather_extreme compact UI -- additive, keeps ranking and JMA requests intact. */
(() => {
  "use strict";
  const ONCE_KEY = "weather_extreme:compact_ui_default_v1";
  const SETTINGS_KEY = "weather_extreme:dashboard_settings_visible";

  // Apply the compact default ONCE. Afterwards the user's own setting wins.
  try {
    if (!localStorage.getItem(ONCE_KEY)) {
      localStorage.setItem(SETTINGS_KEY, "false");
      localStorage.setItem(ONCE_KEY, "1");
    }
  } catch (_) {
    // Some browsers block storage; layout still works with manual toggling.
  }

  function compactDashboard() {
    const header = document.querySelector("#desktopDashboard .dashboard-header");
    const actions = document.querySelector("#desktopDashboard .dashboard-action-groups");
    const theme = document.getElementById("dashboardThemeToggle");
    if (!header || !actions || !theme || actions.parentElement === header) return;
    header.insertBefore(actions, theme);
    document.body.classList.add("compact-toolbar-ready");
    // The original handlers use IDs, so they still work after moving the buttons.
  }

  function compactTableUtilities() {
    const bar = document.getElementById("tableUtilityBar");
    const heading = document.querySelector(".table-section .table-heading-row");
    if (!bar || !heading || bar.dataset.compactMoved === "true") return false;
    bar.dataset.compactMoved = "true";

    // Remove search only. Keep the original rank-in filter, density toggle,
    // row count, and the app's own event handlers.
    bar.querySelector(".table-search-box")?.remove();
    const actions = bar.querySelector(".table-utility-actions");
    if (actions) {
      heading.appendChild(actions);
      if (!heading.querySelector(".compact-refresh-button")) {
        const refresh = document.createElement("button");
        refresh.type = "button";
        refresh.className = "compact-refresh-button";
        refresh.textContent = "↻ 更新";
        refresh.title = "この画面の観測データを再取得する";
        refresh.addEventListener("click", () => window.location.reload());
        actions.insertBefore(refresh, actions.firstElementChild);
      }
    }
    // Leave the empty node in place to protect the original initialization guard.
    bar.hidden = true;
    return true;
  }

  function collapseSettingsAfterSelection() {
    const settingsToggle = document.getElementById("settingsVisibilityToggle");
    const panels = document.getElementById("settingsPanels");
    if (settingsToggle && panels && !panels.hidden) settingsToggle.click();
  }

  function bindCompactSelection() {
    if (document.body.dataset.compactSelectionBound === "true") return;
    document.body.dataset.compactSelectionBound = "true";
    // Picking a region tab should NOT close the menu -- the user may need
    // to choose a prefecture afterwards. Close only after the final selection.
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("#prefButtons .pref-button, #elementPanel .element-button")) {
        window.setTimeout(collapseSettingsAfterSelection, 0);
      }
    });
    document.getElementById("monthSelect")?.addEventListener("change", () => {
      window.setTimeout(collapseSettingsAfterSelection, 0);
    });
  }

  function init() {
    compactDashboard();
    bindCompactSelection();
    // Top-level desktop only displays iframes; the table bar lives within each pane.
    const topDesktop = !new URLSearchParams(location.search).has("pane")
      && window.matchMedia("(min-width: 1181px)").matches;
    if (topDesktop) return;
    if (compactTableUtilities()) return;
    // Original bootstrap injects table controls asynchronously after loading app.js.
    const observer = new MutationObserver(() => {
      if (compactTableUtilities()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Avoid indefinite observation when the app failed to initialize.
    window.setTimeout(() => observer.disconnect(), 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
