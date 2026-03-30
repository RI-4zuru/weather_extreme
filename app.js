* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: sans-serif;
  background: #f7f8fb;
  color: #222;
}

.topbar {
  padding: 10px 14px;
  background: #fff;
  border-bottom: 1px solid #ddd;
  position: sticky;
  top: 0;
  z-index: 10;
}

.topbar h1 {
  margin: 0 0 8px;
  font-size: 20px;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: end;
}

.controls label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

select, button {
  padding: 6px 8px;
  font-size: 13px;
}

button {
  cursor: pointer;
}

.element-panel {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.element-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 6px 8px;
  border: 1px solid #ddd;
  background: #fff;
}

.element-label {
  min-width: 40px;
  font-size: 13px;
  font-weight: 700;
}

.element-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.element-options label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
}

.note,
.status {
  margin-top: 8px;
  font-size: 12px;
  color: #555;
}

.main {
  padding: 12px;
}

.table-wrap {
  overflow-x: auto;
  background: #fff;
  border: 1px solid #ddd;
}

table {
  border-collapse: collapse;
  width: 100%;
  min-width: 980px;
}

th, td {
  border: 1px solid #ddd;
  padding: 5px 6px;
  text-align: center;
  vertical-align: middle;
}

th {
  background: #f0f3f8;
  font-size: 12px;
}

.station-col {
  min-width: 160px;
  text-align: left;
}

.station-name {
  font-weight: 700;
  font-size: 13px;
}

.station-start {
  margin-top: 3px;
  font-size: 11px;
  color: #666;
}

.rank-cell {
  min-width: 78px;
}

.rank-cell .value {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
}

.rank-cell .date {
  margin-top: 3px;
  font-size: 10px;
  line-height: 1.25;
  color: #666;
}

.live-in-rank {
  background: #ffd9d9;
}

.within-year {
  background: #fff4bf;
}

.live-in-rank.within-year {
  background: #ffdca8;
}
