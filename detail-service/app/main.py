from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from fastapi.templating import Jinja2Templates
from httpx import HTTPStatusError

from .config import settings
from .services import bitmagnet

app = FastAPI(title="AuroraMag Detail Proxy", version="3.0.0")

templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/torznab/", response_class=Response)
@app.get("/torznab/api", response_class=Response)
async def torznab_proxy(request: Request):
    params = dict(request.query_params)
    try:
        upstream = await bitmagnet.fetch_torznab(params)
    except HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail="Bitmagnet Torznab error") from exc
    except HTTPException as exc:
        raise exc
    xml_text = upstream.text
    if params.get("t") in {"search", "movie-search", "tv-search"}:
        base_url = bitmagnet.build_base_url(dict(request.headers))
        xml_text = bitmagnet.enhance_torznab_xml(xml_text, base_url)
    return Response(content=xml_text, media_type="application/xml")


@app.get("/api/details/{info_hash}")
async def details_json(info_hash: str):
    details = await bitmagnet.get_torrent_details(info_hash)
    if not details:
        raise HTTPException(status_code=404, detail="Torrent not found")
    return details


@app.get("/details/{info_hash}", response_class=HTMLResponse)
async def details_html(request: Request, info_hash: str):
    details = await bitmagnet.get_torrent_details(info_hash)
    if not details:
        raise HTTPException(status_code=404, detail="Torrent not found")
    return templates.TemplateResponse(
        "details.html",
        {
            "request": request,
            "details": details,
            "public_host": settings.public_host,
            "public_protocol": settings.public_protocol,
        },
    )


@app.post("/graphql")
async def graphql_proxy(body: dict):
    resp = await bitmagnet.proxy_graphql(body)
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


@app.get("/api/search")
async def search_endpoint(q: str, limit: int = 50, offset: int = 0, sort: str | None = None, descending: bool | None = None):
    search_result = await bitmagnet.search_torrents(q, limit, offset, sort=sort, descending=descending)
    items = search_result.get("items", [])
    total = search_result.get("total") or 0
    has_next = search_result.get("hasNextPage")
    return {
        "totalCount": total,
        "edges": [{"node": item} for item in items],
        "hasMore": has_next if has_next is not None else (offset + len(items)) < total,
    }
