from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./data/clerq.db"
    redis_url: str = "redis://localhost:6379/0"
    storage_path: str = "./data/storage"
    secret_key: str = "change-me-in-production"
    openrouter_api_key: str = ""
    openrouter_default_model: str = "google/gemini-2.0-flash-exp"

    # Auth
    jwt_secret: str = ""  # falls back to secret_key if blank
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 30

    # Invites + mail + password reset
    app_base_url: str = "http://localhost"           # used to build invite links
    invite_expiry_days: int = 7
    password_reset_expiry_hours: int = 1             # how long a reset link stays valid
    resend_api_key: str = ""                         # https://resend.com — leave blank to log-only
    invite_from_address: str = "onboarding@resend.dev"  # Resend's open sender for testing
    invite_from_name: str = "Clerq2"

    @property
    def effective_jwt_secret(self) -> str:
        return self.jwt_secret or self.secret_key


settings = Settings()
