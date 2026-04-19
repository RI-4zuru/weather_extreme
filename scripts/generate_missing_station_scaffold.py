import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PREFECTURES_JSON = ROOT / "config" / "prefectures.json"


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    if not PREFECTURES_JSON.exists():
      raise FileNotFoundError(f"not found: {PREFECTURES_JSON}")

    data = read_json(PREFECTURES_JSON)
    prefectures = data.get("prefectures", [])

    created = 0
    skipped = 0

    for pref in prefectures:
        pref_name = pref.get("name", "")
        stations_file = pref.get("stationsFile", "").strip()

        if not stations_file:
            print(f"skip (stationsFile missing): {pref_name}")
            skipped += 1
            continue

        station_path = ROOT / stations_file

        if station_path.exists():
            print(f"skip existing: {station_path}")
            skipped += 1
            continue

        payload = {
            "pref": pref_name,
            "stations": []
        }
        write_json(station_path, payload)
        print(f"created: {station_path}")
        created += 1

    print("done")
    print(f"created={created}, skipped={skipped}")


if __name__ == "__main__":
    main()
