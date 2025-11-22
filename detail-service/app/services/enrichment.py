from __future__ import annotations

import asyncio
import re
from typing import Any, Dict, List

import httpx
import xmltodict

from ..config import settings


def extract_keywords(title: str, category: str | None) -> List[str]:
    keywords: List[str] = []
    year_match = re.search(r"\b(19\d{2}|20\d{2})\b", title)
    if year_match:
        keywords.append(year_match.group(0))

    clean_title = (
        re.sub(r"\[.*?\]|\(.*?\)|【.*?】", " ", title)
        .replace("&", " ")
        .replace("_", " ")
    )
    clean_title = re.sub(
        r"\b(HEVC|x264|x265|H\.264|H\.265|AVC|X264|XVID|DIVX|BluRay|WEB-DL|WEBRip|HDTV|DVDRip|BDRip|AAC|DTS|AC3|MP3|FLAC|PROPER|REPACK|INTERNAL|LIMITED|UNRATED|EXTENDED|HDR)\b",
        " ",
        clean_title,
        flags=re.IGNORECASE,
    )

    def _dedupe(items: List[str]) -> List[str]:
        seen = set()
        ordered: List[str] = []
        for item in items:
            if item and item not in seen:
                ordered.append(item)
                seen.add(item)
        return ordered

    if category in {"movie", "tv"}:
        all_words = [
            word
            for word in re.split(r"[\s\.\-_,:：]+", clean_title)
            if re.match(r"^[A-Z][A-Za-z]+$", word)
        ]
        meaningful = [
            word for word in all_words if not re.match(r"^(FFans|星星|Fans)$", word, re.I)
        ]
        if len(meaningful) >= 2:
            title_candidate = " ".join(meaningful[:4])
            keywords.append(title_candidate)
            keywords.extend([w for w in meaningful[:4] if not re.match(r"^(The|And)$", w, re.I)])
        elif len(meaningful) == 1:
            keywords.append(meaningful[0])

        sequel_patterns = [
            r"\b(Part|Vol|Volume|Chapter|Episode|Season|Series)\s*(\d+|[IVX]+)\b",
            r"\b(II|III|IV|V|VI|VII|VIII|IX|X)\b",
            r"[第]\s*[一二三四五六七八九十\d]+\s*[季部集]",
        ]
        for pattern in sequel_patterns:
            keywords.extend(re.findall(pattern, title, re.IGNORECASE))

    elif category in {"pc-games", "console-games"}:
        version_patterns = [
            r"\b(GOTY|Game of the Year|Deluxe|Ultimate|Complete|Definitive|Enhanced)\b",
            r"\b(v\d+\.\d+|\d+\.\d+\.\d+)\b",
            r"\b(DLC|Expansion|Update)\b",
        ]
        for pattern in version_patterns:
            keywords.extend(re.findall(pattern, clean_title, re.IGNORECASE))
        game_words = [
            w
            for w in re.split(r"[\s\.\-_]+", clean_title)
            if 3 <= len(w) <= 30 and re.search(r"[a-zA-Z]", w)
        ]
        keywords.extend(game_words[:4])

    elif category in {"pc-0day", "pc"}:
        version_match = re.search(r"\b(v?\d+\.\d+[\.\d]*)\b", clean_title, re.I)
        if version_match:
            keywords.append(version_match.group(0))
        software_words = [
            w
            for w in re.split(r"[\s\.\-_]+", clean_title)
            if 2 <= len(w) <= 30 and re.search(r"[a-zA-Z]", w)
        ]
        keywords.extend(software_words[:3])
    else:
        keywords.extend(
            [
                w
                for w in re.split(r"[\s\.\-_]+", clean_title)
                if 3 <= len(w) <= 30 and re.search(r"[a-zA-Z]", w)
            ][:4]
        )

    filtered = [
        k.strip()
        for k in _dedupe(keywords)
        if len(k.strip()) >= 2
        and not re.match(r"^(The|And|For|With|From|Of|In|On|At|By)$", k, re.I)
    ]
    return filtered[:8]


