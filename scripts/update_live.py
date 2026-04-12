import os
import re
from datetime import datetime

from weather_common import (
    ELEMENTS,
    MONTHS,
    JST,
    build_dir_manifest,
    ensure_dir,
    fetch_latest_time,
    fetch_point_chunk,
    get_today_chunk_keys,
    load_prefecture_configs,
    parse_date_ymd,
    read_json_file,
    trim_number,
    within_one_year,
    write_json,
)

BASE_DIR = "data_base"
PUBLIC_DIR = "data"
LIVE_DEBUG_DIR = os.path.join(PUBLIC_DIR, "live")

TARGET_PREF_KEYS = {
    "shiga",
    "kyoto",
    "osaka",
    "hyogo",
    "nara",
    "wakayama",
}

LIVE_TARGETS = {
    "dailyMaxTempHigh": {
        "mode": "temp_max",
        "direction": "desc",
        "skip_zero": False,
    },
    "dailyMaxTempLow": {
        "mode": "temp_max",
        "direction": "asc",
        "skip_zero": False,
    },
    "dailyMinTempHigh": {
        "mode": "temp_min",
        "direction": "desc",
        "skip_zero": False,
    },
    "dailyMinTempLow": {
        "mode": "temp_min",
        "direction": "asc",
        "skip_zero": False,
    },
    "max10mPrecip": {
        "mode": "precip10m_max",
        "direction": "desc",
        "skip_zero": True,
    },
    "monthMax1h10mPrecip": {
        "mode": "precip1h_max",
        "direction": "desc",
        "skip_zero": True,
    },
    "monthMax3hPrecip": {
        "mode": "precip3h_max",
        "direction": "desc",
        "skip_zero": True,
    },
    "monthMax24hPrecip": {
        "mode": "precip24h_max",
        "direction": "desc",
        "skip_zero": True,
    },
    "dailyMaxWind": {
        "mode": "wind_max",
        "direction": "desc",
        "skip_zero": True,
    },
    "monthMax6hSnow": {
        "mode": "snow6h_max",
        "direction": "desc",
        "skip_zero": True,
    },
    "monthMax12hSnow": {
        "mode": "snow12h_max",
        "direction": "desc",
        "skip_zero": True,
    },
    "monthMax24hSnow": {
        "mode": "snow24h_max",
        "direction": "desc",
        "skip_zero": True,
    },
    "dailyMinHumidity": {
        "mode": "humidity_min",
        "direction": "asc",
        "skip_zero": False,
    },
    "dailyMinSeaLevelPressure": {
        "mode": "sea_level_pressure_min",
        "direction": "asc",
        "skip_zero": False,
    },
}

FIELD_ALIASES = {
    "temp": ["temp", "temperature"],
    "precip10m": ["precipitation10m", "precipitation"],
    "precip1h": ["precipitation1h"],
    "precip3h": ["precipitation3h"],
    "precip24h": ["precipitation24h"],
    "wind": ["wind"],
    "snow6h": ["snow6h", "snowfall6h"],
    "snow12h": ["snow12h", "snowfall12h"],
    "snow24h": ["snow24h", "snowfall24h"],
    "humidity": ["humidity"],
    "seaLevelPressure": ["normalPressure", "seaLevelPressure"],
}


def load_base_rows(pref_key: str, element_key: str, month: str):
    path = os.path.join(BASE_DIR, pref_key, f"{element_key}-{month}.json")
    if not os.path.exists(path):
        return None
    return read_json_file(path)


