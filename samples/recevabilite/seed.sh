#!/usr/bin/env bash
# Seed the MELCCFP "Recevabilité" example into a running Clerq2 instance.
# This is DATA/CONFIG only — it creates Library document types, an approved-
# equipment reference list, and the "Recevabilité — Autorisation ministérielle
# (LQE)" policy with its rules, all through the public API. Delete them from the
# UI to remove the example; the generic app is unaffected.
#
# Usage:  API=http://localhost:8000 ./seed.sh
set -euo pipefail
API="${API:-http://localhost:8000}"
ct='-H Content-Type:application/json'

echo "Seeding into $API"

# ── Document types (Library) ───────────────────────────────────────────────
for body in \
  '{"name":"Formulaire de demande d'\''autorisation (LQE)","description":"Formulaire principal de demande d'\''autorisation ministérielle.","ai_instructions":"Document principal signé et daté par le représentant du demandeur."}' \
  '{"name":"Annexe technique","description":"Description technique des travaux (ex. travaux en milieu humide)."}' \
  '{"name":"Inventaire des équipements","description":"Liste des équipements prévus pour le projet."}' \
  '{"name":"Déclaration d'\''antécédents","description":"Déclaration informative — exclue de l'\''évaluation de recevabilité."}'
do curl -s $ct -X POST "$API/api/library/" -d "$body" >/dev/null; done
echo "  document types created"

# ── Reference list (approved equipment) ────────────────────────────────────
REFLIST=$(curl -s $ct -X POST "$API/api/reference-lists/" -d '{
  "name":"Équipements admissibles (LQE)",
  "description":"Modèles d'\''équipements admissibles aux autorisations.",
  "items":["Séparateur hydrodynamique SH-200","Bassin de rétention BR-50","Membrane géotextile GT-10","Régulateur de débit RD-15"]
}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "  reference list #$REFLIST created"

# ── Policy + rules ─────────────────────────────────────────────────────────
PID=$(curl -s $ct -X POST "$API/api/policies/" -d '{
  "name":"Recevabilité — Autorisation ministérielle (LQE)",
  "brief":"Évalue la recevabilité (complétude et admissibilité) d'\''un dossier de demande d'\''autorisation ministérielle en vertu de la Loi sur la qualité de l'\''environnement (LQE). Un dossier est un ensemble de documents portant sur un même demandeur. La « Déclaration d'\''antécédents » est fournie à titre informatif et NE DOIT PAS être prise en compte dans la recevabilité — marquez-la « not_applicable » pour les règles qui ne la concernent pas. Verdict attendu : Recevable / Non recevable / Information manquante."
}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "  policy #$PID created"

rule() { curl -s $ct -X POST "$API/api/policies/$PID/rules" -d "$1" >/dev/null; }
rule '{"name":"Signature et date présentes","requirement":"required","scope":"per_document","accept_criteria":"le formulaire de demande d'\''autorisation est signé par le représentant et porte une date de demande","fail_criteria":"le formulaire de demande n'\''est pas signé ou n'\''est pas daté"}'
rule '{"name":"Dossier rédigé en français","requirement":"required","scope":"per_document","accept_criteria":"le document est rédigé en français","fail_criteria":"le document n'\''est pas rédigé en français"}'
rule '{"name":"Complétude du dossier","requirement":"required","scope":"cross_set","accept_criteria":"le dossier contient au minimum le formulaire de demande et l'\''inventaire des équipements, ainsi que toute annexe technique exigée","fail_criteria":"une pièce requise est absente du dossier"}'
rule '{"name":"Nom du demandeur cohérent entre les formulaires","requirement":"required","scope":"cross_set","accept_criteria":"le nom du demandeur est identique sur l'\''ensemble des documents","fail_criteria":"le nom du demandeur diffère entre deux documents"}'
rule '{"name":"Cohérence logique — travaux en milieu humide","requirement":"required","scope":"cross_set","accept_criteria":"si le formulaire indique « Oui » aux travaux en milieu humide, une annexe technique décrivant ces travaux est jointe et complétée","fail_criteria":"le formulaire indique « Oui » mais l'\''annexe correspondante est absente ou incomplète"}'
rule "{\"name\":\"Équipements admissibles\",\"requirement\":\"required\",\"scope\":\"per_document\",\"accept_criteria\":\"tous les équipements de l'inventaire figurent sur la liste de référence\",\"fail_criteria\":\"un équipement ne figure pas sur la liste des équipements admissibles\",\"reference_list_id\":$REFLIST,\"reference_direction\":\"in\",\"reference_match\":\"smart\"}"
echo "  6 rules created"

echo "Done. Open Checks → \"Recevabilité — Autorisation ministérielle (LQE)\" and drop a dossier from this folder."
