from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://interpret:interpret@postgres:5432/interpret"
    redis_url: str = "redis://localhost:6379/0"
    storage_path: str = "./data/storage"
    secret_key: str = "change-me-in-production"
    openrouter_api_key: str = ""
    openrouter_default_model: str = "google/gemini-2.5-flash"

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
    invite_from_name: str = "Interpret"

    # Inbound mail (Resend Inbound → /api/mail/resend-inbound webhook)
    mail_inbound_domain: str = "email.genitechs.ca"   # domain for policy-N@…/workflow-N@… addresses
    resend_inbound_webhook_secret: str = ""           # Svix signing secret "whsec_…"; blank = skip verify (dev only)
    mail_max_attachment_bytes: int = 25 * 1024 * 1024  # reject inbound attachments larger than this

    @property
    def effective_jwt_secret(self) -> str:
        return self.jwt_secret or self.secret_key


settings = Settings()
