#!/usr/bin/env python3
"""Publish JMA's latest *daily extrema*, preserving minute-precision occurrence times.

Source format: https://www.data.jma.go.jp/stats/data/mdrr/docs/csv_dl_readme_new.html
Only values with JMA quality code 5 (quasi-normal) or 8 (normal) are used.
Uses the JMA public CSV rather than pretending to reconstruct 1-minute extrema
from ten-minute AMeDAS point observations.
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
# The indices are documented by JMA under csv_dl_format_*.html. All datasets
# begin with [station, prefecture, station-name, WMO, year, month, day, hour, minute].
SOURCES = {
    "dailyMaxTemp": ("tem_rct/alltable/mxtemsadext00_rct.csv", (9, 10, 11, 12, 13)),
    "dailyMinTemp": ("tem_rct/alltable/mntemsadext00_rct.csv", (9, 10, 11, 12, 13)),
    "dailyMaxWind": ("wind_rct/alltable/mxwsp00_rct.csv", (9, 10, 13, 14, 15)),
    "dailyMaxGust": ("wind_rct/alltable/gust00_rct.csv", (9, 10, 13, 14, 15)),
    "max1hPrecip": ("pre_rct/alltable/pre1h00_rct.csv", (11, 12, 13, 14, 15)),
}
# fields: value, value_quality, occurrence_hour, occurrence_minute, time_quality


def parse_minute(date: str, hour: object, minute: object) -> str | None:
    try:
        hh, mm = int(hour), int(minute)
        if not (0 <= hh <= 24 and 0 <= mm < 60) or (hh == 24 and mm != 0):
            return None
        midnight = datetime.fromisoformat(date).replace(tzinfo=JST)
        moment = midnight + timedelta(hours=hh, minutes=mm)
        return moment.isoformat(timespec="minutes")
    except (TypeError, ValueError):
        return None


def parse_source(text: str, dataset: str, field_idx: tuple[int, ...], today: str) -> dict:
    out = {}
    rows = csv.reader(io.StringIO(text))
    for row in rows:
        try:
            station = str(int(row[0])).zfill(5)
            date = f"{int(row[4]):04d}-{int(row[5]):02d}-{int(row[6]):02d}"
            if date != today:
                continue
            v, q, h, m, tq = field_idx
            quality, time_quality = int(row[q]), int(row[tq])
            if quality not in (5, 8) or time_quality not in (5, 8):
                continue
            value = float(row[v])
            if not -10000 < value < 100000:
                continue
            observed = parse_minute(date, row[h], row[m])
            published = parse_minute(date, row[7], row[8])
            if not observed or not published:
                continue
            out[station] = {
                "value": value,
                "observedAt": observed,
                "publishedAt": published,
                "quality": quality,
                "source": "jma_daily_extremum",
            }
        except (IndexError, TypeError, ValueError, OverflowError):
            continue
    return out


def fetch_source(path: str) -> str:
    url = f"{BASE}/{path}"
    req = Request(url, headers={"User-Agent": "weather-extreme/1.0 (public JMA CSV)", "Accept": "text/csv"})
    with urlopen(req, timeout=25) as response:
        raw = response.read()
    # JMA CSV is encoded in Shift_JIS (CP932 on Windows).
    return raw.decode("cp932")


def update(output_path: Path = OUTPUT, today: str | None = None, fetcher=fetch_source):
    today = today or datetime.now(JST).strftime("%Y-%m-%d")
    previous = {}
    if output_path.exists():
        try:
            previous = json.loads(output_path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            pass
    previous_is_today = previous.get("observedDate") == today
    stations = previous.get("stations", {}) if previous_is_today else {}
    stations = {k: dict(v) for k, v in stations.items()}
    succeeded = []
    errors = []
    for key, (url, fields) in SOURCES.items():
        try:
            records = parse_source(fetcher(url), key, fields, today)
            if not records:
                raise ValueError("usable same-day records not found")
            # Replace this dataset's entries, retain other datasets during partial failures.
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
        "schema": 1,
        "observedDate": today,
        "updatedAt": datetime.now(JST).isoformat(timespec="seconds"),
        "sources": succeeded,
        "stations": stations,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_suffix('.json.tmp')
    temp_path.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding="utf-8")
    os.replace(temp_path, output_path)
    print(f"Official JMA daily extrema: {today}, {len(stations)} stations, sources={','.join(succeeded)}")
    for error in errors:
        print(f"Warning: {error}", file=sys.stderr)
    return result


if __name__ == '__main__':
    try:
        update()
    except Exception as exc:
        print(f"Failed to update: {exc}", file=sys.stderr)
        sys.exit(1)
