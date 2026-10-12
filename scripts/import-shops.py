#!/usr/bin/env python3
"""Businesses from the Mot Dang directory that do the board's work, as SQL for
the `shop` table. Reads mot-dang's canonical records (no network) and the
slug of each record's page from mot-dang's built docs/data files.

    python3 scripts/import-shops.py > /tmp/shops.sql
    npx wrangler d1 execute homematch --remote --file=/tmp/shops.sql

Businesses from data/businesses.json (built by scripts/businesses-from-research.py
from what each business states on its own pages): facts merge onto the Mot Dang
row with the same id; a business with no Mot Dang record becomes a 'web' row that
links to its own page; ids listed under "misfiled" are left out.

Which records count:
  housekeeper  overtureCategory home_cleaning (cleaning services)
  gardener     sub landscaper
  laundry      sub laundry AND a pickup/delivery facet or wording
  handyperson  repair/home, or sub handyman
"""
import json, math, os, re, sys
from pathlib import Path

MD = Path.home() / "Developer/claude code projects/mot-dang"
# The built site's data files. The build runs on motdang-build since 2026-10-05, so the
# Mac may hold no docs/: MD_DOCS_DATA names a folder of the published <prov>-<shelf>.geojson.
DOCS_DATA = Path(os.environ.get("MD_DOCS_DATA") or MD / "docs/data")
ROOT = Path(__file__).resolve().parent.parent
TENANT = json.loads((ROOT / "tenants/motdang.json").read_text())
ZONES = [(z["key"], z["center"]) for z in TENANT["zones"] if z.get("center")]
PICKUP = re.compile(r"รับ-?ส่ง|ถึงบ้าน|delivery|pick ?up|เดลิเวอรี่", re.I)
# The repair/home shelf also files building-materials stores, machine shops,
# vehicle trim and one café. A handyman row has to say it does house work,
# in its name or its own trade tags, and not be one of those.
HANDY = re.compile(r"ช่าง|ซ่อม|รับทำ|รับเหมา|ติดตั้ง|ล้างแอร์|แอร์|ประปา|ไฟฟ้า|สายไฟ|หลังคา|รางน้ำ|มุ้งลวด|กันสาด|ทาสี|"
                   r"กระเบื้อง|ฝ้า|กั้นห้อง|เจาะบาดาล|ปล่องดูดควัน|บริการ|handyman|repair|service|install|plumb|"
                   r"electric|air ?con|roof|painting|renovat", re.I)
NOT_HANDY = re.compile(r"วัสดุก่อสร้าง|คลังสินค้า|คาเฟ่|กาแฟ|\bcafe|café|coffee|\bbar\b|restaurant|ร้านอาหาร|hotel|"
                       r"โรงแรม|รถยนต์|มอเตอร์ไซค์|จักรยานยนต์|เบาะรถ|โรงกลึง|กลึง|คอนกรีต|น้ำแข็ง|\bpos\b|เครื่องคิดเงิน|"
                       r"mr\.? ?diy|homepro|โฮมโปร|ไทวัสดุ|global ?house|โกลบอลเฮ้าส์|dohome|ดูโฮม|ทีโอที|คอมพิวเตอร์|"
                       r"มือถือ|โทรศัพท์|โรงงาน|factory|warehouse|เบาะ|service ?cent(er|re)|notebook|printer|ปริ้นเตอร์", re.I)
OPERATOR = "motdang"
BIZ = ROOT / "data" / "businesses.json"
KIND = {"cleaning": "housekeeper", "laundry": "laundry", "handyman": "handyperson", "garden": "gardener"}


def load_biz():
    try:
        d = json.loads(BIZ.read_text())
    except (OSError, ValueError):
        return {}, [], set()
    by_id, web = {}, []
    for b in d.get("businesses", []):
        if b.get("motdang_id"):
            by_id[b["motdang_id"]] = b
        else:
            web.append(b)
    return by_id, web, set(d.get("misfiled") or [])


def facts_json(b):
    keep = [{k: f[k] for k in ("field", "thb", "unit", "quote", "url", "date") if f.get(k) is not None}
            for f in b.get("facts") or [] if f.get("quote") and f.get("url")]
    return json.dumps(keep, ensure_ascii=False) if keep else None


def km(a, b, c, d):
    r = math.pi / 180
    x = math.sin((c - a) * r / 2) ** 2 + math.cos(a * r) * math.cos(c * r) * math.sin((d - b) * r / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(x))


