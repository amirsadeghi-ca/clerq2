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

## UI/UX philosophy (applies to every user-facing phase)

The user is a **domain expert, not a technical user** (e.g. a ministry analyst judging dossiers). Sophistication means **the interface does the thinking about the workflow so the human only thinks about the decision** — not density or feature count. This extends the existing Design Language in `CLAUDE.md` (Linear / Vercel / Raycast minimalism, token theming, one indigo accent, semantic status colors); we elevate it, never deviate. Held to:

1. **3-second comprehension** — verdict first, then findings, then evidence on drill-down. Detail is progressively disclosed, never dumped.
2. **Document-anchored trust** — a finding can point to where in the source it came from; people believe what they can see.
3. **Plain language, bilingual** — "Recevable / À corriger / Information manquante," never "status: fail." FR/EN, tooltips teach, nothing assumes technical knowledge.
4. **Forgiving & reversible** — every human note/override/finalize is attributed, undoable, and never destructive; the AI's original result stays visible.
5. **Calm, not flashy** — generous whitespace, one accent, motion that informs (streaming progress) not decorates.
6. **Click-first for everyone, keyboard-first for power** — every action has an obvious button; power users also get keyboard nav and a Cmd-K palette.
7. **Print-perfect** — the report looks right on screen *and* as a PDF; export is designed, not bolted on.
8. **Accessible by default** — WCAG-AA contrast, keyboard reach, screen-reader labels, reduced-motion respected.

Every user-facing phase must pass a **"cold reader" test**: a non-technical person completes the phase's core task with **no walkthrough**. If they hesitate, the UX is the bug — not the user.

---

# Phases

Each phase is delivered and reviewed on its own. I stop after each one and wait for your go-ahead before the next. Each phase ends with a commit so it's an independent restore point.

> **Status:** Phases 0–3 are complete (✓). Phase 4 (use-case demo) and Phases 5–6 (report + light human review) are the active near-term work. Phases 7–8 and the "Later / optional" set are planned but not committed. Phases 5–6 are independent of Phase 4 and may be built before it to make the demo richer.

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

### Phase 1A — The concept: a run can cover many documents ✓

**What changes for the user:** conceptually, a validation run is no longer tied to a single file. A run can now represent a *set* of documents evaluated together against one policy, yielding a single verdict and a single report.

**What happens:** when a set is submitted, the policy is applied once over the whole collection. Each document is identified (by its filename, and optionally a document type) so the report can say *which* document satisfied or failed each check. The live progress (the step chips you already see) reflects the set being processed as one run.

**Expectation / guarantees:**
- Existing single-document validation keeps working untouched — submitting one file simply behaves as a set of one, so nothing regresses.
- One set → one run → one report → one overall verdict.
- Email-triggered and dashboard runs continue to work as before.

**Outcome / done when:** a set of two or more documents can be submitted (via the API at this sub-phase) and returns a single report whose individual checks can name the specific document they refer to.

### Phase 1B — The experience: assembling and submitting a set on the Validate screen ✓

**What changes for the user:** the Validate screen's drop zone accepts **multiple files**. After dropping, the user sees the documents listed as a pending set — each row showing its filename, with the ability to remove one or add more before running. The Run button submits the whole set as one case.

**What happens:** the user picks a policy on the left (unchanged), drops/selects several documents, optionally removes any added by mistake, and clicks Run. The files upload, the set is formed, and one run starts. The run appears in the right-hand queue as a single entry named after the set.

**Expectation / guarantees:**
- The user always understands they're submitting *one case made of several documents*, not several separate runs.
- Removing/re-adding files before Run is forgiving; Run is only enabled once a policy and at least one file are chosen.
- A single dropped file still works exactly as today.

**Outcome / done when:** from the Validate screen alone, a user can build a multi-file case, run it, and watch it progress as one run.

### Phase 1C — Reading the report for a set (per-document traceability) ✓

**What changes for the user:** opening a completed set's report shows the overall verdict at the top (as today), then a checklist of rules where each result can point to the **specific document(s)** it concerns. The user can see the set's file list and tell, for any failed or uncertain check, which document caused it.

**What happens:** the results view groups evidence so that, for example, "signature present and dated" shows a per-document outcome, while a set-wide check ("applicant name consistent across forms") shows which documents were compared. This is the *Rapport de traçabilité* the RFP describes: a structured checklist that a human can scan and trust.

**Expectation / guarantees:**
- The report remains easy to scan: one verdict, then rules, then drill-down evidence per document.
- Nothing is hidden — every check, its status (pass/fail/uncertain), its evidence, and the documents it touched are visible.