def normalize_base_ranks(base_row: dict):
    ranks = base_row.get("ranks")
    if isinstance(ranks, list):
        out = []
        for i, rank in enumerate(ranks[:10], start=1):
            out.append(
                {
                    "rank": i,
                    "value": trim_number(rank.get("value", 0)),
                    "date": rank.get("date", ""),
                    "highlightLive": bool(rank.get("highlightLive", False)),
                    "highlightWithinYear": bool(rank.get("highlightWithinYear", False)),
                }
            )
        return out

    records = base_row.get("records")
    if not isinstance(records, list):
        return []

    out = []
    for i, rec in enumerate(records[:10], start=1):
        out.append(
            {
                "rank": i,
                "value": trim_number(rec.get("value", 0)),
                "date": rec.get("date", ""),
                "highlightLive": False,
                "highlightWithinYear": False,
            }
        )
    return out


def build_public_row_from_base(base_row: dict) -> dict:
    return {
        "stationName": base_row.get("stationName", ""),
        "startDate": base_row.get("startDate", ""),
        "ranks": normalize_base_ranks(base_row),
    }


def should_show_live(month: str, latest_dt: datetime) -> bool:
    return month == "all" or month == str(latest_dt.month)


def parse_timestamp(ts: str):
    try:
        return datetime.strptime(str(ts), "%Y%m%d%H%M%S").replace(tzinfo=JST)
    except Exception:
        return None


def extract_numeric(value):
    if isinstance(value, list):
        if not value:
            return None
        value = value[0]

    if value in (None, "", "×", "///"):
        return None

    try:
        return float(value)
    except Exception:
        return None


def extract_any(item: dict, aliases):
    for key in aliases:
        if key not in item:
            continue
        raw = item.get(key)
        value = extract_numeric(raw)
        if value is not None:
            return value
    return None


def update_best(current, value, obs_dt, kind: str):
    if value is None or obs_dt is None:
        return current

    if current is None:
        return {
            "value": float(value),
            "obs_dt": obs_dt,
        }

    current_value = float(current["value"])
    current_dt = current["obs_dt"]

    if kind == "max":
        replace = value > current_value or (value == current_value and obs_dt > current_dt)
    else:
        replace = value < current_value or (value == current_value and obs_dt > current_dt)

    if replace:
        return {
            "value": float(value),
            "obs_dt": obs_dt,
        }

    return current


def collect_station_live_stats(amedas_code: str, latest_dt: datetime):
    stats = {
        "temp_max": None,
        "temp_min": None,
        "precip10m_max": None,
        "precip1h_max": None,
        "precip3h_max": None,
        "precip24h_max": None,
        "wind_max": None,
        "snow6h_max": None,
        "snow12h_max": None,
        "snow24h_max": None,
        "humidity_min": None,
        "sea_level_pressure_min": None,
    }

    today = latest_dt.strftime("%Y%m%d")

    for chunk_key in get_today_chunk_keys(latest_dt):
        try:
            point_json = fetch_point_chunk(amedas_code, chunk_key)
        except Exception:
            continue

        for ts, item in sorted(point_json.items()):
            if not str(ts).startswith(today):
                continue

            obs_dt = parse_timestamp(ts)
            if obs_dt is None or obs_dt > latest_dt:
                continue

            temp = extract_any(item, FIELD_ALIASES["temp"])
            precip10m = extract_any(item, FIELD_ALIASES["precip10m"])
            precip1h = extract_any(item, FIELD_ALIASES["precip1h"])
            precip3h = extract_any(item, FIELD_ALIASES["precip3h"])
            precip24h = extract_any(item, FIELD_ALIASES["precip24h"])
            wind = extract_any(item, FIELD_ALIASES["wind"])
            snow6h = extract_any(item, FIELD_ALIASES["snow6h"])
            snow12h = extract_any(item, FIELD_ALIASES["snow12h"])
            snow24h = extract_any(item, FIELD_ALIASES["snow24h"])
            humidity = extract_any(item, FIELD_ALIASES["humidity"])
            sea_level_pressure = extract_any(item, FIELD_ALIASES["seaLevelPressure"])

            stats["temp_max"] = update_best(stats["temp_max"], temp, obs_dt, "max")
            stats["temp_min"] = update_best(stats["temp_min"], temp, obs_dt, "min")
            stats["precip10m_max"] = update_best(stats["precip10m_max"], precip10m, obs_dt, "max")
            stats["precip1h_max"] = update_best(stats["precip1h_max"], precip1h, obs_dt, "max")
            stats["precip3h_max"] = update_best(stats["precip3h_max"], precip3h, obs_dt, "max")
            stats["precip24h_max"] = update_best(stats["precip24h_max"], precip24h, obs_dt, "max")
            stats["wind_max"] = update_best(stats["wind_max"], wind, obs_dt, "max")
            stats["snow6h_max"] = update_best(stats["snow6h_max"], snow6h, obs_dt, "max")
            stats["snow12h_max"] = update_best(stats["snow12h_max"], snow12h, obs_dt, "max")
            stats["snow24h_max"] = update_best(stats["snow24h_max"], snow24h, obs_dt, "max")
            stats["humidity_min"] = update_best(stats["humidity_min"], humidity, obs_dt, "min")
            stats["sea_level_pressure_min"] = update_best(
                stats["sea_level_pressure_min"],
                sea_level_pressure,
                obs_dt,
                "min",
            )

    return stats


