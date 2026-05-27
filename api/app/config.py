from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./data/clerq.db"
    redis_url: str = "redis://localhost:6379/0"
    storage_path: str = "./data/storage"
    secret_key: str = "change-me-in-production"
    openrouter_api_key: str = ""
    openrouter_default_model: str = "google/gemini-2.0-flash-exp"


settings = Settings()
