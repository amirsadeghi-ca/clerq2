from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import workflows, documents, runs, sse, files, library, policies, settings, validate, mail, review, reference_lists, metrics, auth, admin, tenant, invites, mfa
from app.routers.cases import router as cases_router
from app.routers.health import router as health_router

app = FastAPI(title="Interpret API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(mfa.router, prefix="/api/auth", tags=["mfa"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(tenant.router, prefix="/api/tenant", tags=["tenant"])
app.include_router(invites.router, prefix="/api/invites", tags=["invites"])
app.include_router(workflows.router, prefix="/api/workflows", tags=["workflows"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(runs.router, prefix="/api/runs", tags=["runs"])
app.include_router(review.router, prefix="/api/runs", tags=["review"])  # Phase 6 — human review
app.include_router(sse.router, prefix="/api/runs", tags=["sse"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(library.router, prefix="/api/library", tags=["library"])
app.include_router(reference_lists.router, prefix="/api/reference-lists", tags=["reference-lists"])  # Phase 7
app.include_router(policies.router, prefix="/api/policies", tags=["policies"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(validate.router, prefix="/api/validate", tags=["validate"])
app.include_router(mail.router, prefix="/api/mail", tags=["mail"])
app.include_router(metrics.router, prefix="/api/metrics", tags=["metrics"])  # operational indicators / suivi
app.include_router(cases_router, prefix="/api/cases", tags=["cases"])
app.include_router(health_router, prefix="/api/health", tags=["health"])