def format_dual_ymd_from_raw(raw_date: str) -> str:
    try:
        dt = parse_date_ymd(raw_date)
    except Exception:
        return raw_date

    year = dt.year
    month = dt.month
    day = dt.day

    if dt >= datetime(2019, 5, 1, tzinfo=JST):
        era_name = "令和"
        era_year = year - 2018
    elif dt >= datetime(1989, 1, 8, tzinfo=JST):
        era_name = "平成"
        era_year = year - 1988
    elif dt >= datetime(1926, 12, 25, tzinfo=JST):
        era_name = "昭和"
        era_year = year - 1925
    elif dt >= datetime(1912, 7, 30, tzinfo=JST):
        era_name = "大正"
        era_year = year - 1911
    else:
        era_name = "明治"
        era_year = year - 1867

    era_year_text = "元" if era_year == 1 else str(era_year)
    return f"{year}年{month}月{day}日（{era_name}{era_year_text}年）"


def build_live_info(stats: dict, mode: str, *, skip_zero: bool = False):
    data = stats.get(mode)
    if not data:
        return None

    value = float(data["value"])

    if skip_zero and value == 0.0:
        return None

    raw_date = data["obs_dt"].strftime("%Y/%m/%d")
    return {
        "value": trim_number(value),
        "date": format_dual_ymd_from_raw(raw_date),
        "_date_raw": raw_date,
    }


def extract_raw_date_from_rank(rank_item: dict) -> str:
    raw = rank_item.get("_date_raw")
    if raw:
        return raw

    date_text = str(rank_item.get("date", ""))

    m = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", date_text)
    if m:
        y, mo, d = m.groups()
        return f"{y}/{int(mo):02d}/{int(d):02d}"

    m = re.search(r"(\d{4})/(\d{1,2})/(\d{1,2})", date_text)
    if m:
        y, mo, d = m.groups()
        return f"{y}/{int(mo):02d}/{int(d):02d}"

    return "1900/01/01"


def normalize_records_for_merge(base_row: dict):
    source = base_row.get("records")
    if not isinstance(source, list):
        source = base_row.get("ranks", [])

    records = []
    for item in source:
        if "value" not in item:
            continue

        try:
            value = float(item["value"])
        except Exception:
            continue

        records.append(
            {
                "value": value,
                "date": item.get("date", ""),
                "_date_raw": extract_raw_date_from_rank(item),
                "isLive": False,
            }
        )
    return records


def sort_merged_records(records, direction: str):
    if direction == "desc":
        records.sort(
            key=lambda x: (float(x["value"]), parse_date_ymd(x["_date_raw"]).timestamp()),
            reverse=True,
        )
        return

    records.sort(
        key=lambda x: (
            float(x["value"]),
            -parse_date_ymd(x["_date_raw"]).timestamp(),
        )
    )


