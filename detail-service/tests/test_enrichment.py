import pytest

from app.services.enrichment import analyze_files, extract_keywords


def test_extract_keywords_movie():
    title = "Inception 2010 1080p BluRay x264"
    keywords = extract_keywords(title, "movie")
    assert "2010" in keywords
    assert any("Inception" in kw for kw in keywords)


def test_analyze_files_groups_by_type():
    files = [
        {"path": "movie.mkv", "size": 1024},
        {"path": "subs/movie.srt", "size": 10},
    ]
    stats = analyze_files(files)
    assert stats["byType"]["video"]["count"] == 1
    assert stats["byType"]["subtitle"]["count"] == 1