def generate_related_keywords(keywords: List[str], category: str | None, title: str) -> List[str]:
    related = list(keywords)
    if category in {"movie", "tv"}:
        year = next((k for k in keywords if re.match(r"^(19|20)\d{2}$", k)), None)
        if year:
            y = int(year)
            related.extend([str(y - 1), str(y + 1)])
        series_map = {
            "Marvel": ["MCU", "Avengers", "Spider", "Iron Man", "Captain"],
            "DC": ["Batman", "Superman", "Justice League", "Wonder Woman"],
            "Star Wars": ["Skywalker", "Mandalorian", "Jedi", "Sith"],
            "Star Trek": ["Enterprise", "Voyager", "Discovery", "Picard"],
            "Harry Potter": ["Wizarding", "Fantastic Beasts", "Hogwarts"],
            "Lord of the Rings": ["Hobbit", "Middle Earth", "LOTR"],
            "Fast": ["Furious", "Fast and Furious"],
            "Mission Impossible": ["MI", "Impossible"],
        }
        for key, values in series_map.items():
            if key.lower() in title.lower():
                related.extend(values)
    if category in {"pc-games", "console-games"}:
        game_map = {
            "Call of Duty": ["COD", "Modern Warfare", "Black Ops", "Warzone"],
            "Assassin": ["AC", "Creed", "Ubisoft"],
            "Grand Theft Auto": ["GTA", "Rockstar"],
            "Elder Scrolls": ["Skyrim", "Oblivion", "Morrowind", "TES"],
            "Fallout": ["Bethesda", "Wasteland"],
            "Witcher": ["Geralt", "CD Projekt"],
            "Dark Souls": ["Elden Ring", "Bloodborne", "Sekiro", "FromSoftware"],
            "Final Fantasy": ["FF", "Square Enix"],
        }
        for key, values in game_map.items():
            if key.lower() in title.lower():
                related.extend(values)
    deduped = []
    seen = set()
    for item in related:
        if item and item not in seen:
            deduped.append(item)
            seen.add(item)
    return deduped[:10]


def analyze_quality(size: int) -> Dict[str, str]:
    size_gb = size / (1024**3)
    if size_gb < 1:
        return {"quality": "SD", "label": "标清", "color": "#94a3b8"}
    if size_gb < 3:
        return {"quality": "HD", "label": "高清", "color": "#3b82f6"}
    if size_gb < 8:
        return {"quality": "FHD", "label": "全高清", "color": "#8b5cf6"}
    return {"quality": "4K", "label": "超高清", "color": "#f59e0b"}


def calculate_recommendation_score(item: dict) -> float:
    quality_info = analyze_quality(item.get("size", 0))
    quality_score = {"SD": 1, "HD": 2, "FHD": 3, "4K": 4}.get(quality_info["quality"], 1)
    health_score = (item.get("seeders") or 0) * 2 + (item.get("leechers") or 0)
    days_old = 365
    if item.get("publishedAt"):
        try:
            from datetime import datetime

            days_old = (datetime.utcnow() - datetime.fromisoformat(item["publishedAt"])).days
        except Exception:
            pass
    recency_score = max(0, 100 - days_old / 3.65)
    return quality_score * 10 + health_score / 10 + recency_score / 10