def merge_live_into_ranks(base_row: dict, live_info: dict, direction: str, latest_dt: datetime):
    merged = normalize_records_for_merge(base_row)

    if live_info is not None:
        merged.append(
            {
                "value": float(live_info["value"]),
                "date": live_info["date"],
                "_date_raw": live_info["_date_raw"],
                "isLive": True,
            }
        )

    sort_merged_records(merged, direction)
    merged = merged[:10]

    out = []
    entered_rank = None

    for i, item in enumerate(merged, start=1):
        rank_item = {
            "rank": i,
            "value": trim_number(item["value"]),
            "date": item["date"],
            "highlightLive": bool(item["isLive"]),
            "highlightWithinYear": within_one_year(item["_date_raw"], latest_dt),
        }

        if item["isLive"]:
            entered_rank = i

        out.append(rank_item)

    return out, entered_rank


def build_station_live_debug(station: dict, stats: dict):
    def item_of(stat_key: str):
        data = stats.get(stat_key)
        if not data:
            return None
        return {
            "value": trim_number(data["value"]),
            "observedAt": data["obs_dt"].isoformat(),
        }

    return {
        "stationName": station.get("stationName", ""),
        "amedasCode": station.get("amedasCode", ""),
        "values": {
            "dailyMaxTempHigh": item_of("temp_max"),
            "dailyMaxTempLow": item_of("temp_max"),
            "dailyMinTempHigh": item_of("temp_min"),
            "dailyMinTempLow": item_of("temp_min"),
            "max10mPrecip": item_of("precip10m_max"),
            "monthMax1h10mPrecip": item_of("precip1h_max"),
            "monthMax3hPrecip": item_of("precip3h_max"),
            "monthMax24hPrecip": item_of("precip24h_max"),
            "dailyMaxWind": item_of("wind_max"),
            "monthMax6hSnow": item_of("snow6h_max"),
            "monthMax12hSnow": item_of("snow12h_max"),
            "monthMax24hSnow": item_of("snow24h_max"),
            "dailyMinHumidity": item_of("humidity_min"),
            "dailyMinSeaLevelPressure": item_of("sea_level_pressure_min"),
        },
    }


def write_pref_live_debug(
    pref_key: str,
    pref_name: str,
    stations: list,
    live_cache: dict,
    latest_obs_iso: str,
    generated_iso: str,
):
    ensure_dir(LIVE_DEBUG_DIR)

    items = []

    for station in stations:
        amedas_code = station.get("amedasCode")
        if not amedas_code:
            items.append(
                {
                    "stationName": station.get("stationName", ""),
                    "amedasCode": "",
                    "error": "amedasCode not found",
                }
            )
            continue

        cache = live_cache.get(amedas_code)
        if not cache:
            items.append(
                {
                    "stationName": station.get("stationName", ""),
                    "amedasCode": amedas_code,
                    "error": "live cache not found",
                }
            )
            continue

        if not cache.get("ok"):
            items.append(
                {
                    "stationName": station.get("stationName", ""),
                    "amedasCode": amedas_code,
                    "error": cache.get("error", "unknown error"),
                }
            )
            continue

        items.append(build_station_live_debug(station, cache["stats"]))

    output = {
        "updatedAt": generated_iso,
        "observedLatestAt": latest_obs_iso,
        "prefecture": pref_name,
        "prefKey": pref_key,
        "stations": items,
    }

    output_path = os.path.join(LIVE_DEBUG_DIR, f"{pref_key}.json")
    write_json(output_path, output)
    print(f"wrote: {output_path}")


