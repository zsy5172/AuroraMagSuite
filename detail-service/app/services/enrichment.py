from __future__ import annotations

from typing import Dict, List


FILE_TYPE_EXTS = {
    "video": {"icon": "🎬", "extensions": {"mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpg", "mpeg", "ts", "m2ts"}},
    "audio": {"icon": "🎵", "extensions": {"mp3", "flac", "wav", "aac", "ogg", "wma", "m4a", "ape", "dts", "ac3"}},
    "subtitle": {"icon": "💬", "extensions": {"srt", "ass", "ssa", "sub", "vtt", "idx", "sup"}},
    "image": {"icon": "🖼️", "extensions": {"jpg", "jpeg", "png", "gif", "bmp", "webp"}},
    "archive": {"icon": "📦", "extensions": {"zip", "rar", "7z", "tar", "gz", "bz2"}},
}


def _file_type(path: str) -> dict:
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    for type_name, config in FILE_TYPE_EXTS.items():
        if ext in config["extensions"]:
            return {"type": type_name, "icon": config["icon"], "ext": ext}
    return {"type": "other", "icon": "📄", "ext": ext}


def analyze_files(files: List[dict]) -> Dict[str, object]:
    stats = {"byType": {}, "totalSize": 0, "largestFile": None, "fileCount": len(files)}
    for file in files:
        info = _file_type(file.get("path", ""))
        bucket = stats["byType"].setdefault(info["type"], {"count": 0, "size": 0, "icon": info["icon"], "files": []})
        bucket["count"] += 1
        bucket["size"] += file.get("size", 0)
        bucket["files"].append(file)
        stats["totalSize"] += file.get("size", 0)
        if not stats["largestFile"] or file.get("size", 0) > stats["largestFile"].get("size", 0):
            stats["largestFile"] = file
    return stats
