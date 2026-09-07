from __future__ import annotations

import argparse, json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a matched, restricted-preview KYSing inventory.")
    parser.add_argument("--xml-root", default="U:/KYSing_MusicXML")
    parser.add_argument("--metadata", default="K:/MusicSearch/data/kysing-metadata/kumyoung-2026-09-03-all.json")
    parser.add_argument("--output", default="U:/MusicSearch-KYSing/kysing-matched-inventory.json")
    args = parser.parse_args()
    root, metadata_path = Path(args.xml_root), Path(args.metadata)
    snapshot = json.loads(metadata_path.read_text(encoding="utf-8"))
    by_number = {str(int(song["no"])): song for song in snapshot["songs"]}
    files, unmatched = [], []
    for path in sorted(root.glob("*.xml")):
        if not path.stem.isdigit() or str(int(path.stem)) not in by_number:
            unmatched.append(path.name)
            continue
        song = by_number[str(int(path.stem))]
        files.append({
            "relative_path": path.name,
            "source_id": f"kysing/{path.name}",
            "metadata": {
                "catalog": "kumyoung", "songNumber": song["no"],
                "title": song["title"], "singer": song.get("singer", ""),
                "composer": song.get("composer", ""), "lyricist": song.get("lyricist", ""),
                "release": song.get("release", ""), "accessPolicy": "research-preview",
                "metadataSource": snapshot.get("source", "api.manana.kr"),
            },
        })
    output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    payload = {"version": 1, "root": str(root), "accessPolicy": "research-preview", "files": files,
               "summary": {"matched": len(files), "unmatched": len(unmatched), "unmatchedSample": unmatched[:50]}}
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"output": str(output), **payload["summary"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__": main()
