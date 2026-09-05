"""
iptrap — a small research honeypot.

Serves a React SPA with two pages:
  /       — visitor-facing landing page ("Hello visitor, your details are....")
  /admin  — password-gated table of captured visits + CSV download

Every load of "/" logs the visitor's IP, headers, and best-effort
geolocation to SQLite. Two small JSON/CSV API endpoints back the /admin
page's data table and download button — the browser has to ask the
server for that data after the password is entered, there's no way
around that for a real password-gated view.

Intended use: security research / honeypot telemetry on infrastructure
you control and are authorized to monitor. Do not point this at a third
party without their knowledge or consent.
"""

import csv
import io
import json
import os
import sqlite3
import time
from contextlib import closing
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")
GEO_LOOKUP_ENABLED = os.environ.get("GEO_LOOKUP_ENABLED", "true").lower() == "true"
GEO_CACHE_TTL_SECONDS = int(os.environ.get("GEO_CACHE_TTL_SECONDS", "86400"))

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "visitors.db"

FRONTEND_DIST = Path(__file__).parent / "frontend" / "dist"

app = FastAPI()


# --------------------------------------------------------------------------
# storage
# --------------------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with closing(get_db()) as conn, conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS visits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts REAL NOT NULL,
                ip TEXT,
                forwarded_for TEXT,
                user_agent TEXT,
                accept_language TEXT,
                referer TEXT,
                headers_json TEXT,
                geo_country TEXT,
                geo_region TEXT,
                geo_city TEXT,
                geo_zip TEXT,
                geo_lat REAL,
                geo_lon REAL,
                geo_isp TEXT,
                geo_org TEXT,
                geo_as TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS geo_cache (
                ip TEXT PRIMARY KEY,
                json TEXT NOT NULL,
                fetched_at REAL NOT NULL
            )
            """
        )


init_db()


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def client_ip(request: Request) -> tuple[str, str]:
    """Returns (best_guess_ip, raw_x_forwarded_for_header)."""
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        # left-most entry is the original client in a standard proxy chain
        return xff.split(",")[0].strip(), xff
    return (request.client.host if request.client else ""), ""


def lookup_geo(ip: str) -> dict:
    if not GEO_LOOKUP_ENABLED or not ip:
        return {}

    with closing(get_db()) as conn:
        row = conn.execute(
            "SELECT json, fetched_at FROM geo_cache WHERE ip = ?", (ip,)
        ).fetchone()
        if row and (time.time() - row["fetched_at"]) < GEO_CACHE_TTL_SECONDS:
            return json.loads(row["json"])

    geo = {}
    try:
        resp = httpx.get(
            f"http://ip-api.com/json/{ip}",
            params={
                "fields": "status,message,country,regionName,city,zip,lat,lon,isp,org,as,query"
            },
            timeout=3.0,
        )
        payload = resp.json()
        if payload.get("status") == "success":
            geo = payload
    except Exception:
        geo = {}

    with closing(get_db()) as conn, conn:
        conn.execute(
            "INSERT INTO geo_cache (ip, json, fetched_at) VALUES (?, ?, ?) "
            "ON CONFLICT(ip) DO UPDATE SET json=excluded.json, fetched_at=excluded.fetched_at",
            (ip, json.dumps(geo), time.time()),
        )

    return geo


def build_visit_row(request: Request) -> dict:
    ip, xff = client_ip(request)
    geo = lookup_geo(ip)
    headers = dict(request.headers)

    return {
        "ts": time.time(),
        "ip": ip,
        "forwarded_for": xff,
        "user_agent": headers.get("user-agent", ""),
        "accept_language": headers.get("accept-language", ""),
        "referer": headers.get("referer", ""),
        "headers_json": json.dumps(headers),
        "geo_country": geo.get("country", ""),
        "geo_region": geo.get("regionName", ""),
        "geo_city": geo.get("city", ""),
        "geo_zip": geo.get("zip", ""),
        "geo_lat": geo.get("lat"),
        "geo_lon": geo.get("lon"),
        "geo_isp": geo.get("isp", ""),
        "geo_org": geo.get("org", ""),
        "geo_as": geo.get("as", ""),
    }


def record_visit(request: Request) -> None:
    row = build_visit_row(request)

    with closing(get_db()) as conn, conn:
        conn.execute(
            """
            INSERT INTO visits (
                ts, ip, forwarded_for, user_agent, accept_language, referer,
                headers_json, geo_country, geo_region, geo_city, geo_zip,
                geo_lat, geo_lon, geo_isp, geo_org, geo_as
            ) VALUES (
                :ts, :ip, :forwarded_for, :user_agent, :accept_language, :referer,
                :headers_json, :geo_country, :geo_region, :geo_city, :geo_zip,
                :geo_lat, :geo_lon, :geo_isp, :geo_org, :geo_as
            )
            """,
            row,
        )


def check_admin(request: Request) -> bool:
    if not ADMIN_TOKEN:
        return False
    auth = request.headers.get("authorization", "")
    supplied = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not supplied:
        supplied = request.query_params.get("token", "")
    return supplied == ADMIN_TOKEN


# --------------------------------------------------------------------------
# API routes
# --------------------------------------------------------------------------

@app.get("/api/me")
async def me(request: Request):
    """Returns the caller's own captured info — no admin token needed,
    this just shows a visitor what we saw about them, same idea as any
    "what's my IP" page. Does not write to the visits table; the "/"
    route already logged this visit."""
    row = build_visit_row(request)
    return JSONResponse(
        {
            "ip": row["ip"],
            "user_agent": row["user_agent"],
            "language": row["accept_language"],
            "referer": row["referer"],
            "geo": {
                "country": row["geo_country"],
                "region": row["geo_region"],
                "city": row["geo_city"],
                "zip": row["geo_zip"],
                "lat": row["geo_lat"],
                "lon": row["geo_lon"],
                "isp": row["geo_isp"],
                "org": row["geo_org"],
                "as": row["geo_as"],
            },
        }
    )


@app.get("/api/admin/visits")
async def admin_visits(request: Request):
    if not check_admin(request):
        return PlainTextResponse("forbidden", status_code=403)
    with closing(get_db()) as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM visits ORDER BY ts DESC LIMIT 1000")]
    return JSONResponse(rows)


@app.get("/api/admin/export.csv")
async def admin_export_csv(request: Request):
    if not check_admin(request):
        return PlainTextResponse("forbidden", status_code=403)
    with closing(get_db()) as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM visits ORDER BY ts DESC")]

    buf = io.StringIO()
    if rows:
        writer = csv.DictWriter(buf, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=visitors.csv"},
    )


@app.get("/healthz")
async def healthz():
    return {"ok": True}


# --------------------------------------------------------------------------
# static frontend (React build) + the two visitor-facing pages
# --------------------------------------------------------------------------

if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


def serve_index() -> FileResponse:
    return FileResponse(FRONTEND_DIST / "index.html")


@app.get("/")
async def root(request: Request):
    record_visit(request)
    return serve_index()


@app.get("/admin")
async def admin_page():
    # No visit logging here — this is the operator's own page, not visitor traffic.
    return serve_index()
