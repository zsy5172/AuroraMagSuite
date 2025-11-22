#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "🔥 Starting AuroraMag backend (FastAPI) and frontend (Vite dev) in debug mode..."

(
  cd "$ROOT/detail-service"
  if [ -d ".venv" ]; then
    # shellcheck disable=SC1091
    source .venv/bin/activate
  fi
  pip install -r requirements.txt
  uvicorn app.main:app --host 0.0.0.0 --port 3337 --reload
) &
BACKEND_PID=$!

(
  cd "$ROOT/search-service"
  npm install
  npm run dev -- --host
) &
FRONTEND_PID=$!

trap 'echo "Stopping..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true' EXIT

echo "✅ Backend on http://localhost:3337"
echo "✅ Frontend on http://localhost:3336 (media proxy 3335)"
echo "ℹ️ Ensure Bitmagnet is running at \$BITMAGNET_URL (${BITMAGNET_URL:-http://localhost:3333})"

wait $BACKEND_PID $FRONTEND_PID
