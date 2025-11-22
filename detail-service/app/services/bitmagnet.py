from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

import httpx
import xmltodict
from fastapi import HTTPException
from httpx import Response

from .. import cache
from ..config import settings
from .enrichment import (
    analyze_files,
    analyze_quality,
    calculate_recommendation_score,
    extract_image_files,
    extract_images_from_title,
    extract_keywords,
    find_related_content,
)


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


async def graphql_cached(query: str, variables: dict | None = None) -> dict:
    variables = variables or {}
    key = json.dumps({"query": query, "variables": variables}, sort_keys=True)
    cached = cache.graphql_cache.get(key)
    if cached:
        cache.cache_hits["graphql"] += 1
        return cached
    cache.cache_misses["graphql"] += 1
    resp = await _http_post(f"{_bitmagnet_base()}/graphql", {"query": query, "variables": variables})
    data = resp.json()
    cache.graphql_cache[key] = data
    return data


async def fetch_tmdb_movie(tmdb_id: str, language: str = "zh-CN") -> Optional[dict]:
    if not settings.tmdb_api_key:
        return None
    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"
    params = {
        "api_key": settings.tmdb_api_key,
        "language": language,
        "append_to_response": "credits,images,videos",
    }
    cache_key = json.dumps({"url": url, "params": params}, sort_keys=True)
    cached = cache.tmdb_cache.get(cache_key)
    if cached:
        cache.cache_hits["tmdb"] += 1
        return cached
    cache.cache_misses["tmdb"] += 1
    resp = await _http_get(url, params=params)
    data = resp.json()
    cache.tmdb_cache[cache_key] = data
    return data


async def fetch_douban(title: str, year: str | None) -> Optional[dict]:
    cache_key = f"{title}:{year}"
    cached = cache.douban_cache.get(cache_key)
    if cached:
        cache.cache_hits["douban"] += 1
        return cached
    cache.cache_misses["douban"] += 1
    search_params = {"q": title}
    if year:
        search_params["year"] = year
    try:
        resp = await _http_get("https://frodo.douban.com/api/v2/search/movie", params=search_params)
        data = resp.json()
        subjects = data.get("items") or data.get("subjects") or []
        if not subjects:
            return None
        top = subjects[0]
        detail = {
            "title": top.get("title"),
            "rating": top.get("rating", {}).get("value"),
            "rating_count": top.get("rating", {}).get("count"),
            "year": top.get("year"),
            "url": top.get("url"),
            "id": top.get("id"),
        }
        cache.douban_cache[cache_key] = detail
        return detail
    except Exception:
        return None


def _parse_torznab_items(xml_text: str) -> List[dict]:
    parsed = xmltodict.parse(xml_text)
    channel = parsed.get("rss", {}).get("channel", {})
    if isinstance(channel, list):
        channel = channel[0]
    items = channel.get("item", [])
    if isinstance(items, dict):
        items = [items]
    return items


def _first(value: Any) -> Any:
    if isinstance(value, list):
        return value[0] if value else None
    return value


def _parse_item_attrs(item: dict) -> dict:
    attrs = {}
    for attr in item.get("torznab:attr", []) or []:
        if isinstance(attr, dict):
            name = attr.get("@name") or attr.get("$", {}).get("name")
            value = attr.get("@value") or attr.get("$", {}).get("value")
            if name:
                attrs[name] = value
    return attrs


async def get_torrent_details(info_hash: str) -> Optional[dict]:
    cached = cache.details_cache.get(info_hash)
    if cached:
        cache.cache_hits["details"] += 1
        return cached
    cache.cache_misses["details"] += 1
    try:
        resp = await _http_get(f"{_bitmagnet_base()}/torznab/", params={"t": "search", "q": info_hash})
        items = _parse_torznab_items(resp.text)
        if not items:
            return None
        item = items[0]
        attrs = _parse_item_attrs(item)
        enclosure = _first(item.get("enclosure")) or {}
        magnet = enclosure.get("@url") if isinstance(enclosure, dict) else None
        category_value = _first(item.get("category")) or "other"
        torrent_data: Dict[str, Any] = {
            "infoHash": info_hash,
            "title": _first(item.get("title")),
            "size": int(_first(item.get("size")) or 0),
            "magnetUrl": magnet,
            "category": category_value or "other",
            "pubDate": _first(item.get("pubDate")),
            "attrs": attrs,
            "files": [],
        }

        keywords = extract_keywords(torrent_data["title"] or "", torrent_data["category"])
        if keywords:
            related = await find_related_content(keywords, info_hash, torrent_data["category"], torrent_data["title"] or "")
            if related:
                torrent_data["relatedContent"] = [
                    {**r, "qualityInfo": analyze_quality(r.get("size", 0)), "score": calculate_recommendation_score(r)}
                    for r in related
                ]

        files_query = """
        query GetFiles($infoHash: Hash20!) {
          torrent {
            files(input: { infoHashes: [$infoHash] }) {
              totalCount
              items {
                index
                path
                size
              }
            }
          }
        }
        """
        try:
            files_result = await graphql_cached(files_query, {"infoHash": info_hash})
            items = files_result.get("data", {}).get("torrent", {}).get("files", {}).get("items", [])
            if items:
                torrent_data["files"] = items
                torrent_data["hasFilesInfo"] = True
                torrent_data["fileStats"] = analyze_files(items)
                torrent_data["imageFiles"] = extract_image_files(items)
            else:
                torrent_data["hasFilesInfo"] = False
                torrent_data["imageFiles"] = []
        except Exception:
            torrent_data["hasFilesInfo"] = False
            torrent_data["imageFiles"] = []

        torrent_data["alternativeImages"] = extract_images_from_title(torrent_data["title"] or "", info_hash)

        tmdb_id = attrs.get("tmdb") or attrs.get("tmdbid")
        if tmdb_id and torrent_data["category"] == "movie":
            tmdb_data = await fetch_tmdb_movie(tmdb_id, language="zh-CN") or await fetch_tmdb_movie(tmdb_id, language="en-US")
            if tmdb_data and not tmdb_data.get("status_code"):
                torrent_data["tmdb"] = tmdb_data

        if torrent_data["category"] in {"movie", "tv"}:
            year_match = None
            if torrent_data.get("title"):
                year_match = re.search(r"(19\\d{2}|20\\d{2})", torrent_data["title"])
            year_from_tmdb = (
                torrent_data.get("tmdb", {}).get("release_date", "")[:4]
                if torrent_data.get("tmdb", {}).get("release_date")
                else None
            )
            year_value = year_from_tmdb or (year_match.group(0) if year_match else None)
            douban_data = await fetch_douban(torrent_data.get("title") or "", year_value)
            if douban_data:
                torrent_data["douban"] = douban_data

        cache.details_cache[info_hash] = torrent_data
        return torrent_data
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail="Upstream error") from exc
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


def cache_stats() -> dict:
    return cache.stats()


def clear_cache() -> None:
    cache.clear_all()
