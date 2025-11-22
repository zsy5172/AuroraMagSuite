#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate

pip install -r requirements.txt

echo "🚀 Starting AuroraMag Detail Proxy (FastAPI) on :3337"
uvicorn app.main:app --host 0.0.0.0 --port 3337 --reload
