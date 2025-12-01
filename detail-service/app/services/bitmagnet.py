from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx
import xmltodict
from fastapi import HTTPException
from httpx import Response

from ..config import settings
from .enrichment import analyze_files


def _bitmagnet_base() -> str:
    return str(settings.bitmagnet_url).rstrip("/")


async def _http_get(url: str, params: dict | None = None) -> Response:
    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp


async def _http_post(url: str, json_body: dict) -> Response:
    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        resp = await client.post(url, json=json_body)
        resp.raise_for_status()
        return resp


async def fetch_torznab(params: dict) -> Response:
    return await _http_get(f"{_bitmagnet_base()}/torznab/", params=params)


async def proxy_graphql(payload: dict) -> Response:
    """
    Transparent GraphQL passthrough to Bitmagnet without caching or raise_for_status.
    """
    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        return await client.post(
            f"{_bitmagnet_base()}/graphql",
            json=payload,
            headers={"Content-Type": "application/json"},
        )


async def _execute_graphql(query: str, variables: dict) -> dict:
    resp = await _http_post(f"{_bitmagnet_base()}/graphql", {"query": query, "variables": variables})
    data = resp.json()
    if data.get("errors"):
        raise HTTPException(status_code=502, detail="Bitmagnet GraphQL returned errors")
    return data


def _first(value: Any) -> Any:
    if isinstance(value, list):
        return value[0] if value else None
    return value


def _safe_int(value: Any) -> int:
    try:
        return int(value)
    except Exception:
        return 0


def _map_graphql_torrent(node: dict) -> dict:
    torrent_node = node.get("torrent") or {}
    info_hash = node.get("infoHash") or node.get("infohash") or torrent_node.get("infoHash")
    title = node.get("title") or node.get("name") or torrent_node.get("name")
    magnet_url = node.get("magnetUri") or torrent_node.get("magnetUri") or node.get("magnet") or node.get("magnetUrl")
    published_at = node.get("publishedAt") or node.get("createdAt") or node.get("pubDate") or torrent_node.get("publishedAt")
    mapped = {
        "infoHash": info_hash,
        "title": title,
        "name": node.get("name") or title,
        "size": _safe_int(node.get("size") or torrent_node.get("size")),
        "category": node.get("category") or node.get("type") or node.get("contentType") or "other",
        "seeders": _safe_int(node.get("seeders") or node.get("seederCount")),
        "leechers": _safe_int(node.get("leechers") or node.get("leecherCount")),
        "publishedAt": published_at,
        "magnetUrl": magnet_url or (f"magnet:?xt=urn:btih:{info_hash}" if info_hash else None),
        "attrs": {},
    }
    if magnet_url:
        mapped["attrs"]["magneturl"] = magnet_url
    file_count = node.get("fileCount") or node.get("filesCount") or torrent_node.get("filesCount")
    if file_count is not None:
        mapped["filesCount"] = file_count
    return mapped


FILES_QUERY = """
query TorrentFiles($infoHash: Hash20!, $limit: Int!, $offset: Int!) {
  torrent {
    files(input: { infoHashes: [$infoHash], limit: $limit, offset: $offset }) {
      items {
        index
        path
        size
      }
    }
  }
}
"""


async def _fetch_files(info_hash: str, batch_size: int = 200) -> List[dict]:
    files: List[dict] = []
    offset = 0
    while True:
        result = await _execute_graphql(FILES_QUERY, {"infoHash": info_hash, "limit": batch_size, "offset": offset})
        items = result.get("data", {}).get("torrent", {}).get("files", {}).get("items", [])
        if not items:
            break
        files.extend(items)
        if len(items) < batch_size:
            break
        offset += batch_size
    return files


TORRENT_QUERY = """
query TorrentByHash($infoHash: Hash20!) {
  torrentContent {
    search(input: { infoHashes: [$infoHash], limit: 1 }) {
      items {
        infoHash
        title
        seeders
        leechers
        publishedAt
        contentType
        torrent {
          name
          size
          filesCount
          magnetUri
        }
      }
    }
  }
}
"""


async def get_torrent_details(info_hash: str) -> Optional[dict]:
    try:
        result = await _execute_graphql(TORRENT_QUERY, {"infoHash": info_hash})
        items = result.get("data", {}).get("torrentContent", {}).get("search", {}).get("items", [])
        if not items:
            return None
        base = _map_graphql_torrent(items[0])
        base["infoHash"] = base.get("infoHash") or info_hash
        files = await _fetch_files(info_hash)
        base["files"] = files
        base["hasFilesInfo"] = bool(files)
        base["fileStats"] = analyze_files(files) if files else {"byType": {}, "totalSize": 0, "largestFile": None, "fileCount": 0}
        return base
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail="Upstream error") from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def enhance_torznab_xml(xml_text: str, base_url: str) -> str:
    parsed = xmltodict.parse(xml_text)
    channel = parsed.get("rss", {}).get("channel", {})
    if isinstance(channel, list):
        channel = channel[0]
    items = channel.get("item", [])
    if isinstance(items, dict):
        items = [items]
    for item in items:
        info_hash = _first(item.get("guid"))
        if not info_hash:
            continue
        existing_comments = item.get("comments") or []
        if isinstance(existing_comments, str):
            existing_comments = [existing_comments]
        if not existing_comments:
            existing_comments = [f"{base_url}/details/{info_hash}"]
        item["comments"] = existing_comments
        attrs = item.get("torznab:attr", [])
        if isinstance(attrs, dict):
            attrs = [attrs]
        attrs.append({"@name": "details", "@value": f"{base_url}/details/{info_hash}"})
        item["torznab:attr"] = attrs
    parsed["rss"]["channel"] = channel
    return xmltodict.unparse(parsed)


def build_base_url(request_headers: dict) -> str:
    protocol = request_headers.get("x-forwarded-proto") or settings.public_protocol
    host = request_headers.get("x-forwarded-host") or request_headers.get("host") or settings.public_host
    return f"{protocol}://{host}"


SEARCH_QUERY = """
query SearchTorrents($query: String!, $limit: Int!, $offset: Int!, $orderBy: [TorrentContentOrderByInput!]) {
  torrentContent {
    search(input: { queryString: $query, limit: $limit, offset: $offset, orderBy: $orderBy }) {
      totalCount
      totalCountIsEstimate
      hasNextPage
      items {
        infoHash
        title
        seeders
        leechers
        publishedAt
        contentType
        torrent {
          name
          size
          filesCount
          magnetUri
        }
      }
    }
  }
}
"""


async def search_torrents(query: str, limit: int = 50, offset: int = 0, sort: str | None = None, descending: bool | None = None) -> Dict[str, Any]:
    order_field = (sort or "relevance").lower()
    allowed = {"relevance", "published_at", "updated_at", "size", "files_count", "seeders", "leechers", "name", "info_hash"}
    if order_field not in allowed:
        order_field = "relevance"
    default_desc = False if order_field == "relevance" else True
    order_by = [{"field": order_field, "descending": default_desc if descending is None else bool(descending)}]
    result = await _execute_graphql(SEARCH_QUERY, {"query": query, "limit": limit, "offset": offset, "orderBy": order_by})
    search_block = result.get("data", {}).get("torrentContent", {}).get("search", {}) or {}
    items = search_block.get("items") or []
    mapped = [_map_graphql_torrent(item) for item in items if item]
    total = (
        search_block.get("totalCount")
        or search_block.get("total")
        or search_block.get("count")
        or len(mapped)
    )
    has_next = search_block.get("hasNextPage")
    return {"items": mapped, "total": total, "hasNextPage": has_next}
