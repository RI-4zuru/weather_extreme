import json
import os
import re
import sys
import time
import html as html_lib
import urllib.request
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))

DEBUG_SUCCESS_LOG = False
FETCH_CACHE = {}

ELEMENTS = {
    "dailyPrecip": {
        "labels": ["日降水量"],
        "direction": "desc",
        "category": "precip",
        "live_mode": "precip_day_sum",
    },
    "max10mPrecip": {
        "labels": ["日最大10分間降水量"],
        "direction": "desc",
        "category": "precip",
        "live_mode": "precip_10m_max",
    },
    "max1hPrecip": {
        "labels": ["日最大1時間降水量"],
        "direction": "desc",
        "category": "precip",
        "live_mode": "precip_1h_max",
    },
    "max24hPrecip": {
        "labels": ["月最大24時間降水量"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthMax1h10mPrecip": {
        "labels": ["日最大1時間降水量(10分間隔)の多い方から", "日最大1時間降水量（10分間隔）の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthMax3hPrecip": {
        "labels": ["月最大3時間降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthMax6hPrecip": {
        "labels": ["月最大6時間降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthMax12hPrecip": {
        "labels": ["月最大12時間降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthMax24hPrecip": {
        "labels": ["月最大24時間降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthMax48hPrecip": {
        "labels": ["月最大48時間降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthMax72hPrecip": {
        "labels": ["月最大72時間降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthPrecipHigh": {
        "labels": ["月降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthPrecipLow": {
        "labels": ["月降水量の少ない方から"],
        "direction": "asc",
        "category": "precip",
        "live_mode": None,
    },
    "yearPrecipHigh": {
        "labels": ["年降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "yearPrecipLow": {
        "labels": ["年降水量の少ない方から"],
        "direction": "asc",
        "category": "precip",
        "live_mode": None,
    },
    "dailyMaxTempHigh": {
        "labels": ["日最高気温の高い方から"],
        "direction": "desc",
        "category": "temp",
        "live_mode": "temp_max_day",
    },
    "dailyMaxTempLow": {
        "labels": ["日最高気温の低い方から"],
        "direction": "asc",
        "category": "temp",
        "live_mode": "temp_max_day",
    },
    "dailyMinTempHigh": {
        "labels": ["日最低気温の高い方から"],
        "direction": "desc",
        "category": "temp",
        "live_mode": "temp_min_day",
    },
    "dailyMinTempLow": {
        "labels": ["日最低気温の低い方から"],
        "direction": "asc",
        "category": "temp",
        "live_mode": "temp_min_day",
    },
    "monthAvgTempHigh": {
        "labels": ["月平均気温の高い方から"],
        "direction": "desc",
        "category": "temp",
        "live_mode": None,
    },
    "monthAvgTempLow": {
        "labels": ["月平均気温の低い方から"],
        "direction": "asc",
        "category": "temp",
        "live_mode": None,
    },
    "yearAvgTempHigh": {
        "labels": ["年平均気温の高い方から"],
        "direction": "desc",
        "category": "temp",
        "live_mode": None,
    },
    "yearAvgTempLow": {
        "labels": ["年平均気温の低い方から"],
        "direction": "asc",
        "category": "temp",
        "live_mode": None,
    },
    "annualDaysMeanTempBelow0": {
        "labels": ["日平均気温0℃未満寒候年間日数"],
        "direction": "desc",
        "category": "temp",
        "live_mode": None,
    },
    "annualDaysMeanTempAtOrAbove25": {
        "labels": ["日平均気温25℃以上年間日数"],
        "direction": "desc",
        "category": "temp",
        "live_mode": None,
    },
    "annualDaysMinTempAtOrAbove25": {
        "labels": ["日最低気温25℃以上年間日数"],
        "direction": "desc",
        "category": "temp",
        "live_mode": None,
    },
    "annualDaysMaxTempAtOrAbove25": {
        "labels": ["日最高気温25℃以上年間日数"],
        "direction": "desc",
        "category": "temp",
        "live_mode": None,
    },
    "annualDaysMaxTempAtOrAbove30": {
        "labels": ["日最高気温30℃以上年間日数"],
        "direction": "desc",
        "category": "temp",
        "live_mode": None,
    },
    "annualDaysMaxTempAtOrAbove35": {
        "labels": ["日最高気温35℃以上年間日数"],
        "direction": "desc",
        "category": "temp",
        "live_mode": None,
    },
    "annualDaysMinTempBelow0": {
        "labels": ["日最低気温0℃未満寒候年間日数"],
        "direction": "desc",
        "category": "temp",
        "live_mode": None,
    },
    "annualDaysMaxTempBelow0": {
        "labels": ["日最高気温0℃未満寒候年間日数"],
        "direction": "desc",
        "category": "temp",
        "live_mode": None,
    },
    "dailyMinSeaLevelPressure": {
        "labels": ["日最低海面気圧"],
        "direction": "asc",
        "category": "pressure",
        "live_mode": None,
    },
    "dailyMinHumidity": {
        "labels": ["日最小相対湿度"],
        "direction": "asc",
        "category": "humidity",
        "live_mode": None,
    },
    "dailyMaxWind": {
        "labels": ["日最大風速"],
        "direction": "desc",
        "category": "wind",
        "live_mode": None,
    },
    "dailyMaxGust": {
        "labels": ["日最大瞬間風速"],
        "direction": "desc",
        "category": "wind",
        "live_mode": None,
    },
    "monthSunshineHigh": {
        "labels": ["月間日照時間の多い方から"],
        "direction": "desc",
        "category": "sunshine",
        "live_mode": None,
    },
    "monthSunshineLow": {
        "labels": ["月間日照時間の少ない方から"],
        "direction": "asc",
        "category": "sunshine",
        "live_mode": None,
    },
    "yearSunshineHigh": {
        "labels": ["年間日照時間の多い方から"],
        "direction": "desc",
        "category": "sunshine",
        "live_mode": None,
    },
    "yearSunshineLow": {
        "labels": ["年間日照時間の少ない方から"],
        "direction": "asc",
        "category": "sunshine",
        "live_mode": None,
    },
    "dailySnowDepth": {
        "labels": ["降雪の深さ日合計","積雪差日合計"],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthSnowDepth": {
        "labels": ["降雪の深さ月合計","積雪差月合計"],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "yearCumulativeSnowDepth": {
        "labels": ["降雪の深さ寒候年合計","積雪差寒候年合計"],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthMax3hSnow": {
        "labels": ["月最大3時間降雪量の多い方から"],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthMax6hSnow": {
        "labels": ["月最大6時間降雪量の多い方から"],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthMax12hSnow": {
        "labels": ["月最大12時間降雪量の多い方から"],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthMax24hSnow": {
        "labels": ["月最大24時間降雪量の多い方から"],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthMax48hSnow": {
        "labels": ["月最大48時間降雪量の多い方から"],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthMax72hSnow": {
        "labels": ["月最大72時間降雪量"],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthDeepSnowHigh": {
        "labels": ["月最深積雪の大きい方から"],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthDeepSnowLow": {
        "labels": ["月最深積雪の小さい方から"],
        "direction": "asc",
        "category": "snow",
        "live_mode": None,
    },
}

MONTHS = ["all"] + [str(i) for i in range(1, 13)]


def fetch_text(url: str, retries: int = 3, wait_sec: float = 1.5) -> str:
    if url in FETCH_CACHE:
        return FETCH_CACHE[url]

    last_error = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Accept-Language": "ja,en;q=0.8",
                },
            )
            with urllib.request.urlopen(req, timeout=60) as res:
                raw = res.read()
            text = raw.decode("utf-8", errors="ignore")
            FETCH_CACHE[url] = text
            return text
        except Exception as e:
            last_error = e
            if attempt < retries - 1:
                time.sleep(wait_sec)
    raise last_error


def fetch_json(url: str):
    return json.loads(fetch_text(url))


def read_json_file(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def write_json(path: str, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def trim_number(v):
    v = float(v)
    if v.is_integer():
        return int(v)
    return round(v, 1)


def normalize_ymd(s: str) -> str:
    m = re.match(r"(\d{4})/(\d{1,2})/(\d{1,2})$", s)
    if not m:
        return s
    y, mo, d = m.groups()
    return f"{y}/{int(mo):02d}/{int(d):02d}"


def parse_date_ymd(s: str) -> datetime:
    return datetime.strptime(s, "%Y/%m/%d").replace(tzinfo=JST)


def era_name(year: int, month: int, day: int):
    dt = datetime(year, month, day)
    if dt >= datetime(2019, 5, 1):
        return ("令和", year - 2018)
    if dt >= datetime(1989, 1, 8):
        return ("平成", year - 1988)
    if dt >= datetime(1926, 12, 25):
        return ("昭和", year - 1925)
    if dt >= datetime(1912, 7, 30):
        return ("大正", year - 1911)
    return ("明治", year - 1867)


def wareki_year_only(s: str) -> str:
    m = re.match(r"(\d{4})/(\d{1,2})/(\d{1,2})$", s)
    if not m:
        return ""
    y, mo, d = map(int, m.groups())
    era, era_year = era_name(y, mo, d)
    era_year_str = "元" if era_year == 1 else str(era_year)
    return f"{era}{era_year_str}年"


def wareki_year_only_from_ym(s: str) -> str:
    m = re.match(r"(\d{4})/(\d{1,2})$", s)
    if not m:
        return ""
    y, mo = map(int, m.groups())
    era, era_year = era_name(y, mo, 1)
    era_year_str = "元" if era_year == 1 else str(era_year)
    return f"{era}{era_year_str}年"


def format_dual_ymd(s: str) -> str:
    m = re.match(r"(\d{4})/(\d{1,2})/(\d{1,2})$", s)
    if not m:
        return s
    y, mo, d = map(int, m.groups())
    return f"{y}年{mo}月{d}日（{wareki_year_only(s)}）"


def format_dual_ym(s: str) -> str:
    m = re.match(r"(\d{4})/(\d{1,2})$", s)
    if not m:
        return s
    y, mo = map(int, m.groups())
    return f"{y}年{mo}月（{wareki_year_only_from_ym(s)}）"


def format_year_label(s: str) -> str:
    m = re.match(r"^(\d{4})$", s)
    if not m:
        return s
    return f"{m.group(1)}年"


def format_start_date_label(raw: str) -> str:
    if not raw:
        return ""

    raw = str(raw).strip()

    if re.match(r"^\d{4}/\d{1,2}/\d{1,2}$", raw):
        return format_dual_ymd(normalize_ymd(raw))

    if re.match(r"^\d{4}/\d{1,2}$", raw):
        y, m = raw.split("/")
        return format_dual_ym(f"{int(y):04d}/{int(m):02d}")

    if re.match(r"^\d{4}$", raw):
        return format_year_label(raw)

    if re.match(r"^\d{4}年$", raw):
        return raw

    if re.match(r"^\d{4}寒候年$", raw):
        return raw

    if re.match(r"^\d{4}/\d{1,2}寒候年$", raw):
        m = re.match(r"^(\d{4})/\d{1,2}寒候年$", raw)
        return f"{m.group(1)}寒候年" if m else raw

    return raw


def extract_start_date_from_cells(cells):
    for cell in reversed(cells):
        text = html_lib.unescape(str(cell)).strip()

        m_full = re.search(r"(\d{4}/\d{1,2}/\d{1,2})", text)
        if m_full:
            return normalize_ymd(m_full.group(1))

        m_ym = re.search(r"(\d{4}/\d{1,2})(?!/\d)", text)
        if m_ym:
            y, mo = m_ym.group(1).split("/")
            return f"{int(y):04d}/{int(mo):02d}"

        m_koukan = re.search(r"(\d{4}寒候年)", text)
        if m_koukan:
            return m_koukan.group(1)

        m_year = re.search(r"(?<!\d)(\d{4})年(?!\d)", text)
        if m_year:
            return f"{m_year.group(1)}年"

        m_plain_year = re.fullmatch(r"\s*(\d{4})\s*", text)
        if m_plain_year:
            return m_plain_year.group(1)

    return ""


def build_rank_url(prec_no: str, rank_type: str, block_no: str, month: str, view: str) -> str:
    month_value = "" if month == "all" else month
    rank_page = "rank_s.php" if rank_type == "s" else "rank_a.php"
    return (
        f"https://www.data.jma.go.jp/stats/etrn/view/{rank_page}"
        f"?prec_no={prec_no}"
        f"&block_no={block_no}"
        f"&year=&month={month_value}&day=&view={view}"
    )


def strip_tags(text: str) -> str:
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?is)<.*?>", "", text)
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def get_row_blocks(html: str):
    return re.findall(r"(?is)<tr[^>]*>.*?</tr>", html)


def get_cells_from_row(row_html: str):
    cells = re.findall(r"(?is)<t[dh][^>]*>(.*?)</t[dh]>", row_html)
    return [strip_tags(c) for c in cells]


def normalize_label_text(s: str) -> str:
    s = html_lib.unescape(s)
    s = s.replace(" ", "").replace("　", "")
    s = s.replace(">", "").replace("]", "").replace("(", "").replace(")", "")
    s = s.replace("（", "").replace("）", "")
    s = s.replace("ヶ", "ケ")
    return s.strip()


def find_target_row(html, labels):
    rows = get_row_blocks(html)
    normalized_labels = [normalize_label_text(label) for label in labels if label]

    partial_match = None

    for row_html in rows:
        cells = get_cells_from_row(row_html)
        if not cells:
            continue

        first = normalize_label_text(cells[0])

        for label in normalized_labels:
            if first == label:
                return cells

        for label in normalized_labels:
            if label in first:
                partial_match = partial_match or cells

    return partial_match


def extract_value_and_date(cell: str):
    cell = html_lib.unescape(cell)
    cell = cell.replace("]", " ").replace(">", " ").strip()

    full_date_match = re.search(r"(\d{4}/\d{1,2}/\d{1,2})", cell)
    ym_match = re.search(r"(\d{4}/\d{1,2})(?!/\d)", cell)
    paren_year_match = re.search(r"[（(]\s*(\d{4})\s*[)）]", cell)
    year_kanji_match = re.search(r"(?<!\d)(\d{4})年(?!\d)", cell)

    raw_date = None
    date_label = None
    cell_without_date = cell

    if full_date_match:
        raw_date = normalize_ymd(full_date_match.group(1))
        date_label = format_dual_ymd(raw_date)
        cell_without_date = cell.replace(full_date_match.group(1), " ")
    elif ym_match:
        y, m = ym_match.group(1).split("/")
        raw_date = f"{int(y):04d}/{int(m):02d}/01"
        date_label = format_dual_ym(f"{int(y):04d}/{int(m):02d}")
        cell_without_date = cell.replace(ym_match.group(1), " ")
    elif paren_year_match:
        y = paren_year_match.group(1)
        raw_date = f"{y}/01/01"
        date_label = f"{y}年"
        cell_without_date = re.sub(rf"[（(]\s*{re.escape(y)}\s*[)）]", " ", cell, count=1)
    elif year_kanji_match:
        y = year_kanji_match.group(1)
        raw_date = f"{y}/01/01"
        date_label = f"{y}年"
        cell_without_date = re.sub(rf"(?<!\d){re.escape(y)}年(?!\d)", " ", cell, count=1)

    if raw_date is None or date_label is None:
        return None

    cleaned = cell_without_date
    cleaned = re.sub(r"\b(cm|mm|h)\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[年月日時分]", " ", cleaned)
    cleaned = re.sub(r"[（()）]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    if cleaned in {"", "-", "--", "―", "－", "欠測", "なし"}:
        return {
            "value": 0,
            "date": date_label,
            "_date_raw": raw_date,
        }

    value_candidates = re.findall(r"-?\d+(?:\.\d+)?", cleaned)
    if not value_candidates:
        return {
            "value": 0,
            "date": date_label,
            "_date_raw": raw_date,
        }

    value = trim_number(value_candidates[0])

    return {
        "value": value,
        "date": date_label,
        "_date_raw": raw_date,
    }


def parse_snow_records_from_html_text(html: str, labels, direction: str):
    text = strip_tags(html)
    text = text.replace(">", " ").replace("]", " ")
    text = re.sub(r"\s+", "\n", text)

    lines = [line.strip() for line in text.split("\n") if line.strip()]
    normalized_labels = [normalize_label_text(label) for label in labels]

    start_idx = -1
    for i, line in enumerate(lines):
        nline = normalize_label_text(line)
        if any(label and label in nline for label in normalized_labels):
            start_idx = i
            break

    if start_idx < 0:
        return None

    records = []
    start_date = ""

    candidate_lines = lines[start_idx + 1:start_idx + 60]

    for line in candidate_lines:
        ym = re.fullmatch(r"(\d{4})/\s*(\d{1,2})", line)
        if ym:
            y, m = ym.groups()
            start_date = f"{int(y):04d}/{int(m):02d}"
            continue

        year_only = re.fullmatch(r"(\d{4})", line)
        if year_only and not start_date:
            start_date = year_only.group(1)
            continue

        koukan_year = re.fullmatch(r"(\d{4})寒候年", line)
        if koukan_year and not start_date:
            start_date = koukan_year.group(1) + "寒候年"
            continue

        m = re.search(r"\((\d{4}/\d{1,2}/\d{1,2})\)\s*(-?\d+(?:\.\d+)?)", line)
        if m:
            raw_date = normalize_ymd(m.group(1))
            value = trim_number(m.group(2))
            records.append({
                "value": value,
                "date": format_dual_ymd(raw_date),
                "_date_raw": raw_date,
            })
            continue

        m2 = re.search(r"\((\d{4}/\d{1,2})\)\s*(-?\d+(?:\.\d+)?)", line)
        if m2:
            y, mo = m2.group(1).split("/")
            raw_date = f"{int(y):04d}/{int(mo):02d}/01"
            value = trim_number(m2.group(2))
            records.append({
                "value": value,
                "date": format_dual_ym(f"{int(y):04d}/{int(mo):02d}"),
                "_date_raw": raw_date,
            })
            continue

        m3 = re.search(r"\((\d{4})\)\s*(-?\d+(?:\.\d+)?)", line)
        if m3:
            raw_date = f"{m3.group(1)}/01/01"
            value = trim_number(m3.group(2))
            records.append({
                "value": value,
                "date": f"{m3.group(1)}年",
                "_date_raw": raw_date,
            })
            continue

        if re.match(r"^\((cm|mm)\)\s*-?\d+(?:\.\d+)?$", line, flags=re.IGNORECASE):
            continue

        nline = normalize_label_text(line)
        if "順位" in nline or "要素名" in nline:
            continue
        if "の多い方から" in line or "の少ない方から" in line:
            if normalize_label_text(line) not in normalized_labels:
                break

    if not records:
        return None

    if direction == "desc":
        records.sort(
            key=lambda r: (float(r["value"]), parse_date_ymd(r["_date_raw"])),
            reverse=True,
        )
    else:
        records.sort(
            key=lambda r: (float(r["value"]), -parse_date_ymd(r["_date_raw"]).timestamp())
        )

    records = records[:10]
    for i, rec in enumerate(records, start=1):
        rec["rank"] = i

    return {
        "startDate": format_start_date_label(start_date) if start_date else "",
        "records": records,
    }


def parse_rank_cells(cells, direction: str):
    if len(cells) < 3:
        return None

    rank_cells = cells[1:11]
    start_date = extract_start_date_from_cells(cells)

    records = []
    for idx, cell in enumerate(rank_cells, start=1):
        extracted = extract_value_and_date(cell)
        if not extracted:
            continue

        records.append({
            "rank": idx,
            "value": extracted["value"],
            "date": extracted["date"],
            "_date_raw": extracted["_date_raw"],
        })

    if not records:
        return None

    if direction == "desc":
        records.sort(
            key=lambda r: (float(r["value"]), parse_date_ymd(r["_date_raw"])),
            reverse=True,
        )
    else:
        records.sort(
            key=lambda r: (float(r["value"]), -parse_date_ymd(r["_date_raw"]).timestamp())
        )

    for i, rec in enumerate(records[:10], start=1):
        rec["rank"] = i

    return {
        "startDate": format_start_date_label(start_date) if start_date else "",
        "records": records[:10],
    }


def fetch_latest_time() -> str:
    return fetch_text("https://www.jma.go.jp/bosai/amedas/data/latest_time.txt").strip()


def point_chunk_key(dt: datetime) -> str:
    base_hour = (dt.hour // 3) * 3
    return dt.strftime("%Y%m%d") + f"_{base_hour:02d}"


def fetch_point_chunk(amedas_code: str, chunk_key: str):
    url = f"https://www.jma.go.jp/bosai/amedas/data/point/{amedas_code}/{chunk_key}.json"
    return fetch_json(url)


def get_today_chunk_keys(latest_dt: datetime):
    out = []
    cur = latest_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    end = latest_dt.replace(hour=(latest_dt.hour // 3) * 3, minute=0, second=0, microsecond=0)
    while cur <= end:
        out.append(point_chunk_key(cur))
        cur += timedelta(hours=3)
    return out


def extract_today_series(point_json: dict, latest_dt: datetime, field_names):
    if isinstance(field_names, str):
        field_names = [field_names]

    out = []
    today = latest_dt.strftime("%Y%m%d")

    for ts, item in point_json.items():
        if not str(ts).startswith(today):
            continue

        for field_name in field_names:
            val = item.get(field_name)
            if isinstance(val, list) and len(val) >= 1 and val[0] is not None:
                try:
                    obs_dt = datetime.strptime(str(ts), "%Y%m%d%H%M%S").replace(tzinfo=JST)
                    out.append((obs_dt, float(val[0])))
                    break
                except Exception:
                    pass

    out.sort(key=lambda x: x[0])
    return out


def fetch_today_all_series(amedas_code: str, latest_dt: datetime, field_names):
    all_values = []
    seen = set()

    for ck in get_today_chunk_keys(latest_dt):
        try:
            point_json = fetch_point_chunk(amedas_code, ck)
            series = extract_today_series(point_json, latest_dt, field_names)
            for obs_dt, val in series:
                key = obs_dt.strftime("%Y%m%d%H%M%S")
                if key not in seen:
                    seen.add(key)
                    all_values.append((obs_dt, val))
        except Exception:
            pass

    all_values.sort(key=lambda x: x[0])
    return all_values


def should_show_live(month: str, latest_dt: datetime) -> bool:
    return month == "all" or month == str(latest_dt.month)


def fetch_today_live_extreme(amedas_code: str, latest_dt: datetime, mode: str, month: str):
    if not mode:
        return None
    if not should_show_live(month, latest_dt):
        return None

    if mode == "temp_max_day":
        series = fetch_today_all_series(amedas_code, latest_dt, "temp")
        if not series:
            return None
        best = max(series, key=lambda x: (x[1], x[0]))

    elif mode == "temp_min_day":
        series = fetch_today_all_series(amedas_code, latest_dt, "temp")
        if not series:
            return None
        best = min(series, key=lambda x: (x[1], -x[0].timestamp()))

    elif mode == "precip_day_sum":
        series = fetch_today_all_series(amedas_code, latest_dt, ["precipitation10m", "precipitation"])
        if not series:
            return None
        total = sum(v for _, v in series)
        best = (latest_dt, total)

    elif mode == "precip_10m_max":
        series = fetch_today_all_series(amedas_code, latest_dt, ["precipitation10m", "precipitation"])
        if not series:
            return None
        best = max(series, key=lambda x: (x[1], x[0]))

    elif mode == "precip_1h_max":
        series = fetch_today_all_series(amedas_code, latest_dt, ["precipitation10m", "precipitation"])
        if not series:
            return None
        best_val = None
        best_dt = None
        for i in range(len(series)):
            window = series[max(0, i - 5):i + 1]
            s = sum(v for _, v in window)
            dt = series[i][0]
            if best_val is None or s > best_val or (s == best_val and dt > best_dt):
                best_val = s
                best_dt = dt
        best = (best_dt, best_val)

    else:
        return None

    raw_date = best[0].strftime("%Y/%m/%d")
    return {
        "value": trim_number(best[1]),
        "date": format_dual_ymd(raw_date),
        "_date_raw": raw_date,
    }


def get_recent_highlight_start(now_dt: datetime):
    """
    「1年以内ハイライト」の開始日を返す。

    仕様:
    - 2026-04-11 -> 2025-05-01 以降をハイライト
    - 2026-05-01 -> 2025-06-01 以降をハイライト
    - 2026-12-10 -> 2026-01-01 以降をハイライト
    """
    current_year = now_dt.year
    current_month = now_dt.month

    if current_month == 12:
        start_year = current_year
        start_month = 1
    else:
        start_year = current_year - 1
        start_month = current_month + 1

    return datetime(start_year, start_month, 1, tzinfo=JST)


def within_one_year(raw_date_str: str, now_dt: datetime) -> bool:
    try:
        d = parse_date_ymd(raw_date_str)
    except Exception:
        return False

    start_dt = get_recent_highlight_start(now_dt)

    if d.tzinfo is None:
        d = d.replace(tzinfo=JST)
    else:
        d = d.astimezone(JST)

    return d >= start_dt


def merge_live(records, live_info, direction, latest_dt: datetime):
    merged = []

    for r in records:
        merged.append({
            "value": float(r["value"]),
            "date": r["date"],
            "_date_raw": r["_date_raw"],
            "isLive": False,
        })

    if live_info is not None:
        merged.append({
            "value": float(live_info["value"]),
            "date": live_info["date"],
            "_date_raw": live_info["_date_raw"],
            "isLive": True,
        })

    if direction == "desc":
        merged.sort(
            key=lambda x: (float(x["value"]), parse_date_ymd(x["_date_raw"])),
            reverse=True
        )
    else:
        merged.sort(
            key=lambda x: (float(x["value"]), -parse_date_ymd(x["_date_raw"]).timestamp())
        )

    merged = merged[:10]

    out = []
    live_summary_item = None

    for i, r in enumerate(merged, start=1):
        item = {
            "rank": i,
            "value": trim_number(r["value"]),
            "date": r["date"],
            "highlightLive": bool(r["isLive"]),
            "highlightWithinYear": within_one_year(r["_date_raw"], latest_dt),
        }
        out.append(item)

        if r["isLive"]:
            live_summary_item = {
                "rank": i,
                "value": trim_number(r["value"]),
                "date": r["date"],
            }

    return out, live_summary_item


def merge_live(records, live_info, direction, latest_dt: datetime):
    merged = []
    for r in records:
        merged.append({
            "value": float(r["value"]),
            "date": r["date"],
            "_date_raw": r["_date_raw"],
            "isLive": False,
        })

    if live_info is not None:
        merged.append({
            "value": float(live_info["value"]),
            "date": live_info["date"],
            "_date_raw": live_info["_date_raw"],
            "isLive": True,
        })

    if direction == "desc":
        merged.sort(
            key=lambda x: (float(x["value"]), parse_date_ymd(x["_date_raw"])),
            reverse=True
        )
    else:
        merged.sort(
            key=lambda x: (float(x["value"]), -parse_date_ymd(x["_date_raw"]).timestamp())
        )

    merged = merged[:10]

    out = []
    live_summary_item = None

    for i, r in enumerate(merged, start=1):
        item = {
            "rank": i,
            "value": trim_number(r["value"]),
            "date": r["date"],
            "highlightLive": bool(r["isLive"]),
            "highlightWithinYear": within_one_year(r["_date_raw"], latest_dt),
        }
        out.append(item)

        if r["isLive"]:
            live_summary_item = {
                "rank": i,
                "value": trim_number(r["value"]),
                "date": r["date"],
            }

    return out, live_summary_item


def try_fetch_station_rows(station, element_def, month):
    last_error = None
    candidates = list(station["rank_candidates"])

    if element_def["category"] == "precip":
        order = {"": 0, "h0": 1, "np0": 2, "a2": 3, "ns0": 4}
        candidates.sort(key=lambda c: order.get(c.get("view", ""), 9))
    elif element_def["category"] == "snow":
        order = {"ns0": 0, "a2": 1, "np0": 2, "h0": 3, "": 4}
        candidates.sort(key=lambda c: order.get(c.get("view", ""), 9))

    tried_messages = []

    for candidate in candidates:
        view = candidate.get("view", "")
        rank_type = candidate.get("rank_type", "")
        block_no = candidate.get("blockNo", "")

        try:
            url = build_rank_url(
                station["precNo"],
                rank_type,
                block_no,
                month,
                view,
            )

            html = fetch_text(url)
            cells = find_target_row(html, element_def["labels"])

            if cells:
                parsed = parse_rank_cells(cells, element_def["direction"])
                if parsed:
                    if DEBUG_SUCCESS_LOG:
                        print(
                            f"[rank ok] station={station['stationName']} "
                            f"category={element_def['category']} "
                            f"label={element_def['labels'][0]} month={month} "
                            f"view={view or '(blank)'} count={len(parsed['records'])} url={url}",
                            file=sys.stderr
                        )
                    return parsed
                else:
                    tried_messages.append(
                        f"[rank cells found but parse empty] "
                        f"station={station['stationName']} "
                        f"category={element_def['category']} "
                        f"label={element_def['labels'][0]} month={month} "
                        f"view={view or '(blank)'} url={url}"
                    )
            else:
                tried_messages.append(
                    f"[rank row not found] "
                    f"station={station['stationName']} "
                    f"category={element_def['category']} "
                    f"label={element_def['labels'][0]} month={month} "
                    f"view={view or '(blank)'} url={url}"
                )

            if element_def["category"] == "snow":
                parsed_fallback = parse_snow_records_from_html_text(
                    html,
                    element_def["labels"],
                    element_def["direction"]
                )
                if parsed_fallback:
                    if DEBUG_SUCCESS_LOG:
                        print(
                            f"[snow fallback ok] station={station['stationName']} "
                            f"label={element_def['labels'][0]} month={month} "
                            f"view={view or '(blank)'} count={len(parsed_fallback['records'])} url={url}",
                            file=sys.stderr
                        )
                    return parsed_fallback
                else:
                    tried_messages.append(
                        f"[snow fallback failed] "
                        f"station={station['stationName']} "
                        f"label={element_def['labels'][0]} month={month} "
                        f"view={view or '(blank)'} url={url}"
                    )

        except Exception as e:
            last_error = e
            tried_messages.append(
                f"[rank fetch error] "
                f"station={station['stationName']} "
                f"category={element_def['category']} "
                f"label={element_def['labels'][0]} month={month} "
                f"view={view or '(blank)'} blockNo={block_no} "
                f"rankType={rank_type} error={repr(e)}"
            )

    # for msg in tried_messages:
    #     print(msg, file=sys.stderr)

    if last_error:
        raise last_error

    return None


def load_prefecture_configs():
    pref_config = read_json_file("config/prefectures.json")
    prefectures = pref_config.get("prefectures", [])
    loaded = []

    for pref in prefectures:
        stations_file = pref.get("stationsFile")
        if not stations_file:
            continue

        station_data = read_json_file(stations_file)
        loaded.append({
            "key": pref["key"],
            "name": pref["name"],
            "stations": station_data.get("stations", [])
        })

    return loaded


def dedupe_live_summary(items):
    best = {}

    for item in items:
        key = (item["stationName"], item["elementKey"])
        old = best.get(key)

        if old is None:
            best[key] = item
            continue

        if item["rank"] < old["rank"]:
            best[key] = item
        elif item["rank"] == old["rank"]:
            if item["monthSort"] < old["monthSort"]:
                best[key] = item

    result = list(best.values())
    result.sort(key=lambda x: (x["rank"], x["stationName"], x["elementLabel"], x["monthSort"]))

    for item in result:
        item.pop("monthSort", None)

    return result


def month_label(month: str) -> str:
    return "通年" if month == "all" else f"{month}月"


def month_sort_key(month: str) -> int:
    return 0 if month == "all" else int(month)


def build_dir_manifest(root_dir: str, updated_at: str, prefectures):
    manifest = {
        "updatedAt": updated_at,
        "prefectures": {},
    }

    for pref in prefectures:
        pref_key = pref["key"]
        pref_dir = os.path.join(root_dir, pref_key)
        if os.path.isdir(pref_dir):
            manifest["prefectures"][pref_key] = sorted(os.listdir(pref_dir))
        else:
            manifest["prefectures"][pref_key] = []

    return manifest