**Outcome / done when:** a reviewer can open a multi-document run and understand the verdict *and* which documents drove each part of it.

---

## Phase 2 — Read Word, Excel, and CSV documents ✓

**What changes for the user:** the Validate screen accepts `.docx`, `.xlsx`, and `.csv` in addition to PDF and images. A real-world dossier mixing a Word form, a spreadsheet inventory, and a PDF can be validated together.

**What happens:** when a set contains these formats, the app reads their contents (the text of a Word form, the rows of a spreadsheet, the lines of a CSV) and makes that available to the policy checks alongside the visual pages of PDFs/images. The live progress shows a preparation step that ingests every document in the set regardless of format.

**Expectation / guarantees:**
- This is a generic ingestion capability — any policy, any use case benefits, not just the MELCCFP one.
- Formats it can't render visually are still read as text so rules can be checked against their content.
- Large sets are handled within sensible size limits (very large bundles are bounded so a run can't blow past the model's input limits without a clear message).

**Outcome / done when:** a set mixing PDF + Word + Excel/CSV runs end to end, and the report reflects checks made against the non-PDF documents' actual contents.

---

## Phase 3 — Rules that look across the whole set ✓

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

## Phase 5 — The report as a durable, polished artifact (+ PDF/JSON/CSV export) ✓

**Why:** the core deliverable is the report. Today it renders in a transient modal tied to a run; it should be a real, retrievable, beautifully formatted document that "lives in the app" and can be exported.

**What changes for the user:** every completed case has a **Report** with its own stable page/link, reopenable from the case list anytime, and a **"Download PDF"** that produces a clean, print-quality version. Structured **JSON/CSV** export is offered alongside.

**What happens:** the existing results become a dedicated report view — verdict banner, the rules checklist (failures/uncertainties first), evidence, per-document traceability, and the policy + version + timestamp it ran under. A renderer produces a PDF visually faithful to the on-screen report.

**Experience:** opening the report feels like opening a finished document, not a debug panel — big plain-language verdict up top, attention drawn to what failed, every finding expandable to its evidence and source document(s). "Download PDF" is one obvious button; the PDF mirrors the screen exactly, with a header carrying case name, policy, version, and date.

**Expectation / guarantees:**
- On-screen report and PDF are visually faithful to each other; existing runs render as reports with no migration.
- Generic — any policy's report exports the same way.

**Outcome / done when:** any completed case can be reopened as a polished report and downloaded as a clean PDF (and JSON/CSV).

---

## Phase 6 — Light human review on the report (annotate → override → finalize)

**Why:** the one piece of "human in the loop" that fits the upload→process→report→done loop — inspired by the LexRock reviewer (annotate a finding, optionally override its verdict with a reason, then finalize), with **no** queue, assignment, case states, or multi-tenant.

**What changes for the user:** a freshly produced report opens as a **Draft (AI-generated)**. On any finding the reviewer can **add a note** (a reason/comment) and, if they disagree with the AI, **change the verdict** (Recevable / À corriger / Information manquante) — a different choice than the AI requires a short reason. A single **"Finalize report"** stamps it as reviewed and makes that version the report of record.

**What happens:** notes/overrides are layered *on top of* the AI result — the original AI verdict is never erased; the report shows **"AI: À corriger → Reviewer: Recevable — *reason*"** with a timestamp (and a name once identity exists). The overall verdict recomputes from the *effective* findings (human override where present, else AI). Finalizing records who/when, locks the report, and the exported PDF reflects the finalized state. A finalized report can be re-opened to amend, and that amendment is itself logged.

**Experience:** review feels like marking up a document, not operating software. Each finding reveals two quiet affordances — **"Add note"** (inline, sticky-note style) and **"Change verdict"** (a small segmented toggle); overriding gently expands a required one-line reason. AI-vs-reviewer is shown transparently so an override reads as an accountable decision, never a silent rewrite. Low-confidence findings carry a subtle cue. "Finalize report" is one calm primary button; the report wears a "Draft" ribbon before, a "Finalized · [date]" stamp after.

**Expectation / guarantees:**
- The AI's original result is always preserved and visible; overrides are additive and fully attributable (what, why, when).
- Finalizing is reversible (re-open to amend, logged); nothing is ever silently lost.
- Generic — works for any policy's report.

**Outcome / done when:** a reviewer can read a report, annotate and override findings with reasons, finalize it, and download a PDF that reflects exactly that — with AI and human decisions both visible.

