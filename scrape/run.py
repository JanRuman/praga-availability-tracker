from __future__ import annotations

import json
import os
import re
from dataclasses import asdict
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup

from .apartments import discover_apartments
from .calendar import parse_calendar_days
from .http_client import HttpClient


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SNAPSHOT_DIR = DATA_DIR / "snapshots"


def _safe_mkdir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def _extract_apartment_name(html: str, fallback: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    h1 = soup.find("h1")
    if h1:
        txt = " ".join(h1.get_text(" ", strip=True).split())
        if txt:
            return txt
    title = soup.find("title")
    if title:
        txt = " ".join(title.get_text(" ", strip=True).split())
        if txt:
            return txt.split("-")[0].strip() or fallback
    return fallback


def run() -> Path:
    client = HttpClient()
    apartments = discover_apartments(client)

    limit = os.environ.get("APT_LIMIT")
    if limit and limit.isdigit():
        apartments = apartments[: int(limit)]

    run_date = os.environ.get("RUN_DATE") or date.today().isoformat()
    snapshot_path = SNAPSHOT_DIR / f"{run_date}.json"

    _safe_mkdir(SNAPSHOT_DIR)

    snapshot = {
        "run_date": run_date,
        "source": "https://praga.at/apartmany/",
        "apartments": [],
    }

    for apt in apartments:
        html = client.get_text(apt.url)
        days = parse_calendar_days(html)
        name = _extract_apartment_name(html, apt.name)

        snapshot["apartments"].append(
            {
                "id": apt.id,
                "name": name,
                "url": apt.url,
                "days": [asdict(d) for d in days],
            }
        )

    snapshot_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")

    _safe_mkdir(DATA_DIR)

    # Build an aggregated \"all history\" view across all snapshots so that
    # latest.json always contains the union of known days per apartment,
    # with the most recent snapshot winning if the same date appears multiple times.
    all_snapshot_paths = sorted(
        (p for p in SNAPSHOT_DIR.glob(\"*.json\") if re.match(r\"^\\d{4}-\\d{2}-\\d{2}\\.json$\", p.name)),
        key=lambda p: p.stem,
    )

    apartments_by_id: dict[str, dict] = {}
    for spath in all_snapshot_paths:
        data = json.loads(spath.read_text(encoding=\"utf-8\"))
        for apt in data.get(\"apartments\", []):
            apt_id = str(apt.get(\"id\"))
            entry = apartments_by_id.setdefault(
                apt_id,
                {
                    \"id\": apt_id,
                    \"name\": apt.get(\"name\", f\"Apartment {apt_id}\"),
                    \"url\": apt.get(\"url\"),
                    \"days\": {},
                },
            )
            # Always keep the latest name/url we see.
            if apt.get(\"name\"):
                entry[\"name\"] = apt[\"name\"]
            if apt.get(\"url\"):
                entry[\"url\"] = apt[\"url\"]

            for day in apt.get(\"days\", []):
                dkey = day.get(\"date\")
                if not dkey:
                    continue
                # Later snapshots overwrite earlier ones for the same date.
                entry[\"days\"][dkey] = {
                    \"date\": dkey,
                    \"status\": day.get(\"status\", \"unavailable\"),
                    \"price_eur\": day.get(\"price_eur\"),  # may be None
                }

    aggregated = {
        \"run_date\": run_date,
        \"source\": \"https://praga.at/apartmany/\",
        \"apartments\": [],
    }
    for apt_id in sorted(apartments_by_id.keys(), key=lambda x: (int(x) if x.isdigit() else 10**9, x)):
        entry = apartments_by_id[apt_id]
        days_list = [entry[\"days\"][k] for k in sorted(entry[\"days\"].keys())]
        aggregated[\"apartments\"].append(
            {
                \"id\": entry[\"id\"],
                \"name\": entry[\"name\"],
                \"url\": entry[\"url\"],
                \"days\": days_list,
            }
        )

    latest_path = DATA_DIR / \"latest.json\"
    latest_path.write_text(json.dumps(aggregated, ensure_ascii=False, indent=2), encoding=\"utf-8\"))

    # Update snapshot index for the static viewer.
    snapshots = sorted(
        (p.stem for p in SNAPSHOT_DIR.glob("*.json") if re.match(r"^\d{4}-\d{2}-\d{2}$", p.stem)),
        reverse=True,
    )
    index_path = DATA_DIR / "index.json"
    index_path.write_text(
        json.dumps({"snapshots": snapshots}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return snapshot_path


if __name__ == "__main__":
    out = run()
    print(f"Wrote {out}")

