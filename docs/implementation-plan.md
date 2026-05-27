# Implement the MELCCFP "Recevabilité" RFP inside Clerq2 — phased & experience-led

## Context

Three PDFs were dropped in the project root. Two are byte-identical (`CCAG_TI_20250527-1.pdf` ≡ `ccag-ti-20250527.pdf`), so there are **two unique documents**:

1. **CCAG** (17 pp) — Quebec's *Cahier des clauses administratives générales*: fixed procurement boilerplate. **No app work** — it's contractual context only.
2. **25320-S** (91 pp) — the **CCDE** of a live RFP from the *Ministère de l'Environnement* (MELCCFP). It asks a vendor to build an **AI assistant that judges the "recevabilité"** (completeness/admissibility) of ministerial authorization requests. For each request *dossier*, the tool runs documentary checks and emits a **Rapport de traçabilité (RT)** — a checklist with a verdict of **Recevable / Non recevable / Information manquante** — which a human reviews before the file moves to analysis.

The RFP's target solution (Annexe 21) is, point for point, **what Clerq2 already does**: a Library of document types, a parametrable + versioned Policy of rules, an AI check (`validate_documents`), and a results report (`show_results`). Clerq2's verdict `pass / fail / needs_review` already maps onto **Recevable / Non recevable / Information manquante**.

## Guiding principle (non-negotiable)

**Everything we build is a generic Clerq2 capability.** The MELCCFP request is one *use case*; it must live entirely as **configuration and data** (document types, a policy, sample files) on top of generic features. No phase adds logic that only makes sense for this one RFP. If a piece of work only helps the MELCCFP case, it gets redesigned to be configuration-driven instead. This keeps Clerq2 a reusable product.

## What's missing today (verified against current code)

Clerq2 today validates **exactly one document per run**. The RFP's unit of work is a **dossier of ~19 documents (≈22 pages each)** of mixed formats, judged together. Three generic gaps follow:

1. A run can only cover one document — there's no notion of validating a **set** of documents together and reporting on them as a whole.
2. Only **PDF and images** can be read — Word, Excel, and CSV (all required by the RFP) are not ingested.
3. Rules are evaluated against a single document — there's no way to author a rule that **reasons across several documents** ("the applicant's name must match on every form", "if form A says Yes, form B must be attached").

Everything else the RFP needs already exists and will simply be configured: parametrable rules, **version history with restore**, required/optional rules, the three-state verdict, the results drawer, email intake, and report deposit.

---

# Phases

Each phase is delivered and reviewed on its own. I stop after each one and wait for your go-ahead before the next. Each phase ends with a commit so it's an independent restore point.

---

## Phase 0 — Establish a safety net (version control) ✓

**Why first:** Clerq2 is not yet under version control, so today there's no way back if a later change misbehaves.

**What happens:** the current, working app is committed as a clean baseline, with build artifacts, the local database, uploaded files, and secrets excluded from tracking.

**Experience:** nothing changes in how the app looks or runs. Behind the scenes you gain a labeled "known-good" snapshot.

**Expectation:** the app behaves identically before and after. The local `data/` (database + uploaded files) and `.env` are never committed.

**Outcome / done when:** you can, at any future moment, return the codebase to exactly today's working state in one step.

---

## Phase 1 — Validate a *set* of documents as one case

The single largest change, split into three reviewable sub-phases. The end state: a user assembles several documents into one **document set** (the generic term; the MELCCFP calls it a *dossier*), runs it against a policy, and gets **one** consolidated report covering the whole set.

### Phase 1A — The concept: a run can cover many documents

**What changes for the user:** conceptually, a validation run is no longer tied to a single file. A run can now represent a *set* of documents evaluated together against one policy, yielding a single verdict and a single report.

**What happens:** when a set is submitted, the policy is applied once over the whole collection. Each document is identified (by its filename, and optionally a document type) so the report can say *which* document satisfied or failed each check. The live progress (the step chips you already see) reflects the set being processed as one run.

**Expectation / guarantees:**
- Existing single-document validation keeps working untouched — submitting one file simply behaves as a set of one, so nothing regresses.
- One set → one run → one report → one overall verdict.
- Email-triggered and dashboard runs continue to work as before.

**Outcome / done when:** a set of two or more documents can be submitted (via the API at this sub-phase) and returns a single report whose individual checks can name the specific document they refer to.

### Phase 1B — The experience: assembling and submitting a set on the Validate screen

**What changes for the user:** the Validate screen's drop zone accepts **multiple files**. After dropping, the user sees the documents listed as a pending set — each row showing its filename, with the ability to remove one or add more before running. The Run button submits the whole set as one case.

**What happens:** the user picks a policy on the left (unchanged), drops/selects several documents, optionally removes any added by mistake, and clicks Run. The files upload, the set is formed, and one run starts. The run appears in the right-hand queue as a single entry named after the set.

**Expectation / guarantees:**
- The user always understands they're submitting *one case made of several documents*, not several separate runs.
- Removing/re-adding files before Run is forgiving; Run is only enabled once a policy and at least one file are chosen.
- A single dropped file still works exactly as today.

**Outcome / done when:** from the Validate screen alone, a user can build a multi-file case, run it, and watch it progress as one run.

### Phase 1C — Reading the report for a set (per-document traceability)

**What changes for the user:** opening a completed set's report shows the overall verdict at the top (as today), then a checklist of rules where each result can point to the **specific document(s)** it concerns. The user can see the set's file list and tell, for any failed or uncertain check, which document caused it.

**What happens:** the results view groups evidence so that, for example, "signature present and dated" shows a per-document outcome, while a set-wide check ("applicant name consistent across forms") shows which documents were compared. This is the *Rapport de traçabilité* the RFP describes: a structured checklist that a human can scan and trust.

