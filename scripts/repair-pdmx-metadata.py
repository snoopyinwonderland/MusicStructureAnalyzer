from __future__ import annotations

import argparse
import csv
import re
import sqlite3
from pathlib import Path


def clean(value: str | None) -> str:
    value = (value or "").strip()
    return "" if value == "NA" else value


def normalized_title(value: str) -> str:
    value = re.sub(r"\.(?:musicxml(?:\.xml)?|xml|mxl)$", "", value, flags=re.I)
    value = re.sub(r"^\s*\d+\.?\s*", "", value)
    return re.sub(r"[,_\s]+", " ", value).strip(" .-_").casefold()


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh one PDMX work's display metadata from PDMX.csv")
    parser.add_argument("--source", required=True, help="Database source path, such as mxl/2/52/file.mxl")
    parser.add_argument("--csv", default="K:/PDMX.csv")
    parser.add_argument("--db", default="K:/MusicSearch/data/search-index-v2/search.sqlite")
    args = parser.parse_args()

    wanted = args.source.replace("\\", "/").removeprefix("./")
    match = None
    with Path(args.csv).open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            source = clean(row.get("mxl")).replace("\\", "/").removeprefix("./")
            if source == wanted:
                match = row
                break
    if match is None:
        raise SystemExit(f"PDMX metadata not found: {wanted}")

    title = clean(match.get("song_name")) or clean(match.get("title"))
    composer = clean(match.get("composer_name")) or clean(match.get("artist_name"))
    normalized = normalized_title(title)
    connection = sqlite3.connect(args.db)
    try:
        rows = connection.execute("SELECT id, stream_id FROM works WHERE source=?", (wanted,)).fetchall()
        if not rows:
            raise SystemExit(f"Indexed work not found: {wanted}")
        connection.execute("BEGIN")
        connection.execute(
            "UPDATE works SET title=?, normalized_title=?, composer=? WHERE source=?",
            (title, normalized, composer, wanted),
        )
        for work_id, stream_id in rows:
            connection.execute("DELETE FROM works_fts WHERE id=?", (work_id,))
            connection.execute(
                "INSERT INTO works_fts(id,title,normalized_title,composer,source,stream_id) VALUES(?,?,?,?,?,?)",
                (work_id, title, normalized, composer, wanted, stream_id),
            )
        connection.commit()
    finally:
        connection.close()
    print(f"Updated {len(rows)} streams: {ascii(title)} - {ascii(composer)}")


if __name__ == "__main__":
    main()
