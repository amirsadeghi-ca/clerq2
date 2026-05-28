# MELCCFP "Recevabilité" example (Phase 4)

A ready-made, end-to-end example of the MELCCFP RFP use case — judging the
**recevabilité** (admissibility/completeness) of a ministerial authorization
request *dossier* under Quebec's *Loi sur la qualité de l'environnement* (LQE).

It is **data and configuration only** — built entirely from generic Clerq2
features (Phases 1–3, 5–7). Nothing here is MELCCFP-specific application code;
deleting it leaves the generic app unchanged.

## What's here

- `dossier-recevable/` — a complete, consistent dossier (expected verdict: **Recevable / Pass**):
  - `01_Formulaire_demande_autorisation.docx` — the signed, dated request form (Word)
  - `02_Annexe_technique_milieu_humide.pdf` — technical annex for wetland works (PDF)
  - `03_Inventaire_equipements.csv` — equipment inventory, all on the approved list (CSV)
  - `04_Declaration_antecedents.pdf` — informational declaration, **excluded** from recevabilité (PDF)
- `dossier-non-recevable/` — a deliberately broken variant (expected: **Non recevable / Fail**):
  - the technical annex is **missing** (the form still says wetland works = "Oui"),
  - the applicant name **differs** between the form and the inventory,
  - the inventory contains an **off-list** equipment model.
- `seed.sh` — recreates the Library document types, the "Équipements admissibles (LQE)"
  reference list, and the "Recevabilité — Autorisation ministérielle (LQE)" policy with
  its rules, through the public API.

## How to run

1. Start the app (`docker compose up -d`) and set an OpenRouter API key in Settings.
2. Seed the configuration: `API=http://localhost:8000 ./seed.sh`
3. In **Checks**, open *Recevabilité — Autorisation ministérielle (LQE)*, drop all files
   from `dossier-recevable/`, and Run → expect **Recevable**. The antecedents declaration
   shows **N/A** on the per-document rules (it is deliberately ignored).
4. Run `dossier-non-recevable/` → expect **Non recevable**, failing on completeness,
   applicant-name consistency, logical coherence (wetland → annex), and equipment
   admissibility. Signature and French still pass.
5. Open the report, optionally review/override a finding and **Finalize**, then **Download PDF**.

## The policy's rules

| Rule | Reach | Mirrors |
|---|---|---|
| Signature et date présentes | per-document | signed & dated request form |
| Dossier rédigé en français | per-document | dossier in French |
| Complétude du dossier | across set | required attachments present |
| Nom du demandeur cohérent | across set | applicant name consistent across forms |
| Cohérence logique — travaux en milieu humide | across set | if "Oui" → annex present & completed |
| Équipements admissibles | per-document + reference list | equipment on the approved list |

The *Déclaration d'antécédents* is excluded via the policy brief + the engine's
per-document relevance handling (it is marked `not_applicable`, never failing the dossier).
