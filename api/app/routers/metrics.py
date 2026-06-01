"""Operational indicators / monitoring (suivi) — aggregate metrics over
validation runs. Generic feature: every number is computed from existing
WorkflowRun / WorkflowRunStep / review data — no new tables, no use-case
specific logic. A policy-based validation use case (e.g. recevabilité) reads
these to monitor throughput, detected non-conformities, generation time,
human-validation rate, load, and post-generation corrections.

Exposes GET /api/metrics/insights with optional ?policy_id= and ?source=
filters, returning both headline totals and a per-run breakdown (the latter
powers a client-side Excel/CSV export)."""
from collections import Counter
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.cases import validation_output
from app.database import get_db
from app.models.run import WorkflowRun
from app.models.run_step import RunStep
from app.security import get_current_tenant_id

router = APIRouter()

# Statuses considered a detected non-conformity in a finding.
_NONCONFORMING = {"fail", "uncertain"}


def _effective_results(run: WorkflowRun, output: dict | None) -> list[dict]:
    """Results with reviewer overrides layered on top of the AI status."""
    results = list((output or {}).get("results") or [])
    review = run.review or {}
    annotations = review.get("annotations") or {}
    merged: list[dict] = []
    for r in results:
        ann = annotations.get(r.get("rule_name"))
        eff = r.get("status")
        overridden = False
        if ann and ann.get("override") and ann["override"].get("status"):
            eff = ann["override"]["status"]
            overridden = True
        merged.append({**r, "_effective": eff, "_overridden": overridden})
    return merged


@router.get("/insights")
def insights(
    policy_id: int | None = None,
    source: str = "validate",
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
):
    q = db.query(WorkflowRun).filter(WorkflowRun.tenant_id == tenant_id)
    if source and source != "all":
        q = q.filter(WorkflowRun.source == source)
    if policy_id is not None:
        q = q.filter(WorkflowRun.policy_id == policy_id)
    runs = q.order_by(WorkflowRun.created_at.desc()).all()

    dossiers_total = len(runs)
    dossiers_processed = 0
    documents_processed = 0
    nonconformities = 0
    durations: list[float] = []
    reviews_finalized = 0
    reviews_finalized_unmodified = 0
    corrections = 0
    verdicts: Counter = Counter()
    by_day: Counter = Counter()
    per_run: list[dict] = []

    for run in runs:
        # Load: bucket by calendar day of creation.
        if run.created_at:
            by_day[run.created_at.date().isoformat()] += 1

        docs = len(run.document_ids) or 1
        documents_processed += docs

        output = validation_output(run)
        results = _effective_results(run, output)

        # A "processed" dossier is one that produced a validation result.
        produced = bool(results) and run.status == "completed"
        if produced:
            dossiers_processed += 1

        run_nonconf = sum(1 for r in results if r.get("_effective") in _NONCONFORMING)
        nonconformities += run_nonconf

        # Generation time of the RT: wall-clock from first step start to last
        # step completion. Run-level started_at is often unset for canonical
        # validate pipelines, so step timing is the reliable source.
        secs = None
        all_steps = (
            db.query(RunStep)
            .filter(RunStep.run_id == run.id)
            .all()
        )
        starts = [s.started_at for s in all_steps if s.started_at]
        ends = [s.completed_at for s in all_steps if s.completed_at]
        if starts and ends:
            secs = (max(ends) - min(starts)).total_seconds()
            if produced and secs >= 0:
                durations.append(secs)

        # Verdict (effective if reviewed, else AI overall).
        review = run.review or {}
        effective_overall = review.get("effective_overall") or (output or {}).get("overall")
        if produced and effective_overall:
            verdicts[effective_overall] += 1

        # Human-validation metrics.
        reviewed = bool(review)
        finalized = review.get("state") == "finalized"
        any_override = any(r.get("_overridden") for r in results)
        if finalized:
            reviews_finalized += 1
            if not any_override:
                reviews_finalized_unmodified += 1
        # Corrections after initial generation = overrides applied + reopen events.
        run_overrides = sum(1 for r in results if r.get("_overridden"))
        reopens = sum(
            1 for h in (review.get("history") or []) if h.get("action") == "reopen"
        )
        corrections += run_overrides + reopens

        per_run.append(
            {
                "id": run.id,
                "name": run.name,
                "status": run.status,
                "policy_id": run.policy_id,
                "policy_name": (output or {}).get("policy_name"),
                "created_at": run.created_at.isoformat() if run.created_at else None,
                "documents": docs,
                "overall_ai": (output or {}).get("overall"),
                "overall_effective": effective_overall,
                "nonconformities": run_nonconf,
                "duration_seconds": round(secs, 1) if secs is not None else None,
                "reviewed": reviewed,
                "finalized": finalized,
                "overrides": run_overrides,
            }
        )

    avg_rt = round(sum(durations) / len(durations), 1) if durations else None
    human_rate = (
        round(reviews_finalized_unmodified / reviews_finalized, 4)
        if reviews_finalized
        else None
    )

    return {
        "filters": {"policy_id": policy_id, "source": source},
        "generated_at": datetime.utcnow().isoformat(),
        "totals": {
            "dossiers_total": dossiers_total,
            "dossiers_processed": dossiers_processed,
            "documents_processed": documents_processed,
            "nonconformities_detected": nonconformities,
            "avg_rt_seconds": avg_rt,
            "reviews_finalized": reviews_finalized,
            "human_validation_rate": human_rate,
            "corrections_after_generation": corrections,
        },
        "verdict_breakdown": dict(verdicts),
        "by_day": [{"date": d, "count": c} for d, c in sorted(by_day.items())],
        "per_run": per_run,
    }
