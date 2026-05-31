// Strings for NodeConfigPanel — the per-node configuration sidebar in the
// workflow editor. Quebec French conventions: "Configuration" (settings),
// "Politique" (policy), "Modèle" (model), "Invite système" (system prompt).

export const en = {
  'nodeconfig.subtitle': 'Node configuration',
  'nodeconfig.noNode.title': 'No node selected',
  'nodeconfig.noNode.hint': 'Select a node to configure',

  // Node titles
  'nodeconfig.title.input': 'Document Input',
  'nodeconfig.title.email_input': 'Email Input',
  'nodeconfig.title.pdf_to_images': 'PDF → Images',
  'nodeconfig.title.ai': 'AI',
  'nodeconfig.title.validate_documents': 'Validate Documents',
  'nodeconfig.title.output': 'Collect Output',
  'nodeconfig.title.send_email': 'Send Email',
  'nodeconfig.title.show_results': 'Show Results',

  // Node type labels (variable groups)
  'nodeconfig.typeLabel.input': 'Input',
  'nodeconfig.typeLabel.email_input': 'Email Input',
  'nodeconfig.typeLabel.pdf_to_images': 'PDF → Images',
  'nodeconfig.typeLabel.validate_documents': 'Validate Documents',
  'nodeconfig.typeLabel.ai': 'AI',
  'nodeconfig.typeLabel.send_email': 'Send Email',
  'nodeconfig.typeLabel.output': 'Output',
  'nodeconfig.typeLabel.show_results': 'Show Results',

  // Variable definitions
  'nodeconfig.var.document_id': 'Document ID',
  'nodeconfig.var.file_path': 'File Path',
  'nodeconfig.var.mime_type': 'MIME Type',
  'nodeconfig.var.subject': 'Subject',
  'nodeconfig.var.from': 'From',
  'nodeconfig.var.to': 'To',
  'nodeconfig.var.body': 'Body',
  'nodeconfig.var.image_paths': 'Image Paths',
  'nodeconfig.var.page_count': 'Page Count',
  'nodeconfig.var.overall': 'Overall Result',
  'nodeconfig.var.results': 'Rule Results',
  'nodeconfig.var.policy_name': 'Policy Name',
  'nodeconfig.var.ai_response': 'AI Response',
  'nodeconfig.var.sent_to': 'Sent To',
  'nodeconfig.var.sent_subject': 'Sent Subject',

  // Prompt editor
  'nodeconfig.variables': 'Variables',
  'nodeconfig.var.from_node': 'from {node}',
  'nodeconfig.var.connectHint': 'Connect upstream nodes to see available variables.',
  'nodeconfig.toolbar.bold': 'Bold',
  'nodeconfig.toolbar.italic': 'Italic',
  'nodeconfig.toolbar.bullet': 'Bullet list',
  'nodeconfig.toolbar.quote': 'Blockquote',
  'nodeconfig.fmt.bold': 'bold',
  'nodeconfig.fmt.italic': 'italic',
  'nodeconfig.fmt.item': 'item',
  'nodeconfig.fmt.quote': 'quote',

  // Input config
  'nodeconfig.about': 'About',
  'nodeconfig.input.about': 'Accepts any uploaded document. The selected file is passed downstream as the workflow input.',

  // Email input config
  'nodeconfig.email.fields': 'Fields to pass downstream',
  'nodeconfig.email.field.subject': 'Subject',
  'nodeconfig.email.field.from': 'From',
  'nodeconfig.email.field.to': 'To',
  'nodeconfig.email.field.body': 'Body',
  'nodeconfig.email.field.attachments': 'Attachments',
  'nodeconfig.email.inboxHint': "Enable this workflow's email inbox from the Workflows list to receive emails.",

  // AI config
  'nodeconfig.ai.prompt': 'Prompt',
  'nodeconfig.ai.promptPlaceholder': 'Summarise the email in one sentence.\n\nEmail subject: {{subject}}\nFrom: {{from}}\n\n{{body}}',
  'nodeconfig.ai.model': 'Model',
  'nodeconfig.ai.defaultOption': '— Default ({model}) —',
  'nodeconfig.ai.defaultFromSettings': 'from Settings',
  'nodeconfig.ai.modelPlaceholder': 'e.g. google/gemini-2.0-flash-exp',
  'nodeconfig.ai.apiKeyHint': 'Set your API key in Settings to pick from available models.',

  // Send email config
  'nodeconfig.send.chipTitle': 'Click to copy — then paste into any field',
  'nodeconfig.send.focusHint': 'Focus a field, then click a chip to insert it there.',
  'nodeconfig.send.to': 'To',
  'nodeconfig.send.toPlaceholder': '{{from}} or alice@example.com',
  'nodeconfig.send.subject': 'Subject',
  'nodeconfig.send.subjectPlaceholder': 'Re: {{subject}}',
  'nodeconfig.send.body': 'Body',
  'nodeconfig.send.bodyPlaceholder': 'Hi,\n\n{{ai_response}}\n\nBest regards',

  // PDF to images config
  'nodeconfig.pdf.renderScale': 'Render scale',
  'nodeconfig.pdf.scale1': '1× — 72 dpi',
  'nodeconfig.pdf.scale15': '1.5× — 108 dpi',
  'nodeconfig.pdf.scale2': '2× — 144 dpi (default)',
  'nodeconfig.pdf.scale3': '3× — 216 dpi',

  // Output config
  'nodeconfig.output.folder': 'Output folder',
  'nodeconfig.output.placeholder': 'e.g. exports/invoices',
  'nodeconfig.output.hint': 'Relative path within storage. Leave empty to skip copying.',

  // Show results config
  'nodeconfig.showResults.about': 'Add this node to display results on the Dashboard widget. When a run completes, the dashboard will show the output inline.',

  // Validate documents config
  'nodeconfig.validate.policy': 'Policy',
  'nodeconfig.validate.selectPolicy': '— Select a policy —',
  'nodeconfig.validate.rules': 'Rules',
  'nodeconfig.validate.viewResults': 'View full results',
  'nodeconfig.validate.failTitle': 'Fail run on rejection',
  'nodeconfig.validate.failHint': 'Stop workflow if required rules fail',
  'nodeconfig.validate.confidence': '{percent}% confidence',
}

