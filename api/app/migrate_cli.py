"""Run migrations once and exit. Called from the container entrypoint so that
both the api and worker startup paths agree on the schema before any request
or task code runs, and so uvicorn's --reload never re-enters migrations."""
from app.migrations import run_migrations

if __name__ == "__main__":
    run_migrations()
