// Validate page + ValidationResultsModal strings.
// Quebec French conventions: "Vérifications" (Checks), "politique" (policy),
// "règle" (rule), "Déposez" (drop), proper ’ apostrophes and accents.

export const en = {
  'validate.title': 'Validate',
  'validate.checks': 'Checks',

  // Node / step labels
  'validate.node.input': 'Input',
  'validate.node.pdf_to_images': 'PDF → Images',
  'validate.node.validate_documents': 'Validate',
  'validate.node.show_results': 'Results',
  'validate.node.output': 'Output',

  // Overall verdict labels
  'validate.overall.pass': 'Pass',
  'validate.overall.fail': 'Fail',
  'validate.overall.needs_review': 'Needs Review',

  // Time ago
  'validate.time.justNow': 'just now',
  'validate.time.secondsAgo': '{count}s ago',
  'validate.time.minutesAgo': '{count}m ago',
  'validate.time.hoursAgo': '{count}h ago',
  'validate.time.daysAgo': '{count}d ago',

  // Lightbox
  'validate.page': 'Page {n}',

  // Run detail modal
  'validate.run': 'Run #{id}',
  'validate.queued': 'Queued…',
  'validate.exportCsvTitle': 'Export CSV',
  'validate.exportJsonTitle': 'Export JSON',
  'validate.downloadPdfTitle': 'Download PDF',
  'validate.openFullReport': 'Open full report',
  'validate.rules': 'Rules',
  'validate.checking': 'Checking…',
  'validate.checkingRule': 'Checking {name}…',
  'validate.badge.set': 'set',
  'validate.badge.setTitle': 'Evaluated across the whole set',
  'validate.badge.any': 'any',
  'validate.badge.anyTitle': 'Passes if at least one relevant document satisfies it',
  'validate.selectRule': 'Select a rule to see details',
  'validate.selectRuleHint': 'Click any rule on the left, or use ↑ ↓ to navigate.',
  'validate.scope.crossSet': 'across set',
  'validate.scope.anyDocument': 'any document',
  'validate.extracted': 'Extracted',
  'validate.documentsCompared': 'Documents compared · {count}',
  'validate.perDocument': 'Per document',
  'validate.pages': 'Pages · {count}',
  'validate.noResultForRule': 'No result for this rule.',

  // Run item
  'validate.mail': 'mail',
  'validate.viaEmail': 'via email',
  'validate.nDocs': '{count} doc.',

  // Policy item
  'validate.nRules': '{count} rule',
  'validate.nRules_plural': '{count} rules',
  'validate.editPolicy': 'Edit policy',
  'validate.deletePolicy': 'Delete policy',
  'validate.deleteConfirm': 'Delete "{name}"?',

  // Launch bar
  'validate.dropToValidate': 'Drop documents to validate',
  'validate.acceptedFormats': 'PDF, Word, Excel, CSV or images',
  'validate.starting': 'Starting…',
  'validate.runN': 'Run ({count})',
  'validate.runValidation': 'Run validation',

  // Main page
  'validate.newPolicy': 'New policy',
  'validate.policyNamePlaceholder': 'Policy name…',
  'validate.noMatches': 'No matches',
  'validate.noPoliciesYet': 'No policies yet',
  'validate.selectAPolicy': 'Select a policy',
  'validate.selectAPolicyHint': 'Pick a policy on the left, drop a document, and watch validation run in real time.',
  'validate.loadingRuns': 'Loading runs…',
  'validate.noRunsYet': 'No runs yet',
  'validate.dropToStart': 'Drop a document above to start.',
  'validate.failedToStart': 'Failed to start run',

  // ValidationResultsModal
  'validate.results.title': 'Validation Results',
  'validate.results.nFailed': '{count} failed',
  'validate.results.nUncertain': '{count} uncertain',
  'validate.results.nPassed': '{count} passed',
  'validate.results.requirement.required': 'required',
  'validate.results.requirement.optional': 'optional',
  'validate.results.requirement.conditional': 'conditional',
}

