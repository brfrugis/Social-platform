export type NavId =
  | 'studio'
  | 'translate'
  | 'templates'
  | 'workspace'
  | 'integrations'
  | 'library'

export const NAV: { id: NavId; label: string; hint: string }[] = [
  { id: 'studio', label: 'Studio', hint: 'Brief, guardrails, formats, then generate' },
  { id: 'translate', label: 'Translate', hint: 'English or Spanish to Brazilian Portuguese' },
  { id: 'templates', label: 'Templates', hint: 'Save rules and layouts to reuse in Studio' },
  { id: 'workspace', label: 'Workspace', hint: 'Principal ID and active customer (tenant)' },
  { id: 'integrations', label: 'Integrations', hint: 'LinkedIn, X, Instagram, Facebook — per active customer' },
  { id: 'library', label: 'Formats and tones', hint: 'Edit channel presets as JSON' },
]
