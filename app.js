.live-summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.live-summary-column {
  min-width: 0;
}

.live-summary-column-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
}

.live-summary-scroll {
  max-height: 260px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 4px;
}

.live-summary-item {
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #ddd;
}

.live-summary-item-top1 {
  background: #ffe4e1;
  border-color: #d9534f;
  box-shadow: inset 0 0 0 1px #d9534f;
}

.live-summary-item-rankin {
  background: #fff7f7;
  border-color: #f0c2c2;
}

.live-summary-main {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  font-size: 12px;
  font-weight: 700;
}

.live-summary-sub {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  font-size: 11px;
  color: #555;
}
