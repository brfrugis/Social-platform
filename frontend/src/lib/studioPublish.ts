/** Composer entry points for social platforms (manual paste until server publish exists). */

export const PLATFORM_LABEL: Record<string, string> = {
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
  instagram: 'Instagram',
  facebook: 'Facebook',
}

/** Open a place to create a post; user pastes after Copy. */
export function composerUrlForPlatform(platform: string): string {
  switch (platform) {
    case 'linkedin':
      return 'https://www.linkedin.com/feed/'
    case 'x':
      return 'https://x.com/compose/post'
    case 'instagram':
      return 'https://business.facebook.com/latest/home'
    case 'facebook':
      return 'https://www.facebook.com/'
    default:
      return 'https://www.linkedin.com/feed/'
  }
}