export const fr = {
  'nodeconfig.subtitle': 'Configuration du nœud',
  'nodeconfig.noNode.title': 'Aucun nœud sélectionné',
  'nodeconfig.noNode.hint': 'Sélectionnez un nœud à configurer',

  // Node titles
  'nodeconfig.title.input': 'Entrée de document',
  'nodeconfig.title.email_input': 'Entrée courriel',
  'nodeconfig.title.pdf_to_images': 'PDF → Images',
  'nodeconfig.title.ai': 'IA',
  'nodeconfig.title.validate_documents': 'Valider les documents',
  'nodeconfig.title.output': 'Collecter la sortie',
  'nodeconfig.title.send_email': 'Envoyer un courriel',
  'nodeconfig.title.show_results': 'Afficher les résultats',

  // Node type labels (variable groups)
  'nodeconfig.typeLabel.input': 'Entrée',
  'nodeconfig.typeLabel.email_input': 'Entrée courriel',
  'nodeconfig.typeLabel.pdf_to_images': 'PDF → Images',
  'nodeconfig.typeLabel.validate_documents': 'Valider les documents',
  'nodeconfig.typeLabel.ai': 'IA',
  'nodeconfig.typeLabel.send_email': 'Envoyer un courriel',
  'nodeconfig.typeLabel.output': 'Sortie',
  'nodeconfig.typeLabel.show_results': 'Afficher les résultats',

  // Variable definitions
  'nodeconfig.var.document_id': 'ID du document',
  'nodeconfig.var.file_path': 'Chemin du fichier',
  'nodeconfig.var.mime_type': 'Type MIME',
  'nodeconfig.var.subject': 'Objet',
  'nodeconfig.var.from': 'De',
  'nodeconfig.var.to': 'À',
  'nodeconfig.var.body': 'Corps',
  'nodeconfig.var.image_paths': 'Chemins des images',
  'nodeconfig.var.page_count': 'Nombre de pages',
  'nodeconfig.var.overall': 'Résultat global',
  'nodeconfig.var.results': 'Résultats des règles',
  'nodeconfig.var.policy_name': 'Nom de la politique',
  'nodeconfig.var.ai_response': 'Réponse de l’IA',
  'nodeconfig.var.sent_to': 'Envoyé à',
  'nodeconfig.var.sent_subject': 'Objet envoyé',

  // Prompt editor
  'nodeconfig.variables': 'Variables',
  'nodeconfig.var.from_node': 'depuis {node}',
  'nodeconfig.var.connectHint': 'Connectez des nœuds en amont pour voir les variables disponibles.',
  'nodeconfig.toolbar.bold': 'Gras',
  'nodeconfig.toolbar.italic': 'Italique',
  'nodeconfig.toolbar.bullet': 'Liste à puces',
  'nodeconfig.toolbar.quote': 'Citation',
  'nodeconfig.fmt.bold': 'gras',
  'nodeconfig.fmt.italic': 'italique',
  'nodeconfig.fmt.item': 'élément',
  'nodeconfig.fmt.quote': 'citation',

  // Input config
  'nodeconfig.about': 'À propos',
  'nodeconfig.input.about': 'Accepte tout document téléversé. Le fichier sélectionné est transmis en aval comme entrée du flux de travail.',

  // Email input config
  'nodeconfig.email.fields': 'Champs à transmettre en aval',
  'nodeconfig.email.field.subject': 'Objet',
  'nodeconfig.email.field.from': 'De',
  'nodeconfig.email.field.to': 'À',
  'nodeconfig.email.field.body': 'Corps',
  'nodeconfig.email.field.attachments': 'Pièces jointes',
  'nodeconfig.email.inboxHint': 'Activez la boîte de réception de ce flux de travail depuis la liste des flux de travail pour recevoir des courriels.',

  // AI config
  'nodeconfig.ai.prompt': 'Invite',
  'nodeconfig.ai.promptPlaceholder': 'Résumez le courriel en une phrase.\n\nObjet du courriel : {{subject}}\nDe : {{from}}\n\n{{body}}',
  'nodeconfig.ai.model': 'Modèle',
  'nodeconfig.ai.defaultOption': '— Par défaut ({model}) —',
  'nodeconfig.ai.defaultFromSettings': 'depuis Paramètres',
  'nodeconfig.ai.modelPlaceholder': 'p. ex. google/gemini-2.0-flash-exp',
  'nodeconfig.ai.apiKeyHint': 'Définissez votre clé API dans Paramètres pour choisir parmi les modèles disponibles.',

  // Send email config
  'nodeconfig.send.chipTitle': 'Cliquez pour copier — puis collez dans n’importe quel champ',
  'nodeconfig.send.focusHint': 'Placez le curseur dans un champ, puis cliquez sur une puce pour l’y insérer.',
  'nodeconfig.send.to': 'À',
  'nodeconfig.send.toPlaceholder': '{{from}} ou alice@example.com',
  'nodeconfig.send.subject': 'Objet',
  'nodeconfig.send.subjectPlaceholder': 'Rép. : {{subject}}',
  'nodeconfig.send.body': 'Corps',
  'nodeconfig.send.bodyPlaceholder': 'Bonjour,\n\n{{ai_response}}\n\nCordialement',

  // PDF to images config
  'nodeconfig.pdf.renderScale': 'Échelle de rendu',
  'nodeconfig.pdf.scale1': '1× — 72 ppp',
  'nodeconfig.pdf.scale15': '1,5× — 108 ppp',
  'nodeconfig.pdf.scale2': '2× — 144 ppp (par défaut)',
  'nodeconfig.pdf.scale3': '3× — 216 ppp',

  // Output config
  'nodeconfig.output.folder': 'Dossier de sortie',
  'nodeconfig.output.placeholder': 'p. ex. exports/factures',
  'nodeconfig.output.hint': 'Chemin relatif dans le stockage. Laissez vide pour ne pas copier.',

  // Show results config
  'nodeconfig.showResults.about': 'Ajoutez ce nœud pour afficher les résultats dans la vignette du tableau de bord. À la fin d’une exécution, le tableau de bord affichera la sortie en ligne.',

  // Validate documents config
  'nodeconfig.validate.policy': 'Politique',
  'nodeconfig.validate.selectPolicy': '— Sélectionner une politique —',
  'nodeconfig.validate.rules': 'Règles',
  'nodeconfig.validate.viewResults': 'Voir tous les résultats',
  'nodeconfig.validate.failTitle': 'Échouer l’exécution en cas de rejet',
  'nodeconfig.validate.failHint': 'Arrêter le flux de travail si des règles obligatoires échouent',
  'nodeconfig.validate.confidence': '{percent} % de confiance',
}