**Expectation / guarantees:**
- The report remains easy to scan: one verdict, then rules, then drill-down evidence per document.
- Nothing is hidden — every check, its status (pass/fail/uncertain), its evidence, and the documents it touched are visible.

**Outcome / done when:** a reviewer can open a multi-document run and understand the verdict *and* which documents drove each part of it.

---

## Phase 2 — Read Word, Excel, and CSV documents

**What changes for the user:** the Validate screen accepts `.docx`, `.xlsx`, and `.csv` in addition to PDF and images. A real-world dossier mixing a Word form, a spreadsheet inventory, and a PDF can be validated together.

**What happens:** when a set contains these formats, the app reads their contents (the text of a Word form, the rows of a spreadsheet, the lines of a CSV) and makes that available to the policy checks alongside the visual pages of PDFs/images. The live progress shows a preparation step that ingests every document in the set regardless of format.

**Expectation / guarantees:**
- This is a generic ingestion capability — any policy, any use case benefits, not just the MELCCFP one.
- Formats it can't render visually are still read as text so rules can be checked against their content.
- Large sets are handled within sensible size limits (very large bundles are bounded so a run can't blow past the model's input limits without a clear message).

**Outcome / done when:** a set mixing PDF + Word + Excel/CSV runs end to end, and the report reflects checks made against the non-PDF documents' actual contents.

---

## Phase 3 — Rules that look across the whole set

**What changes for the user:** when authoring a policy rule, the user chooses the rule's **reach**: does it apply to *each document individually* (e.g. "this form must be signed") or *across the whole set* (e.g. "the applicant's name must be identical on every form", "if form A answers Yes, form B must be present")? This is the RFP's "cohérence logique" and cross-form consistency, expressed generically.

**What happens:** set-wide rules are evaluated over the entire collection in one pass; the result names the documents it compared. Per-document rules continue to be checked against each relevant document. The policy editor gains a simple control on each rule card to set its reach, sitting beside the existing Required/Optional choice.

**Expectation / guarantees:**
- Existing rules keep their current behavior by default (per-document), so no policy silently changes meaning.
- Authors can express the RFP's signature, language, attachment-count, and logical-coherence checks without any custom code — purely by writing rules.
- The report attributes a cross-document finding to the documents involved, so it's auditable.

**Outcome / done when:** a policy can contain both per-document and set-wide rules, and a run demonstrates a set-wide rule correctly passing/failing based on consistency across documents.

---

## Phase 4 — The MELCCFP recevability use case (configuration & data only — no app code)

**What changes for the user:** Clerq2 ships with a ready-to-use *example* of the RFP, built entirely from the generic features above — proving the whole story end to end. It is data, not code: it can be deleted without affecting the app.

**What happens / what's created:**
- A handful of **document types** in the Library representing the dossier's pieces (e.g. the authorization request form, technical annexes, an inventory, and a "Déclaration d'antécédents" used to demonstrate *exclusion* — a document the checks deliberately ignore).
- A **policy** "Recevabilité — Autorisation ministérielle (LQE)" whose rules mirror the RFP's named checks: signature present & dated, dossier written in French, required attachments present, applicant name consistent across forms, logical coherence (if a question is answered Yes then the related annex must be present and completed), and exclusion of the antecedents declaration.
- A small set of **synthetic sample files** (real ministry forms aren't available) that form a realistic dossier in mixed formats.

**Experience:** a user opens the Recevabilité policy, drops the sample dossier on the Validate screen, runs it, and watches the report come back with a **Recevable / Non recevable / Information manquante** verdict and a per-document checklist. Editing a sample to break consistency (e.g. change the applicant's name on one form) flips the relevant check to fail on the next run; the excluded document is visibly skipped.

**Expectation / guarantees:**
- This phase touches no application source — only Library/Policy data and sample files. Removing it leaves the generic app exactly as it was after Phase 3.
- It serves as both a demo and a template others can copy for their own use cases.

**Outcome / done when:** the sample dossier produces a correct, human-readable RT, and deliberately broken inputs produce the expected Non recevable / Information manquante outcomes.

---

## Phase 5 — Optional later items (plan only, not committed yet)

All generic; offered for a future round, not built now:
- **Operational indicators + export** (RFP §2.2.1.4): a view of volumes and quality signals (cases processed, non-conformities found, share of reports a human accepted without edits) with CSV/Excel export.
- **Isolated processing & retention** (§2.2.1.3): per-run isolated handling, scheduled purge of temporary working data, and a processing/deletion journal.
- **Tighter audit on rule edits:** ensure *every* rule edit produces a version snapshot (today some edit paths don't), so the change history is complete.
- **Human-editable report + deposit-back:** let a reviewer adjust the report before finalizing and write it back to a destination.
- **Verdict-label localization:** present verdicts in the user's language (e.g. French for this ministry) in a generic, configurable way — never a hardcoded one-off.

---

## Cross-cutting expectations
- **Backward compatibility:** single-document validation, the workflow editor, the dashboard, and email intake keep working at every phase.
- **No regressions to the generic product:** the MELCCFP specifics never leak into core behavior.
- **Documentation discipline:** `CLAUDE.md` (the project's source-of-truth doc) is updated at the end of each phase, and each phase is committed as its own restore point.

## How each phase is verified
Rebuild the affected services, exercise the new capability through the actual UI in a browser (not just API calls), and confirm the live progress + report behave as described. An OpenRouter API key must be set for any run that calls the AI. Phase 4 is verified by running the sample dossier and by deliberately breaking inputs to confirm the failing/uncertain verdicts.
