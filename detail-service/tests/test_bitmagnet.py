import re

import respx
from httpx import Response
import pytest

from app.config import settings
from app.services.bitmagnet import get_torrent_details
from app import cache as cache_store


@pytest.mark.asyncio
@respx.mock
async def test_get_torrent_details_parses_basic_fields():
    # Arrange mocked torznab and graphql responses
    torznab_xml = """
    <rss><channel>
      <item>
        <guid>abc123</guid>
        <title>Example Movie 2024</title>
        <size>1073741824</size>
        <enclosure url="magnet:?xt=urn:btih:abc123" />
        <category>movie</category>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <torznab:attr xmlns:torznab="http://torznab.com/schemas/2015/feed" name="tmdbid" value="550" />
      </item>
    </channel></rss>
    """
    respx.get(re.compile(r".*/torznab/.*")).mock(return_value=Response(200, text=torznab_xml))
    graphql_payload = {
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
    respx.post(re.compile(r".*/graphql")).mock(return_value=Response(200, json=graphql_payload))

    # Act
    cache_store.clear_all()
    details = await get_torrent_details("abc123")

    # Assert
    assert details["infoHash"] == "abc123"
    assert details["title"] == "Example Movie 2024"
    assert details["magnetUrl"].startswith("magnet:")
    assert details["files"][0]["path"] == "movie.mkv"
