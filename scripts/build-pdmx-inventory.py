from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def truthy(value: str | None) -> bool:
    return (value or "").strip().casefold() == "true"


def clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return None if not value or value == "NA" else value


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a MusicANote inventory from PDMX.csv.")
    parser.add_argument("--csv", default="K:/PDMX.csv")
    parser.add_argument("--root", default="K:/mxl")
    parser.add_argument("--output", default="U:/MusicSearch-PDMX/pdmx-classical-inventory.json")
    parser.add_argument("--genre", default="classical")
    parser.add_argument("--include-duplicates", action="store_true")
    parser.add_argument("--require-no-license-conflict", action="store_true")
    args = parser.parse_args()

    root = Path(args.root)
    available = {path.name: path for path in root.rglob("*.mxl")}
    records = []
    missing = []
    with Path(args.csv).open("r", encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            if (row.get("genres") or "").strip().casefold() != args.genre.casefold():
                continue
            if not truthy(row.get("subset:all_valid")):
                continue
            if not args.include_duplicates and not truthy(row.get("subset:deduplicated")):
                continue
            if args.require_no_license_conflict and not truthy(row.get("subset:no_license_conflict")):
                continue
            name = Path((row.get("mxl") or "").replace("\\", "/")).name
            path = available.get(name)
            if path is None:
                missing.append(name)
                continue
            records.append({
                "relative_path": path.relative_to(root).as_posix(),
                "bytes": path.stat().st_size,
                "duplicate_of": None,
                "pdmx": {
                    "metadata_path": clean(row.get("metadata")),
                    "song_name": clean(row.get("song_name")),
                    "title": clean(row.get("title")),
                    "artist_name": clean(row.get("artist_name")),
                    "composer_name": clean(row.get("composer_name")),
                    "publisher": clean(row.get("publisher")),
                    "genres": clean(row.get("genres")),
                    "license": clean(row.get("license")),
                    "license_url": clean(row.get("license_url")),
                    "license_conflict": truthy(row.get("license_conflict")),
                    "n_notes": int(float(row.get("n_notes") or 0)),
                    "is_best_path": truthy(row.get("is_best_path")),
                    "is_best_arrangement": truthy(row.get("is_best_arrangement")),
                    "is_best_unique_arrangement": truthy(row.get("is_best_unique_arrangement")),
                },
            })

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    inventory = {
        "schema_version": "musicanote-pdmx-inventory-0.1",
        "root": str(root.resolve()),
        "filters": {
            "genre": args.genre,
            "all_valid": True,
            "deduplicated": not args.include_duplicates,
            "no_license_conflict": args.require_no_license_conflict,
        },
        "summary": {
            "files": len(records),
            "bytes": sum(record["bytes"] for record in records),
            "declared_notes": sum(record["pdmx"]["n_notes"] for record in records),
            "missing": len(missing),
        },
        "files": records,
    }
    output.write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), **inventory["summary"]}, ensure_ascii=False, indent=2))
    if missing:
        print(f"First missing files: {missing[:10]}")


if __name__ == "__main__":
    main()
