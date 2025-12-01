import re

import respx
from httpx import Response
import pytest

from app.services.bitmagnet import get_torrent_details, search_torrents


@pytest.mark.asyncio
@respx.mock
async def test_get_torrent_details_parses_basic_fields():
    # Arrange mocked graphql responses (summary + files)
    summary_payload = {
        "data": {
            "torrentContent": {
                "search": {
                    "items": [
                        {
                            "infoHash": "abc123",
                            "name": "Example Movie 2024",
                            "title": "Example Movie 2024",
                            "publishedAt": "2024-01-01T00:00:00Z",
                            "seeders": 10,
                            "leechers": 2,
                            "torrent": {
                                "name": "Example Movie 2024",
                                "size": 1073741824,
                                "magnetUri": "magnet:?xt=urn:btih:abc123",
                            },
                        }
                    ]
                }
            }
        }
    }
    files_payload = {
        "data": {
            "torrent": {
                "files": {
                    "items": [
                        {"index": 0, "path": "movie.mkv", "size": 1024},
                    ]
                }
            }
        }
    }
    respx.post(re.compile(r".*/graphql")).mock(side_effect=[Response(200, json=summary_payload), Response(200, json=files_payload)])

    # Act
    details = await get_torrent_details("abc123")

    # Assert
    assert details["infoHash"] == "abc123"
    assert details["title"] == "Example Movie 2024"
    assert details["magnetUrl"].startswith("magnet:")
    assert details["files"][0]["path"] == "movie.mkv"


@pytest.mark.asyncio
@respx.mock
async def test_search_torrents_maps_graphql_items():
    graphql_payload = {
        "data": {
            "torrentContent": {
                "search": {
                    "total": 2,
                    "items": [
                        {
                            "infoHash": "abc123",
                            "title": "Example A",
                            "seeders": 5,
                            "leechers": 1,
                            "torrent": {
                                "name": "Example A",
                                "size": 2048,
                                "magnetUri": "magnet:?xt=urn:btih:abc123",
                            },
                        },
                        {
                            "infoHash": "def456",
                            "title": "Example B",
                            "seeders": 2,
                            "leechers": 3,
                            "torrent": {
                                "name": "Example B",
                                "size": 4096,
                                "magnetUri": "magnet:?xt=urn:btih:def456",
                            },
                        },
                    ],
                }
            }
        }
    }
    respx.post(re.compile(r".*/graphql")).mock(return_value=Response(200, json=graphql_payload))

    result = await search_torrents("test", limit=2, offset=0)

    assert result["total"] == 2
    assert len(result["items"]) == 2
    assert result["items"][0]["infoHash"] == "abc123"
    assert result["items"][0]["magnetUrl"].endswith("abc123")
