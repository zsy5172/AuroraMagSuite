# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AuroraMag Suite is a torrent search system consisting of two microservices that integrate with Bitmagnet as the single source of truth. The system provides a clean search UI and a Torznab proxy that surfaces Bitmagnet data without third-party metadata calls.

**Architecture Philosophy:**
- Bitmagnet is the sole data source; no separate business database
- All services communicate through Bitmagnet's GraphQL and Torznab APIs
- Backend stays lean: no TMDB/Douban calls or local caching
- Frontend uses backend `/api/search` and `/details` endpoints with a minimal Vue UI

## Common Development Commands

### Local Development

**Start both services in development mode:**
```bash
./start.sh
# Backend: http://localhost:3337
# Frontend: http://localhost:3336
```

**Start services individually:**
```bash
# Backend (FastAPI with hot reload)
cd detail-service && ./start.sh
# or manually:
cd detail-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 3337 --reload

# Frontend (Vite dev server)
cd search-service && ./start.sh
# or manually:
cd search-service
npm install
npm run dev -- --host --port 3336
```

### Testing

**Run backend tests:**
```bash
cd detail-service
pytest
# or with specific test:
pytest tests/test_bitmagnet.py
pytest tests/test_enrichment.py
```

### Docker

**Build and run with Docker Compose:**
```bash
docker compose up --build
# or in background:
docker compose up -d --build
```

**Rebuild specific service:**
```bash
docker compose up --build backend
docker compose up --build frontend
```

## Configuration

All configuration is centralized in `.env` at the repository root. Copy `.env.example` to `.env` and configure:

**Required (must be set):**
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` - Database connection for Bitmagnet

**Backend defaults (safe to override):**
- `BITMAGNET_URL` - Bitmagnet service endpoint (default: `http://host.docker.internal:3333`)
- `PUBLIC_HOST` / `PUBLIC_PROTOCOL` - Used to generate detail page URLs in Torznab responses
- `REQUEST_TIMEOUT` - HTTP request timeout in seconds
- `TMDB_API_KEY` - Optional, passed through to Bitmagnet if present

**Frontend environment:**
- `VITE_BACKEND_URL` - Backend API endpoint

## High-Level Architecture

### Service Structure

```
AuroraMagSuite/
├── detail-service/         # FastAPI backend (port 3337)
│   ├── app/
│   │   ├── main.py        # FastAPI app, routes for /torznab, /api/details, /details
│   │   ├── config.py      # Settings loaded from .env via pydantic-settings
│   │   ├── services/
│   │   │   ├── bitmagnet.py     # GraphQL queries, Torznab proxy, XML enhancement
│   │   │   └── enrichment.py    # File grouping helpers
│   │   └── templates/     # Jinja2 templates for HTML detail pages
│   └── tests/             # pytest with respx for HTTP mocking
│
├── search-service/         # Vue + Vite frontend
│   ├── src/
│   │   ├── App.vue        # Main search UI component
│   │   ├── api.ts         # REST calls to backend /api/search
│   │   └── style.css      # Minimal styling + theme switches
│
└── docker-compose.yml      # Orchestrates bitmagnet, backend, frontend
```

### Data Flow

1. **Search Flow:**
   - User searches in the Vue UI
   - Frontend hits backend `/api/search` (proxied by Vite dev server)
   - Backend calls Bitmagnet GraphQL search with limit/offset and returns nodes + totalCount

2. **Torznab Enhancement Flow:**
   - External client queries `/torznab/` on `detail-service`
   - Backend fetches from Bitmagnet Torznab API
   - XML response enhanced with detail page links (`/details/{infoHash}`)
   - Returns enriched XML to client

3. **Detail Page Flow:**
   - User/client accesses `/details/{infoHash}` (HTML) or `/api/details/{infoHash}` (JSON)
   - Backend queries Bitmagnet GraphQL for torrent metadata
   - Fetches file list via GraphQL pagination and computes basic file stats
   - Returns Bitmagnet-native data (no TMDB/Douban enrichment)

### Key Backend Components

**`detail-service/app/services/bitmagnet.py`:**
- `fetch_torznab()` - Proxies Bitmagnet Torznab API
- `enhance_torznab_xml()` - Injects detail links into XML using xmltodict
- `search_torrents()` - GraphQL search wrapper returning nodes/total
- `get_torrent_details()` - GraphQL lookup + file pagination + file stats
- `build_base_url()` - Constructs public detail URL from headers or settings

**`detail-service/app/services/enrichment.py`:**
- `analyze_files()` - Categorizes files by type and size

### Key Frontend Components

**`search-service/src/api.ts`:**
- `searchTorrents()` - Fetch wrapper to backend `/api/search`
- `magnetLink()` - Builds magnet link fallback

**`search-service/src/App.vue`:**
- Search UI with Element Plus components, infinite scroll via IntersectionObserver
- Theme toggles (auto by time + manual) switching Element Plus light/dark

## Development Notes

### Backend (detail-service)

- FastAPI with async/await throughout
- All external HTTP calls use `httpx.AsyncClient`
- Configuration via `pydantic-settings` automatically loads from `.env`
- XML manipulation uses `xmltodict` for easy dict-based editing
- HTML templates use Jinja2 in `app/templates/`

**Testing:**
- pytest with `pytest-asyncio` for async tests
- `respx` for mocking HTTP responses
- Run tests with `pytest` from `detail-service/` directory

### Frontend (search-service)

- Vue 3 + TypeScript + Vite
- Element Plus UI kit with built-in dark theme CSS vars
- IntersectionObserver for infinite scroll; native fetch for data
- Theme switching via `document.documentElement.classList.toggle('dark')`

### Bitmagnet Integration

Bitmagnet (ghcr.io/bitmagnet-io/bitmagnet:latest) runs in `network_mode: host` and provides:
- GraphQL API at `http://localhost:3333/graphql`
- Torznab API at `http://localhost:3333/torznab/`
- Requires PostgreSQL connection via `POSTGRES_*` environment variables
- Requires `TMDB_API_KEY` for its own metadata enrichment
- Runs with `worker run --keys=http_server,queue_server,dht_crawler`

### Caching Strategy

- No frontend image proxy; backend avoids local caches and third-party metadata
