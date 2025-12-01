from app.services.enrichment import analyze_files


def test_analyze_files_groups_by_type():
    files = [
        {"path": "movie.mkv", "size": 1024},
        {"path": "subs/movie.srt", "size": 10},
    ]
    stats = analyze_files(files)
    assert stats["byType"]["video"]["count"] == 1
    assert stats["byType"]["subtitle"]["count"] == 1
