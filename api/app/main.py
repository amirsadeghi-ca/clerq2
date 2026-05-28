from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import create_tables, run_migrations
from app.routers import workflows, documents, runs, sse, files, library, policies, settings, validate, mail, review

app = FastAPI(title="Clerq2 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(workflows.router, prefix="/api/workflows", tags=["workflows"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(runs.router, prefix="/api/runs", tags=["runs"])
app.include_router(review.router, prefix="/api/runs", tags=["review"])  # Phase 6 — human review
app.include_router(sse.router, prefix="/api/runs", tags=["sse"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(library.router, prefix="/api/library", tags=["library"])
app.include_router(policies.router, prefix="/api/policies", tags=["policies"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(validate.router, prefix="/api/validate", tags=["validate"])
app.include_router(mail.router, prefix="/api/mail", tags=["mail"])


@app.on_event("startup")
def on_startup():
    create_tables()
    run_migrations()


@app.get("/api/health")
def health():
    return {"status": "ok"}
