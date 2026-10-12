#!/usr/bin/env python3
"""Research notes → data/businesses.json, the file scripts/import-shops.py reads.

    python3 scripts/businesses-from-research.py <research.json>

Input: {"businesses": [{motdang_id, name, name_th, kind, verdict, province, website,
         facebook, line, phone, facts: [{field, value, thb, unit, quote, url, date}]}],
        "platforms": [...]}
Keeps: verdict "fits" with at least one fact that has a quote, a URL and a date.
Lists: motdang ids with a "misfiled" verdict, which the import leaves out.
Platforms (bTaskee, Seekster…) are kept under "platforms" for reference; the
board does not show them.
"""
import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "businesses.json"
FIELDS = {"price", "minimum", "zones", "booking", "languages", "hours", "services"}
UNITS = {"hour", "visit", "kg", "job", "month", "sqm", "unit", "day", "piece", "room", "bag"}


def clean_fact(f):
    if not (f.get("quote") and f.get("url") and f.get("date")):
        return None
    field = f.get("field") if f.get("field") in FIELDS else "services"
    out = {"field": field, "quote": " ".join(str(f["quote"]).split())[:220], "url": f["url"], "date": str(f["date"])[:10]}
    if f.get("value"):
        out["value"] = " ".join(str(f["value"]).split())[:160]
    thb = f.get("thb")
    if field in ("price", "minimum") and isinstance(thb, (int, float)) and 0 < thb < 1_000_000:
        out["thb"] = thb
        if f.get("unit") in UNITS:
            out["unit"] = f["unit"]
    return out


def main():
    src = json.loads(Path(sys.argv[1]).read_text())
    keep, misfiled, seen = [], [], set()
    for b in src.get("businesses", []):
        v = str(b.get("verdict") or "")
        if v.startswith("misfiled"):
            if b.get("motdang_id"):
                misfiled.append(b["motdang_id"])
            continue
        if v != "fits":
            continue
        facts = [x for x in (clean_fact(f) for f in b.get("facts") or []) if x]
        if not facts:
            continue
        key = b.get("motdang_id") or (b.get("name") or "").lower()
        if key in seen:
            continue
        seen.add(key)
        row = {k: b.get(k) for k in ("motdang_id", "name", "name_th", "kind", "province", "website", "facebook",
                                     "line", "phone") if b.get(k)}
        row["facts"] = facts
        keep.append(row)
    out = {
        "_meta": {"built": dt.date.today().isoformat(), "from": Path(sys.argv[1]).name,
                  "businesses": len(keep), "misfiled": len(misfiled),
                  "method": "Facts each business states on its own website, Facebook or LINE page, or its own "
                            "listing on a booking platform; each with the words, the page and the date read."},
        "businesses": keep,
        "misfiled": sorted(set(misfiled)),
        "platforms": src.get("platforms", []),
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps(out["_meta"], ensure_ascii=False))


if __name__ == "__main__":
    main()