export const fr = {
  'validate.title': 'Valider',
  'validate.checks': 'Vérifications',

  'validate.node.input': 'Entrée',
  'validate.node.pdf_to_images': 'PDF → Images',
  'validate.node.validate_documents': 'Valider',
  'validate.node.show_results': 'Résultats',
  'validate.node.output': 'Sortie',

  'validate.overall.pass': 'Conforme',
  'validate.overall.fail': 'Non conforme',
  'validate.overall.needs_review': 'À réviser',

  'validate.time.justNow': 'à l’instant',
  'validate.time.secondsAgo': 'il y a {count} s',
  'validate.time.minutesAgo': 'il y a {count} min',
  'validate.time.hoursAgo': 'il y a {count} h',
  'validate.time.daysAgo': 'il y a {count} j',

  'validate.page': 'Page {n}',

  'validate.run': 'Exécution no {id}',
  'validate.queued': 'En file…',
  'validate.exportCsvTitle': 'Exporter en CSV',
  'validate.exportJsonTitle': 'Exporter en JSON',
  'validate.downloadPdfTitle': 'Télécharger le PDF',
  'validate.openFullReport': 'Ouvrir le rapport complet',
  'validate.rules': 'Règles',
  'validate.checking': 'Vérification…',
  'validate.checkingRule': 'Vérification de {name}…',
  'validate.badge.set': 'ensemble',
  'validate.badge.setTitle': 'Évalué sur l’ensemble complet',
  'validate.badge.any': 'tout doc.',
  'validate.badge.anyTitle': 'Réussit si au moins un document pertinent la satisfait',
  'validate.selectRule': 'Sélectionnez une règle pour voir les détails',
  'validate.selectRuleHint': 'Cliquez sur une règle à gauche, ou utilisez ↑ ↓ pour naviguer.',
  'validate.scope.crossSet': 'ensemble',
  'validate.scope.anyDocument': 'tout document',
  'validate.extracted': 'Extrait',
  'validate.documentsCompared': 'Documents comparés · {count}',
  'validate.perDocument': 'Par document',
  'validate.pages': 'Pages · {count}',
  'validate.noResultForRule': 'Aucun résultat pour cette règle.',

  'validate.mail': 'courriel',
  'validate.viaEmail': 'par courriel',
  'validate.nDocs': '{count} doc.',

  'validate.nRules': '{count} règle',
  'validate.nRules_plural': '{count} règles',
  'validate.editPolicy': 'Modifier la politique',
  'validate.deletePolicy': 'Supprimer la politique',
  'validate.deleteConfirm': 'Supprimer « {name} » ?',

  'validate.dropToValidate': 'Déposez des documents à valider',
  'validate.acceptedFormats': 'PDF, Word, Excel, CSV ou images',
  'validate.starting': 'Démarrage…',
  'validate.runN': 'Exécuter ({count})',
  'validate.runValidation': 'Lancer la validation',

  'validate.newPolicy': 'Nouvelle politique',
  'validate.policyNamePlaceholder': 'Nom de la politique…',
  'validate.noMatches': 'Aucune correspondance',
  'validate.noPoliciesYet': 'Aucune politique pour l’instant',
  'validate.selectAPolicy': 'Sélectionnez une politique',
  'validate.selectAPolicyHint': 'Choisissez une politique à gauche, déposez un document et suivez la validation en temps réel.',
  'validate.loadingRuns': 'Chargement des exécutions…',
  'validate.noRunsYet': 'Aucune exécution pour l’instant',
  'validate.dropToStart': 'Déposez un document ci-dessus pour commencer.',
  'validate.failedToStart': 'Échec du démarrage de l’exécution',

  'validate.results.title': 'Résultats de la validation',
  'validate.results.nFailed': '{count} non conforme(s)',
  'validate.results.nUncertain': '{count} incertain(s)',
  'validate.results.nPassed': '{count} conforme(s)',
  'validate.results.requirement.required': 'obligatoire',
  'validate.results.requirement.optional': 'facultatif',
  'validate.results.requirement.conditional': 'conditionnel',
}