def zone_of(lat, lon):
    if lat is None or lon is None:
        return None
    best = min(((km(lat, lon, c[0], c[1]), k) for k, c in ZONES), default=None)
    return best[1] if best and best[0] <= 12 else None


def slugs(prov):
    out = {}
    for f in DOCS_DATA.glob(f"{prov}-*.geojson"):
        try:
            for ft in json.loads(f.read_text())["features"]:
                p = ft["properties"]
                if p.get("id") and p.get("slug"):
                    out[p["id"]] = p["slug"]
        except Exception:
            pass
    return out


def board_category(r):
    a = r.get("attrs") or {}
    cats, subs = r.get("cat") or [], r.get("sub") or []
    words = " ".join([r.get("name") or "", r.get("nameTh") or "", r.get("nameEn") or ""] + (a.get("tradeTags") or []))
    if a.get("overtureCategory") == "home_cleaning":
        return "housekeeper", 0
    if "landscaper" in subs:
        return "gardener", 0
    if "laundry" in subs:
        facets = a.get("facets") or {}
        if facets.get("pickup") or PICKUP.search(words):
            return "laundry", 1
        return None, 0
    if "handyman" in subs:
        return "handyperson", 0
    if "repair" in cats and "home" in subs and HANDY.search(words) and not NOT_HANDY.search(words):
        return "handyperson", 0
    return None, 0


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def main():
    rows, counts = [], {}
    biz, web, misfiled = load_biz()
    for prov in ("cm", "cr"):
        slug = slugs(prov)
        for r in json.loads((MD / f"data/canonical/{prov}.json").read_text()):
            cat, pickup = board_category(r)
            if not cat or r["id"] in misfiled:
                continue
            if KIND.get((biz.get(r["id"]) or {}).get("kind")):
                cat = KIND[biz[r["id"]]["kind"]]  # the business's own pages say which work it does
                pickup = 1 if cat == "laundry" else pickup
            a = r.get("attrs") or {}
            if r.get("closed") or a.get("closed") or a.get("permanentlyClosed"):
                continue
            s = slug.get(r["id"])
            url = f"https://motdang.net/{prov}/p/{s}.html" if s else None
            if not url:
                continue  # no built page to send a reader to
            lat, lon = r.get("lat"), r.get("lng")
            line = a.get("lineUrl") or (f"https://line.me/R/ti/p/{a['lineId']}" if a.get("lineId") else None)
            b = biz.get(r["id"]) or {}
            rows.append((r["id"], cat, r.get("nameTh") or r.get("name"), r.get("nameEn"), url, lat, lon,
                         (r.get("phone") or None), line, r.get("hours") or None, zone_of(lat, lon), pickup, prov,
                         float(r.get("rank") or 0), "motdang", facts_json(b) if b else None,
                         b.get("website") or r.get("website") or None))
            counts[(prov, cat)] = counts.get((prov, cat), 0) + 1
    for b in web:
        cat = KIND.get(b.get("kind"))
        url = b.get("website") or b.get("facebook")
        fj = facts_json(b)
        if not cat or not url or not fj:
            continue
        prov = b.get("province") or "cm"
        bid = "web-" + re.sub(r"[^a-z0-9]+", "-", (b.get("name") or url).lower()).strip("-")[:60]
        line = b.get("line")
        if line and not line.startswith("http"):
            line = "https://line.me/R/ti/p/" + line
        rows.append((bid, cat, b.get("name_th") or b.get("name"), b.get("name") if b.get("name_th") else None, url,
                     None, None, b.get("phone") or None, line or None, None, "chiang-rai" if prov == "cr" else None,
                     1 if cat == "laundry" else 0, prov, 0.0, "web", fj, b.get("website") or None))
        counts[(prov, cat + "+web")] = counts.get((prov, cat + "+web"), 0) + 1
    print(f"DELETE FROM shop WHERE operator_id='{OPERATOR}';")
    for x in rows:
        print("INSERT INTO shop(id, operator_id, category, name_th, name_en, url, lat, lon, phone, line_url, hours, zone,"
              " pickup, province, rank, source, facts, website) VALUES ("
              + ",".join([q(x[0]), q(OPERATOR)] + [q(v) for v in x[1:]]) + ");")
    print(json.dumps({f"{p}/{c}": n for (p, c), n in sorted(counts.items())}), file=sys.stderr)


if __name__ == "__main__":
    main()
