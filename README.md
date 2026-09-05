---
title: iptrap
emoji: 🕸️
colorFrom: gray
colorTo: red
sdk: docker
app_port: 7860
pinned: false
---

# iptrap

A minimal research honeypot with a React (Vite) frontend and a FastAPI
backend. Two pages:

- **`/`** — the visitor-facing landing page ("Hello visitor, your details
  are…."). Every load logs the visitor's IP address, best-effort
  geolocation (via ip-api.com), user agent, `Accept-Language`, referer,
  and full request headers to a local SQLite database.
- **`/admin`** — password-gated. Shows a table of everything captured so
  far, with a **Download CSV** button.

The password gate and table live in the React app, but the actual
protection is enforced server-side by two small API endpoints the
`/admin` page calls once you've entered the password — there's no way to
gate dynamic, fetched data purely on the client, so these two endpoints
are unavoidable:

- `GET /api/admin/visits` — JSON array of captured rows. Requires
  `Authorization: Bearer <ADMIN_TOKEN>`.
- `GET /api/admin/export.csv` — CSV download of the same data. Accepts
  the token as `?token=...` (used directly as a download link) or the
  same bearer header.

`GET /healthz` also exists as a container liveness check.

**Intended use:** security research / honeypot telemetry on
infrastructure you control and are authorized to monitor (e.g. observing
scanners/bots, CTF instrumentation). Do not use this to track a specific
individual without their knowledge or consent.

## Project layout

```
app.py              FastAPI backend: visit logging, geo lookup, admin API, serves the built SPA
frontend/           React (Vite) app — Landing.jsx ("/") and Admin.jsx ("/admin")
Dockerfile           multi-stage: builds the frontend with Node, then runs it with Python/uvicorn
```

## Configuration

All backend config comes from environment variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `ADMIN_TOKEN` | The `/admin` password. Generate a long random value. |
| `GEO_LOOKUP_ENABLED` | `true`/`false` — disable to skip the outbound geo lookup call. |
| `GEO_CACHE_TTL_SECONDS` | How long to cache a geo lookup per IP before refetching. |
| `DATA_DIR` | Where the SQLite DB is written. Defaults to `data/` locally, `/app/data` in Docker. |

## ⚠️ Storage is ephemeral on Hugging Face Spaces (free tier)

The container filesystem — and therefore `data/visitors.db` — resets
whenever the Space restarts, sleeps, or is rebuilt. Download the CSV
periodically from `/admin` if you need to keep it, or attach a Space's
persistent storage add-on for durability.

## Deploying to Hugging Face Spaces

1. Create a new Space with **SDK: Docker**.
2. Push this repo to it (see below) — the Dockerfile builds the React
   frontend and the Python backend together, no separate build step
   needed on your end.
3. In the Space's **Settings → Variables and secrets**, add `ADMIN_TOKEN`
   (and any other vars from `.env.example`) as **secrets** — do not commit
   your real `.env` file to git.

```bash
git remote add space https://huggingface.co/spaces/<your-username>/<space-name>
git push space main
```

## Local development

Two processes, run side by side:

```bash
# backend
cp .env.example .env   # then fill in ADMIN_TOKEN
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 7860

# frontend (separate terminal) — proxies /api to the backend above
cd frontend
npm install
npm run dev   # opens on http://127.0.0.1:5173
```

For a production-like local test (single process, built frontend served
by FastAPI):

```bash
cd frontend && npm install && npm run build && cd ..
source .venv/bin/activate
uvicorn app:app --port 7860   # now open http://127.0.0.1:7860
```
