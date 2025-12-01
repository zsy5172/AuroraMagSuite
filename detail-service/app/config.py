from pydantic import AnyUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    bitmagnet_url: AnyUrl = Field(
        "http://bitmagnet:3333",
        description="Bitmagnet GraphQL/Torznab base URL",
        alias="BITMAGNET_URL",
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
    request_timeout: float = Field(8.0, alias="REQUEST_TIMEOUT")


settings = Settings()
