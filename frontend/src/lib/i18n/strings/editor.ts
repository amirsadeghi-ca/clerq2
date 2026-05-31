// Workflow editor: canvas chrome, node palette, and node card labels.
// Quebec French: "Flux de travail", "Nœud(s)", "Sortie", "Exécutions",
// "modifications non enregistrées", "vérification…".

export const en = {
  // Editor chrome
  'editor.breadcrumb.workflows': 'Workflows',
  'editor.unsaved': 'Unsaved changes',
  'editor.btn.runs': 'Runs',
  'editor.btn.versions': 'Versions',
  'editor.btn.saved': 'Saved',

  // Run modal
  'editor.run.title': 'Run workflow',
  'editor.run.subtitle': 'Runs {version} — the currently saved version',
  'editor.run.dropPrompt': 'Drop PDF or click to upload',
  'editor.run.sizeHint': 'Up to 100 MB',
  'editor.run.orChooseExisting': 'Or choose existing',
  'editor.run.submit': 'Run Workflow',
  'editor.run.starting': 'Starting…',

  // Node palette
  'editor.palette.title': 'Nodes',
  'editor.palette.subtitle': 'Drag to canvas',
  'editor.palette.hint': 'Connect nodes by dragging from a bottom handle to a top handle.',

  // Node sublabels (palette + cards)
  'editor.sublabel.source': 'source',
  'editor.sublabel.transform': 'transform',
  'editor.sublabel.process': 'process',
  'editor.sublabel.sink': 'sink',
  'editor.sublabel.action': 'action',

  // Palette node labels + descriptions
  'editor.node.input.label': 'Input',
  'editor.node.input.desc': 'Entry point for the workflow',
  'editor.node.email_input.label': 'Email Input',
  'editor.node.email_input.desc': 'Triggers when an email is received',
  'editor.node.pdf_to_images.label': 'PDF → Images',
  'editor.node.pdf_to_images.desc': 'Render PDF pages as PNG',
  'editor.node.ai.label': 'AI',
  'editor.node.ai.desc': 'Process data with an AI prompt',
  'editor.node.validate_documents.label': 'Validate Documents',
  'editor.node.validate_documents.desc': 'Run a validation policy against documents',
  'editor.node.output.label': 'Output',
  'editor.node.output.desc': 'Collect and finalize results',
  'editor.node.send_email.label': 'Send Email',
  'editor.node.send_email.desc': 'Send an email using template variables',
  'editor.node.show_results.label': 'Show Results',
  'editor.node.show_results.desc': 'Display run results on dashboard widget',

  // Node card headers
  'editor.card.input.header': 'Input',
  'editor.card.transform.header': 'Transform',
  'editor.card.output.header': 'Output',
  'editor.card.show_results.header': 'Show Results',
  'editor.card.email_input.header': 'Email Input',
  'editor.card.ai.header': 'AI',
  'editor.card.send_email.header': 'Send Email',

  // InputNode body
  'editor.input.title': 'Document Upload',
  'editor.input.subtitle': 'Accepts any document file',

  // PdfToImagesNode body
  'editor.pdf.title': 'PDF → Images',
  'editor.pdf.subtitle': 'Renders each page as PNG',

  // OutputNode body
  'editor.output.title': 'Collect Results',
  'editor.output.subtitle': 'Finalizes and stores manifest',

  // ShowResultsNode body
  'editor.show.title': 'Show Results',
  'editor.show.subtitle': 'Displays results on the Dashboard',

  // EmailInputNode body
  'editor.emailInput.title': 'Email Trigger',
  'editor.emailInput.fields': '{count} fields passed downstream',
  'editor.emailInput.field': '{count} field passed downstream',

  // AiNode body
  'editor.ai.title': 'AI',
  'editor.ai.noPrompt': 'No prompt configured',

  // SendEmailNode body
  'editor.sendEmail.title': 'Send Email',
  'editor.sendEmail.to': 'To: {to}',
  'editor.sendEmail.noRecipient': 'No recipient configured',

  // ValidateDocumentsNode
  'editor.validate.title': 'Validate Documents',
  'editor.validate.noPolicy': 'No policy',
  'editor.validate.loadingRules': 'Loading rules…',
  'editor.validate.selectPolicy': 'Select a policy to see rules',
  'editor.validate.moreRules': '+{count} more rules',
  'editor.validate.opt': 'opt',
  'editor.validate.viewFullResults': 'View full results',
  'editor.validate.badge': 'validate',
  'editor.validate.overall.review': 'review',
}

