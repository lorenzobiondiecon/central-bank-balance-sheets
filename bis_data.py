"""Small download and SDMX parsing helpers; analysis lives in the notebook."""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

import pandas as pd

DIMENSIONS = ["FREQ", "REF_AREA", "COMP_METHOD", "UNIT_MEASURE", "CURRENCY", "TRANSFORMATION"]


def load_snapshot(raw_dir, countries, start_year, monthly_start, refresh=False):
    """Reuse a checked, parameter-matching snapshot, or download all four files.

    Requests are narrow country/date queries, not whole-database downloads.
    No credentials are needed. A failed download raises before replacing files.
    """
    raw_dir = Path(raw_dir)
    areas = "+".join(countries)
    base = "https://stats.bis.org/api/v1/data/WS_CBTA/"
    urls = {
        "annual.xml": f"{base}A.{areas}.B...?startPeriod={start_year}",
        "monthly_recent.xml": f"{base}M.{areas}.B...?startPeriod={monthly_start}",
        "structure.xml": "https://stats.bis.org/api/v1/dataflow/BIS/WS_CBTA/1.0?references=all",
        "cbta_documentation.pdf": "https://www.bis.org/statistics/cbta/cbta_doc.pdf",
    }
    manifest_path = raw_dir / "manifest.json"
    if not refresh:
        manifest = json.loads(manifest_path.read_text())
        if {item["file"]: item["url"] for item in manifest} != urls:
            raise ValueError("Saved request differs from settings; set REFRESH=True to download.")
        for item in manifest:
            content = (raw_dir / item["file"]).read_bytes()
            if hashlib.sha256(content).hexdigest() != item["sha256"]:
                raise ValueError(f"Snapshot checksum mismatch: {item['file']}")
        return manifest

    payloads, manifest = {}, []
    for name, url in urls.items():
        # The default API response is structure-specific SDMX XML, with metadata.
        with urllib.request.urlopen(url, timeout=60) as response:
            content = response.read()
            content_type = response.headers.get("Content-Type")
        if name.endswith(".xml"):
            root = ET.fromstring(content)
            if name != "structure.xml" and not any(
                e.tag.rsplit("}", 1)[-1] == "Obs" for e in root.iter()
            ):
                raise ValueError(f"BIS returned no observations for {name}")
        elif not content.startswith(b"%PDF"):
            raise ValueError("BIS documentation response is not a PDF")
        payloads[name] = content
        manifest.append({
            "file": name, "url": url,
            "retrieved_utc": datetime.now(timezone.utc).isoformat(),
            "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(),
            "content_type": content_type,
        })
    raw_dir.mkdir(parents=True, exist_ok=True)
    for name, content in payloads.items():
        (raw_dir / name).write_bytes(content)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def read_sdmx(path):
    """Return observations and complete series metadata without filling gaps."""
    observations, metadata = [], []
    for series in ET.parse(path).getroot().iter():
        if series.tag.rsplit("}", 1)[-1] != "Series":
            continue
        attrs = dict(series.attrib)
        key = ".".join(attrs[d] for d in DIMENSIONS)
        metadata.append({"series_key": key, **attrs})
        for obs in series:
            if obs.tag.rsplit("}", 1)[-1] == "Obs":
                observations.append({
                    "series_key": key, **{d: attrs[d] for d in DIMENSIONS},
                    "UNIT_MULT": attrs["UNIT_MULT"],
                    "COLLECTION": attrs.get("COLLECTION"), **obs.attrib,
                })
    frame, meta = pd.DataFrame(observations), pd.DataFrame(metadata)
    if frame.empty:
        raise ValueError(f"No observations in {path}")
    if frame.duplicated(["series_key", "TIME_PERIOD"]).any():
        raise ValueError(f"Duplicate observations in {path}")
    frame["OBS_VALUE"] = pd.to_numeric(frame["OBS_VALUE"], errors="raise")
    frame["UNIT_MULT"] = pd.to_numeric(frame["UNIT_MULT"], errors="raise")
    return frame, meta
