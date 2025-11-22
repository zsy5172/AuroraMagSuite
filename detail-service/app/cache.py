from __future__ import annotations

from cachetools import TTLCache

from .config import settings


def _make_cache(ttl: int) -> TTLCache:
    return TTLCache(maxsize=settings.cache_maxsize, ttl=ttl)


tmdb_cache = _make_cache(settings.tmdb_cache_ttl)
graphql_cache = _make_cache(settings.graphql_cache_ttl)
details_cache = _make_cache(settings.details_cache_ttl)
douban_cache = _make_cache(settings.douban_cache_ttl)

cache_hits = {
    "tmdb": 0,
    "graphql": 0,
    "details": 0,
    "douban": 0,
}
cache_misses = {
    "tmdb": 0,
    "graphql": 0,
    "details": 0,
    "douban": 0,
}


def clear_all() -> None:
    for cache in (tmdb_cache, graphql_cache, details_cache, douban_cache):
        cache.clear()
    for bucket in (cache_hits, cache_misses):
        for key in bucket:
            bucket[key] = 0


def stats() -> dict:
    return {
        "tmdb": {"hits": cache_hits["tmdb"], "misses": cache_misses["tmdb"]},
        "graphql": {"hits": cache_hits["graphql"], "misses": cache_misses["graphql"]},
        "details": {"hits": cache_hits["details"], "misses": cache_misses["details"]},
        "douban": {"hits": cache_hits["douban"], "misses": cache_misses["douban"]},
    }