export const fr = {
  // Editor chrome
  'editor.breadcrumb.workflows': 'Flux de travail',
  'editor.unsaved': 'Modifications non enregistrées',
  'editor.btn.runs': 'Exécutions',
  'editor.btn.versions': 'Versions',
  'editor.btn.saved': 'Enregistré',

  // Run modal
  'editor.run.title': 'Exécuter le flux de travail',
  'editor.run.subtitle': 'Exécute {version} — la version actuellement enregistrée',
  'editor.run.dropPrompt': 'Déposez un PDF ou cliquez pour téléverser',
  'editor.run.sizeHint': 'Jusqu’à 100 Mo',
  'editor.run.orChooseExisting': 'Ou choisir un existant',
  'editor.run.submit': 'Exécuter le flux de travail',
  'editor.run.starting': 'Démarrage…',

  // Node palette
  'editor.palette.title': 'Nœuds',
  'editor.palette.subtitle': 'Glisser vers le canevas',
  'editor.palette.hint': 'Reliez les nœuds en glissant d’une poignée du bas vers une poignée du haut.',

  // Node sublabels
  'editor.sublabel.source': 'source',
  'editor.sublabel.transform': 'transformation',
  'editor.sublabel.process': 'traitement',
  'editor.sublabel.sink': 'puits',
  'editor.sublabel.action': 'action',

  // Palette node labels + descriptions
  'editor.node.input.label': 'Entrée',
  'editor.node.input.desc': 'Point d’entrée du flux de travail',
  'editor.node.email_input.label': 'Entrée courriel',
  'editor.node.email_input.desc': 'Se déclenche à la réception d’un courriel',
  'editor.node.pdf_to_images.label': 'PDF → Images',
  'editor.node.pdf_to_images.desc': 'Convertir les pages PDF en PNG',
  'editor.node.ai.label': 'IA',
  'editor.node.ai.desc': 'Traiter les données avec une consigne IA',
  'editor.node.validate_documents.label': 'Valider les documents',
  'editor.node.validate_documents.desc': 'Appliquer une politique de validation aux documents',
  'editor.node.output.label': 'Sortie',
  'editor.node.output.desc': 'Recueillir et finaliser les résultats',
  'editor.node.send_email.label': 'Envoyer un courriel',
  'editor.node.send_email.desc': 'Envoyer un courriel à l’aide de variables de gabarit',
  'editor.node.show_results.label': 'Afficher les résultats',
  'editor.node.show_results.desc': 'Afficher les résultats de l’exécution dans le widget du tableau de bord',

  // Node card headers
  'editor.card.input.header': 'Entrée',
  'editor.card.transform.header': 'Transformation',
  'editor.card.output.header': 'Sortie',
  'editor.card.show_results.header': 'Afficher les résultats',
  'editor.card.email_input.header': 'Entrée courriel',
  'editor.card.ai.header': 'IA',
  'editor.card.send_email.header': 'Envoyer un courriel',

  // InputNode body
  'editor.input.title': 'Téléversement de document',
  'editor.input.subtitle': 'Accepte tout fichier de document',

  // PdfToImagesNode body
  'editor.pdf.title': 'PDF → Images',
  'editor.pdf.subtitle': 'Convertit chaque page en PNG',

  // OutputNode body
  'editor.output.title': 'Recueillir les résultats',
  'editor.output.subtitle': 'Finalise et enregistre le manifeste',

  // ShowResultsNode body
  'editor.show.title': 'Afficher les résultats',
  'editor.show.subtitle': 'Affiche les résultats dans le tableau de bord',

  // EmailInputNode body
  'editor.emailInput.title': 'Déclencheur courriel',
  'editor.emailInput.fields': '{count} champs transmis en aval',
  'editor.emailInput.field': '{count} champ transmis en aval',

  // AiNode body
  'editor.ai.title': 'IA',
  'editor.ai.noPrompt': 'Aucune consigne configurée',

  // SendEmailNode body
  'editor.sendEmail.title': 'Envoyer un courriel',
  'editor.sendEmail.to': 'À : {to}',
  'editor.sendEmail.noRecipient': 'Aucun destinataire configuré',

  // ValidateDocumentsNode
  'editor.validate.title': 'Valider les documents',
  'editor.validate.noPolicy': 'Aucune politique',
  'editor.validate.loadingRules': 'Chargement des règles…',
  'editor.validate.selectPolicy': 'Sélectionnez une politique pour voir les règles',
  'editor.validate.moreRules': '+{count} autres règles',
  'editor.validate.opt': 'fac',
  'editor.validate.viewFullResults': 'Voir tous les résultats',
  'editor.validate.badge': 'valider',
  'editor.validate.overall.review': 'à réviser',
}
