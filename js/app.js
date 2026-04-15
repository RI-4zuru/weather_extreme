const elementPanel = document.getElementById("elementPanel");
const elementToggle = document.getElementById("elementPanelToggle");

const summaryBody = document.getElementById("liveSummaryBody");
const summaryToggle = document.getElementById("summaryToggle");

const rankInBadge = document.getElementById("rankInBadge");
const topRankAlert = document.getElementById("topRankAlert");

/* -------------------------
 初期状態（ここ重要）
------------------------- */
elementPanel.hidden = true;
summaryBody.hidden = true;

/* -------------------------
 開閉処理
------------------------- */

// 要素選択
elementToggle.onclick = () => {
  elementPanel.hidden = !elementPanel.hidden;
  elementToggle.textContent = elementPanel.hidden
    ? "要素選択を開く"
    : "要素選択を閉じる";
};

// サマリー
summaryToggle.onclick = () => {
  summaryBody.hidden = !summaryBody.hidden;
  summaryToggle.textContent = summaryBody.hidden ? "開く" : "閉じる";
};

/* -------------------------
 ダミー描画（動作確認用）
------------------------- */

function renderTest(){

  const hasRankIn = false;  // ←ここがバグの原因だった
  const hasTop1 = false;

  // バッジ表示制御（完全修正）
  rankInBadge.hidden = !hasRankIn;
  topRankAlert.hidden = !hasTop1;

}

renderTest();
