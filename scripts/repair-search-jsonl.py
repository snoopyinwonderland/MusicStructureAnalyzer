from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Copy valid search JSONL rows and report malformed rows.")
    parser.add_argument("source")
    parser.add_argument("destination")
    args = parser.parse_args()
    source, destination = Path(args.source), Path(args.destination)
    if destination.exists():
        raise FileExistsError(destination)
    valid = invalid = 0
    examples = []
    with source.open("r", encoding="utf-8") as input_file, destination.open("x", encoding="utf-8") as output_file:
        for line_number, line in enumerate(input_file, 1):
            try:
                json.loads(line)
            except Exception as exc:
                invalid += 1
                if len(examples) < 10:
                    examples.append({"line": line_number, "error": str(exc), "prefix": line[:180]})
                continue
            output_file.write(line)
            valid += 1
    print(json.dumps({"source": str(source), "destination": str(destination), "valid": valid, "invalid": invalid, "examples": examples}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
