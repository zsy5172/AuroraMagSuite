from pathlib import Path

from pydantic import AnyUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    bitmagnet_url: AnyUrl = Field(
        "http://bitmagnet:3333",
        description="Bitmagnet GraphQL/Torznab base URL",
        alias="BITMAGNET_URL",
    )
    tmdb_api_key: str = Field(
        "",
        description="TMDB API key for metadata enrichment",
        alias="TMDB_API_KEY",
    )
    public_host: str = Field(
        "localhost:3337",
        description="Externally reachable host:port used in generated detail links",
        alias="PUBLIC_HOST",
    )
    public_protocol: str = Field(
        "http",
        description="Protocol used for generated detail links",
        alias="PUBLIC_PROTOCOL",
    )
    tmdb_cache_ttl: int = Field(86400, alias="TMDB_CACHE_TTL")
    graphql_cache_ttl: int = Field(3600, alias="GRAPHQL_CACHE_TTL")
    details_cache_ttl: int = Field(7200, alias="DETAILS_CACHE_TTL")
    douban_cache_ttl: int = Field(604800, alias="DOUBAN_CACHE_TTL")
    cache_maxsize: int = Field(256, alias="CACHE_MAXSIZE")
    request_timeout: float = Field(8.0, alias="REQUEST_TIMEOUT")


settings = Settings()