def main() -> None:
    ensure_dir(PUBLIC_DIR)
    ensure_dir(LIVE_DEBUG_DIR)

    prefectures = load_prefecture_configs()
    target_prefs = [p for p in prefectures if p["key"] in TARGET_PREF_KEYS]

    if not target_prefs:
        raise RuntimeError("TARGET_PREF_KEYS に一致する都道府県設定が見つかりません。")

    latest_obs_iso = fetch_latest_time()
    latest_dt = datetime.fromisoformat(latest_obs_iso.replace("Z", "+00:00")).astimezone(JST)
    generated_iso = datetime.now(JST).isoformat()

    for pref in target_prefs:
        pref_key = pref["key"]
        pref_name = pref["name"]
        stations = pref["stations"]

        station_map = {s["stationName"]: s for s in stations}
        live_cache = {}

        for station in stations:
            amedas_code = station.get("amedasCode")
            if not amedas_code or amedas_code in live_cache:
                continue

            try:
                live_cache[amedas_code] = {
                    "ok": True,
                    "stats": collect_station_live_stats(amedas_code, latest_dt),
                }
            except Exception as err:
                live_cache[amedas_code] = {
                    "ok": False,
                    "error": str(err),
                }

        public_pref_dir = os.path.join(PUBLIC_DIR, pref_key)
        ensure_dir(public_pref_dir)

        for element_key, element_def in ELEMENTS.items():
            live_conf = LIVE_TARGETS.get(element_key, {})
            direction = live_conf.get("direction", element_def.get("direction"))
            live_mode = live_conf.get("mode")
            skip_zero = bool(live_conf.get("skip_zero", False))

            for month in MONTHS:
                base_data = load_base_rows(pref_key, element_key, month)
                if not base_data:
                    continue

                rows = []

                for base_row in base_data.get("rows", []):
                    station_name = base_row.get("stationName")
                    if not station_name:
                        continue

                    station = station_map.get(station_name)
                    row = build_public_row_from_base(base_row)

                    if not station:
                        row["liveError"] = "station config not found"
                        rows.append(row)
                        continue

                    if not live_mode or not should_show_live(month, latest_dt):
                        rows.append(row)
                        continue

                    amedas_code = station.get("amedasCode")
                    if not amedas_code:
                        row["liveError"] = "amedasCode not found"
                        rows.append(row)
                        continue

                    cache = live_cache.get(amedas_code)
                    if not cache:
                        row["liveError"] = "live cache not found"
                        rows.append(row)
                        continue

                    if not cache["ok"]:
                        row["liveError"] = cache["error"]
                        rows.append(row)
                        continue

                    live_info = build_live_info(
                        cache["stats"],
                        live_mode,
                        skip_zero=skip_zero,
                    )

                    merged_ranks, entered_rank = merge_live_into_ranks(
                        base_row,
                        live_info,
                        direction,
                        latest_dt,
                    )

                    row["ranks"] = merged_ranks

                    if entered_rank is not None:
                        row["liveEnteredRank"] = entered_rank
                    else:
                        row.pop("liveEnteredRank", None)

                    rows.append(row)

                output = {
                    "updatedAt": generated_iso,
                    "observedLatestAt": latest_obs_iso,
                    "prefecture": pref_name,
                    "element": element_key,
                    "month": month,
                    "rows": rows,
                }

                output_path = os.path.join(public_pref_dir, f"{element_key}-{month}.json")
                write_json(output_path, output)
                print(f"wrote: {output_path}")

        write_pref_live_debug(
            pref_key=pref_key,
            pref_name=pref_name,
            stations=stations,
            live_cache=live_cache,
            latest_obs_iso=latest_obs_iso,
            generated_iso=generated_iso,
        )

    manifest = build_dir_manifest(PUBLIC_DIR, generated_iso, target_prefs)
    manifest["observedLatestAt"] = latest_obs_iso
    manifest_path = os.path.join(PUBLIC_DIR, "manifest.json")
    write_json(manifest_path, manifest)
    print(f"wrote: {manifest_path}")
    print("done live update for target prefectures")


if __name__ == "__main__":
    main()
