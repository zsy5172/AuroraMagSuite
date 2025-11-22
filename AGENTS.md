# Repository Guidelines

## Project Structure & Module Organization
- `detail-service/`: FastAPI backend (Torznab proxy + details), tests in `detail-service/tests/`, config in `app/config.py`, templates in `app/templates/`.
- `search-service/`: React + Vite frontend with media proxy (`proxy-server/`), UI code in `src/`.
- `doc/`: Current docs (`features.md`, `build.md`, `run.md`, `roadmap.md`); `doc/archive/` holds historical notes.
- `docker-compose.yml`, `start.sh`: one-command local/dev orchestration; `.env.example` lists all config knobs.

## Build, Test, and Development Commands
- Backend dev: `cd detail-service && ./start.sh` (venv + uvicorn --reload on :3337).
- Backend tests: `cd detail-service && pytest`.
- Frontend dev: `cd search-service && npm install && npm run dev -- --host` (Vite :3336 + media proxy :3335).
- Frontend build: `cd search-service && npm run build && npm run preview`.
- Full dev (front+back): `./start.sh` at repo root.
- Docker Compose: `docker compose up --build` (includes bitmagnet; bring your own Postgres).

## Coding Style & Naming Conventions
- Python: 4-space indent, Pydantic/FastAPI style; keep modules small and async-first. Prefer explicit env settings via `Settings` in `app/config.py`.
- JS/TSX: 2-space indent, functional React components, hooks + React Query. Avoid inline styles unless theming; keep proxy endpoints under `/media/*`.
- Naming: snake_case for Python, camelCase for JS; configs uppercase env keys. Keep tests named `test_*.py`.

## Testing Guidelines
- Frameworks: `pytest`, `pytest-asyncio`, `respx` for HTTP mocking.
- Scope: cover API helpers, enrichment logic, and config validation; add regression tests beside `detail-service/tests/`.
- Run: `cd detail-service && pytest`; ensure new network calls are mocked and caches cleared where relevant.

## Commit & Pull Request Guidelines
- Commits: short, imperative summaries (e.g., “Add TMDB cache guard”); group related changes.
- PRs: describe scope, motivation, and test results (`pytest`, `npm run build` as applicable); link issues/tickets; include screenshots or curl examples for UI/API-visible changes.

## Security & Configuration Tips
- Copy `.env.example` to `.env`; fill `POSTGRES_*` and `TMDB_API_KEY` as needed. Avoid committing secrets.
- Backend defaults allow running without TMDB, but Bitmagnet requires reachable Postgres and outbound network.
