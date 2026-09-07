from __future__ import annotations

import argparse
import json
import os
import zipfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path


def extract_one(payload):
    root_text, output_text, relative = payload
    source = Path(root_text) / relative
    destination = (Path(output_text) / relative).with_suffix(".xml")
    if destination.exists() and destination.stat().st_size:
        return "existing", relative, destination.stat().st_size
    try:
        with zipfile.ZipFile(source) as archive:
            names = [name for name in archive.namelist() if name.lower().endswith((".xml", ".musicxml")) and "container.xml" not in name.lower()]
            if not names:
                raise ValueError("empty_mxl")
            data = archive.read(names[0])
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(".xml.tmp")
        temporary.write_bytes(data)
        temporary.replace(destination)
        return "written", relative, len(data)
    except Exception as exc:
        return "failed", relative, f"{type(exc).__name__}:{exc}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", default="U:/MusicSearch-PDMX/pdmx-classical-inventory.json")
    parser.add_argument("--output", default="U:/MusicSearch-PDMX/xml")
    parser.add_argument("--workers", type=int, default=max(1, min(8, (os.cpu_count() or 2) - 1)))
    args = parser.parse_args()
    inventory = json.loads(Path(args.inventory).read_text(encoding="utf-8"))
    payloads = ((inventory["root"], args.output, record["relative_path"]) for record in inventory["files"])
    counts = {"written": 0, "existing": 0, "failed": 0}; bytes_written = 0; failures = []
    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        for index, (status, relative, detail) in enumerate(executor.map(extract_one, payloads, chunksize=16), 1):
            counts[status] += 1
            if status == "written": bytes_written += detail
            if status == "failed" and len(failures) < 20: failures.append({"source": relative, "error": detail})
            if index % 1000 == 0: print(f"{index}/{len(inventory['files'])} {counts}", flush=True)
    print(json.dumps({"files": len(inventory["files"]), **counts, "bytesWritten": bytes_written, "failures": failures}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
