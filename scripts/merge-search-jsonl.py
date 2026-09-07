from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge search JSONL files by stable work id.")
    parser.add_argument("destination")
    parser.add_argument("sources", nargs="+")
    args = parser.parse_args()
    destination = Path(args.destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise FileExistsError(destination)
    seen = set()
    counts = []
    with destination.open("x", encoding="utf-8") as output:
        for source_text in args.sources:
            source = Path(source_text)
            accepted = duplicates = 0
            with source.open("r", encoding="utf-8") as input_file:
                for line in input_file:
                    record = json.loads(line)
                    work_id = record["id"]
                    if work_id in seen:
                        duplicates += 1
                        continue
                    seen.add(work_id)
                    output.write(line if line.endswith("\n") else line + "\n")
                    accepted += 1
            counts.append({"source": str(source), "accepted": accepted, "duplicates": duplicates})
    print(json.dumps({"destination": str(destination), "works": len(seen), "sources": counts, "bytes": destination.stat().st_size}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
