export type NavId = 'studio' | 'translate' | 'templates' | 'library'

export const NAV: { id: NavId; label: string; hint: string }[] = [
  { id: 'studio', label: 'Studio', hint: 'Brief, guardrails, formats, then generate' },
  { id: 'translate', label: 'Translate', hint: 'English or Spanish to Brazilian Portuguese' },
  { id: 'templates', label: 'Templates', hint: 'Save rules and layouts to reuse in Studio' },
  { id: 'library', label: 'Formats and tones', hint: 'Edit channel presets as JSON' },
]