FILE_TYPE_ICONS = {
    "video": {"icon": "🎬", "extensions": ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpg", "mpeg", "ts", "m2ts"]},
    "audio": {"icon": "🎵", "extensions": ["mp3", "flac", "wav", "aac", "ogg", "wma", "m4a", "ape", "dts", "ac3"]},
    "subtitle": {"icon": "💬", "extensions": ["srt", "ass", "ssa", "sub", "vtt", "idx", "sup"]},
    "image": {"icon": "🖼️", "extensions": ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"]},
    "document": {"icon": "📄", "extensions": ["pdf", "doc", "docx", "txt", "rtf", "odt"]},
    "archive": {"icon": "📦", "extensions": ["zip", "rar", "7z", "tar", "gz", "bz2"]},
    "other": {"icon": "📁", "extensions": ["nfo", "md", "xml", "json", "exe", "dll"]},
}


def get_file_type(filename: str) -> dict:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    for file_type, config in FILE_TYPE_ICONS.items():
        if ext in config["extensions"]:
            return {"type": file_type, "icon": config["icon"], "ext": ext}
    return {"type": "other", "icon": "📄", "ext": ext}


def analyze_files(files: List[dict]) -> dict:
    stats = {"byType": {}, "totalSize": 0, "largestFile": None, "fileCount": len(files)}
    for file in files:
        info = get_file_type(file.get("path", ""))
        bucket = stats["byType"].setdefault(
            info["type"], {"count": 0, "size": 0, "icon": info["icon"], "files": []}
        )
        bucket["count"] += 1
        bucket["size"] += file.get("size", 0)
        bucket["files"].append(file)
        stats["totalSize"] += file.get("size", 0)
        if not stats["largestFile"] or file.get("size", 0) > stats["largestFile"].get("size", 0):
            stats["largestFile"] = file
    return stats


def extract_image_files(files: List[dict]) -> List[dict]:
    image_exts = {"jpg", "jpeg", "png", "gif", "bmp", "webp"}
    return [f for f in files if f.get("path", "").split(".")[-1].lower() in image_exts][:12]


def extract_images_from_title(title: str, info_hash: str) -> List[dict]:
    images = [
        {"type": "torrent_preview", "url": f"https://btdig.com/search?q={info_hash}", "thumbnail": None, "source": "BTDig"}
    ]
    imdb_match = re.search(r"tt\d{7,8}", title, re.I)
    if imdb_match:
        imdb_id = imdb_match.group(0)
        images.append({"type": "imdb", "url": f"https://www.imdb.com/title/{imdb_id}/", "thumbnail": None, "source": "IMDB"})
    clean = re.sub(r"\[.*?\]|\(.*?\)", "", title).strip()
    if clean:
        images.append(
            {
                "type": "search",
                "url": f"https://www.google.com/search?tbm=isch&q={httpx.QueryParams({'q': clean})['q']}",
                "thumbnail": None,
                "source": "Google Images",
            }
        )
    return images


async def find_related_content(keywords: List[str], info_hash: str, category: str | None, title: str) -> List[Dict[str, Any]]:
    if not keywords:
        return []
    related_keywords = generate_related_keywords(keywords, category, title)
    search_terms = related_keywords[:4]

    async def _search(term: str) -> List[Dict[str, Any]]:
        try:
            params = {"t": "search", "q": term, "limit": 8}
            async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
                resp = await client.get(f"{settings.bitmagnet_url}/torznab/", params=params)
                resp.raise_for_status()
                parsed = xmltodict.parse(resp.text)
            items = parsed.get("rss", {}).get("channel", [{}])[0].get("item", []) if isinstance(parsed.get("rss", {}).get("channel"), list) else parsed.get("rss", {}).get("channel", {}).get("item", [])
            results: List[Dict[str, Any]] = []
            for item in items:
                attrs = item.get("torznab:attr", [])
                if isinstance(attrs, dict):
                    attrs = [attrs]
                results.append(
                    {
                        "infoHash": item.get("guid"),
                        "name": item.get("title"),
                        "size": int(item.get("size", 0)),
                        "publishedAt": item.get("pubDate"),
                        "seeders": int(_find_attr(attrs, "seeders") or 0),
                        "leechers": int(_find_attr(attrs, "peers") or 0),
                    }
                )
            return results
        except Exception:
            return []

    searches = await asyncio.gather(*[_search(term) for term in search_terms])
    all_items: List[Dict[str, Any]] = []
    seen = {info_hash}
    for chunk in searches:
        for item in chunk:
            if not item.get("infoHash") or item["infoHash"] in seen:
                continue
            seen.add(item["infoHash"])
            all_items.append(item)

    def _score(item: Dict[str, Any]) -> int:
        name = (item.get("name") or "").lower()
        score = 0
        for kw in keywords:
            if kw.lower() in name:
                score += 2
        for kw in related_keywords:
            if kw.lower() in name:
                score += 1
        return score

    return sorted(all_items, key=_score, reverse=True)[:12]


def _find_attr(attrs: list, name: str) -> str | None:
    for attr in attrs:
        if attr.get("@name") == name or attr.get("$", {}).get("name") == name:
            return attr.get("@value") or attr.get("$", {}).get("value")
    return None
