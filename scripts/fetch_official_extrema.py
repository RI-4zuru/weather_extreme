#!/usr/bin/env python3
"""Fetch the JMA published current-day extrema/precipitation tables.

JMA documentation: https://www.data.jma.go.jp/stats/data/mdrr/docs/csv_dl_readme_new.html
The first nine columns are station id/name and the data as-of time (JST).
Daily maximum-temperature CSV has *no* occurrence-time quality column;
minimum-temperature CSV does have one. Daily
precipitation provides an as-of time, not a separate maximum occurrence time.
"""
from __future__ import annotations

import csv
import io
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

JST = timezone(timedelta(hours=9))
BASE = "https://www.data.jma.go.jp/stats/data/mdrr"
OUTPUT = Path(__file__).resolve().parent.parent / "data/live/official_extrema.json"

# path, columns(value, value-quality, occurrence-hour, occurrence-minute,
# occurrence-time-quality), source resolution.  None means a column is absent.
SOURCES = {
    "dailyMaxTemp": ("tem_rct/alltable/mxtemsadext00_rct.csv", (9, 10, 11, 12, None), "minute"),
    "dailyMinTemp": ("tem_rct/alltable/mntemsadext00_rct.csv", (9, 10, 11, 12, 13), "minute"),
    "dailyMaxWind": ("wind_rct/alltable/mxwsp00_rct.csv", (9, 10, 13, 14, 15), "minute"),
    "dailyMaxGust": ("wind_rct/alltable/gust00_rct.csv", (9, 10, 13, 14, 15), "minute"),
    "dailyPrecip": ("pre_rct/alltable/predaily00_rct.csv", (9, 10, None, None, None), "official-asof"),
    "max1hPrecip": ("pre_rct/alltable/pre1h00_rct.csv", (11, 12, 13, 14, 15), "minute"),
    "max3hPrecip": ("pre_rct/alltable/pre3h00_rct.csv", (11, 12, 13, 14, 15), "ten-minute-official"),
    "max6hPrecip": ("pre_rct/alltable/pre6h00_rct.csv", (11, 12, 13, 14, 15), "ten-minute-official"),
    "max12hPrecip": ("pre_rct/alltable/pre12h00_rct.csv", (11, 12, 13, 14, 15), "ten-minute-official"),
    "max24hPrecip": ("pre_rct/alltable/pre24h00_rct.csv", (11, 12, 13, 14, 15), "ten-minute-official"),
    "max48hPrecip": ("pre_rct/alltable/pre48h00_rct.csv", (11, 12, 13, 14, 15), "ten-minute-official"),
    "max72hPrecip": ("pre_rct/alltable/pre72h00_rct.csv", (11, 12, 13, 14, 15), "ten-minute-official"),
}


def parse_minute(date: str, hour: object, minute: object) -> str | None:
    try:
        hh, mm = int(hour), int(minute)
        if not (0 <= hh <= 24 and 0 <= mm < 60) or (hh == 24 and mm != 0):
            return None
        moment = datetime.fromisoformat(date).replace(tzinfo=JST) + timedelta(hours=hh, minutes=mm)
        return moment.isoformat(timespec="minutes")
    except (TypeError, ValueError):
        return None


def parse_source(text: str, dataset: str, field_idx: tuple, today: str, resolution: str = "minute") -> dict:
    out = {}
    for row in csv.reader(io.StringIO(text)):
        try:
            station = str(int(row[0])).zfill(5)
            date = f"{int(row[4]):04d}-{int(row[5]):02d}-{int(row[6]):02d}"
            if date != today:
                continue
            v, q, h, m, tq = field_idx
            quality = int(row[q])
            if quality not in (5, 8):
                continue
            if tq is not None and int(row[tq]) not in (5, 8):
                continue
            value = float(row[v])
            if not -10000 < value < 100000:
                continue
            published = parse_minute(date, row[7], row[8])
            observed = (parse_minute(date, row[h], row[m]) if h is not None and m is not None else published)
            if not observed or not published:
                continue
            # The CSV may be fetched at 00:00/just after midnight and still
            # refer to yesterday.  Never mislabel such a record as today's.
            if not observed.startswith(today):
                continue
            out[station] = {
                "value": value, "observedAt": observed, "publishedAt": published,
                "quality": quality, "source": "jma_daily_extremum", "sourceResolution": resolution,
            }
        except (IndexError, TypeError, ValueError, OverflowError):
            continue
    return out


def fetch_source(path: str) -> str:
    req = Request(f"{BASE}/{path}", headers={
        "User-Agent": "weather-extreme/1.1 (public JMA CSV)", "Accept": "text/csv"})
    with urlopen(req, timeout=25) as response:
        raw = response.read()
    return raw.decode("cp932")


def update(output_path: Path = OUTPUT, today: str | None = None, fetcher=fetch_source):
    today = today or datetime.now(JST).strftime("%Y-%m-%d")
    previous = {}
    if output_path.exists():
        try:
            previous = json.loads(output_path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            pass
    stations = previous.get("stations", {}) if previous.get("observedDate") == today else {}
    stations = {k: dict(v) for k, v in stations.items()}
    succeeded, errors = [], []
    for key, (url, fields, resolution) in SOURCES.items():
        try:
            records = parse_source(fetcher(url), key, fields, today, resolution)
            if not records:
                raise ValueError("usable same-day records not found")
            for obs in stations.values():
                obs.pop(key, None)
            for station, record in records.items():
                stations.setdefault(station, {})[key] = record
            succeeded.append(key)
        except (HTTPError, URLError, TimeoutError, UnicodeError, ValueError, OSError) as exc:
            errors.append(f"{key}: {exc}")
    if not succeeded:
        raise RuntimeError("No current official CSV data obtained: " + "; ".join(errors))
    stations = {k: v for k, v in stations.items() if v}
    result = {
        "schema": 1, "observedDate": today,
        "updatedAt": datetime.now(JST).isoformat(timespec="seconds"),
        "sources": sorted({k for values in stations.values() for k in values}),
        "stations": stations,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_suffix('.json.tmp')
    temp_path.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    os.replace(temp_path, output_path)
    print(f"Official JMA daily extrema: {today}, {len(stations)} stations, successful={','.join(succeeded)}")
    for error in errors:
        print(f"Warning: {error}", file=sys.stderr)
    return result


if __name__ == '__main__':
    try:
        update()
    except Exception as exc:
        print(f"Failed to update: {exc}", file=sys.stderr)
        sys.exit(1)
