from __future__ import annotations

import argparse
import re
import sqlite3
from pathlib import Path
from xml.etree import ElementTree as ET


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def normalized_title(value: str) -> str:
    return re.sub(r"[,_\s]+", " ", value).strip(" .-_").casefold()


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh indexed title/composer from a MusicXML source")
    parser.add_argument("--source", required=True)
    parser.add_argument("--root", default="K:/Music Analysis/musicxml")
    parser.add_argument("--db", default="K:/MusicSearch/data/search-index-v2/search.sqlite")
    args = parser.parse_args()
    path = Path(args.root) / args.source
    root = ET.parse(path).getroot()
    title = next((node.text.strip() for node in root.iter() if local_name(node.tag) in {"work-title", "movement-title"} and node.text and node.text.strip()), path.stem)
    composer = next((node.text.strip() for node in root.iter() if local_name(node.tag) == "creator" and node.get("type") in {None, "composer"} and node.text and node.text.strip()), "")
    composer = next((line.strip() for line in composer.splitlines() if line.strip().lower().startswith("composed by")), composer.splitlines()[0].strip() if composer else "")
    normalized = normalized_title(title)
    connection = sqlite3.connect(args.db)
    try:
        rows = connection.execute("SELECT id, stream_id FROM works WHERE source=?", (args.source,)).fetchall()
        if not rows:
            raise SystemExit(f"Indexed source not found: {args.source}")
        connection.execute("BEGIN")
        connection.execute("UPDATE works SET title=?, normalized_title=?, composer=? WHERE source=?", (title, normalized, composer, args.source))
        for work_id, stream_id in rows:
            connection.execute("DELETE FROM works_fts WHERE id=?", (work_id,))
            connection.execute("INSERT INTO works_fts(id,title,normalized_title,composer,source,stream_id) VALUES(?,?,?,?,?,?)", (work_id, title, normalized, composer, args.source, stream_id))
        connection.commit()
    finally:
        connection.close()
    print(f"Updated {len(rows)} streams: {ascii(title)} - {ascii(composer)}")


if __name__ == "__main__":
    main()
