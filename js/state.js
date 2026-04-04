export const state = {
  refreshTimer: null,
  manifestCache: null,
  prefecturesData: [],
  debugState: {
    selectedRegion: "",
    selectedPref: "",
    selectedPrefName: "",
    selectedMonth: "",
    selectedElement: "",
    selectedElementLabel: "",
    manifest: {
      path: "./data/manifest.json",
      ok: false,
      observationTime: "",
      generatedAt: "",
      error: ""
    },
    liveSummary: {
      path: "",
      ok: false,
      itemCount: 0,
      observationTime: "",
      generatedAt: "",
      status: "",
      message: "",
      error: ""
    },
    table: {
      path: "",
      ok: false,
      rowCount: 0,
      observationTime: "",
      generatedAt: "",
      status: "",
      message: "",
      error: ""
    }
  }
};