---

## Phase 7 — Reference-data lookups (optional, independent)

**Why:** many real checks compare an extracted value against an authoritative list (eligible appliances, approved vendors, valid codes) — not expressible by a natural-language rule alone. Independent of the report loop; can be pulled forward anytime, and it sharpens the Phase 4 demo.

**What changes for the user:** the Library gains **Reference Lists** (named, editable tables — e.g. "Eligible appliances," imported from CSV or edited inline). A rule can **check against a list**: the extracted value must be **in** / **not in** it.

**What happens:** a generic reference-list type; rules gain an opt-in "check against reference list" mode with a direction and a match style — **Exact match** (deterministic, auditable) or **Smart match** (AI-tolerant of variants). Lists are versioned. The report shows which list and which entry (or its absence) drove a finding.

**Experience:** a reference list is managed like a familiar spreadsheet (drag-drop CSV or edit rows). Wiring a rule reads as a self-assembling sentence built from dropdowns — *"The extracted value must be **[in] [Eligible appliances]**"* — with Exact vs Smart explained in one plain line each. No code.

**Expectation / guarantees:** generic (the appliance list is just sample data); existing rules unaffected (opt-in); deterministic option for auditable matches.

**Outcome / done when:** a rule referencing an "eligible items" list passes/fails on membership, and editing the list changes the verdict on the next run.

---

## Phase 8 — Output & deposit to external systems (deferred)

**Why:** eventually the report should leave the app — but **not now**: "for now there is no SharePoint; the PDF report can be shown in the app." Listed so Phases 5–6 keep the report deposit-ready (clean PDF + structured payload already exist).

**What changes for the user (when built):** a generic **deposit** step — email the report, post to a generic outbound **webhook**, and a **SharePoint** document-library connector (via Microsoft Graph; needs a Microsoft app registration the org provides). Teams/Slack notifications ride the same webhook mechanism.

**What happens:** case lifecycle moments (e.g. report finalized) can trigger configured deposits/notifications; destinations are generic, so SharePoint/Teams/Slack are just configured targets, nothing hardcoded. Friendly, jargon-free setup ("Send a notification when… → paste your link → Send test message → delivery log").

**Outcome / done when:** finalizing a report can deposit it to a configured destination (first target: SharePoint), with a visible delivery log.

---

## Later / optional (planned, not committed)

All generic; offered for a future round:
- **Operational indicators + export** (RFP §2.2.1.4): volumes and quality signals (cases processed, non-conformities found, share of reports finalized without edits) with CSV/Excel export.
- **Isolated processing & retention** (§2.2.1.3): per-run isolated handling, scheduled purge of temporary working data, and a processing/deletion journal.
- **Tighter audit on rule edits:** ensure *every* rule edit produces a version snapshot (today some edit paths don't).
- **Verdict-label localization:** verdicts in the user's language, generic and configurable — never a hardcoded one-off.
- **Identity & access** (only if multiple orgs/users ever need it): named users + login so attribution names a person, and workspace isolation. Deliberately deferred — the current loop is single-tenant.

---

## Cross-cutting expectations
- **Backward compatibility:** single-document validation, the workflow editor, the dashboard, and email intake keep working at every phase.
- **No regressions to the generic product:** the MELCCFP specifics never leak into core behavior.
- **Documentation discipline:** `CLAUDE.md` (the project's source-of-truth doc) is updated at the end of each phase, and each phase is committed as its own restore point.

## How each phase is verified
Rebuild the affected services, exercise the new capability through the actual UI in a browser (not just API calls), and confirm the live progress + report behave as described. An OpenRouter API key must be set for any run that calls the AI.
- **Phase 4:** run the sample dossier; deliberately break inputs to confirm the failing/uncertain verdicts; confirm the excluded document is skipped.
- **Phase 5:** complete a case, reopen its report later, confirm the on-screen report and the downloaded PDF match; export JSON/CSV.
- **Phase 6:** on a fresh report, add a note, override a `fail`→`pass` with a reason, confirm the overall verdict recomputes and both AI + reviewer verdicts show; finalize, download the PDF, confirm it reflects the finalized state; re-open and confirm the amendment is logged.
- **Phase 7:** add a reference list, wire a rule to it, run a case where the value is off-list → fail; edit the list to include it → pass.
- **Phase 8:** point a configured destination (first: SharePoint) at a finalized report; confirm deposit + delivery log.

Plus, every user-facing phase passes the **"cold reader" test**: a person who has never seen the app completes the phase's core task with no walkthrough.
