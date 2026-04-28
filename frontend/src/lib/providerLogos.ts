export interface ProviderMeta {
  logo: string
  logoDark?: string
  logoHref?: string
  displayName: string
}

const PROVIDER_LOGOS: Record<string, ProviderMeta> = {
  aws: {
    logo: '/logos/aws.svg',
    logoDark: '/logos/aws-dark.svg',
    logoHref: 'https://aws.amazon.com/',
    displayName: 'AWS',
  },
  anthropic: {
    logo: '/logos/anthropic.svg',
    logoDark: '/logos/anthropic-dark.svg',
    logoHref: 'https://www.anthropic.com/',
    displayName: 'Anthropic',
  },
  comptia: {
    logo: '/logos/comptia.svg',
    logoHref: 'https://www.comptia.org/',
    displayName: 'CompTIA',
  },
  redhat: {
    logo: '/logos/redhat.svg',
    logoDark: '/logos/redhat-dark.svg',
    logoHref: 'https://www.redhat.com/',
    displayName: 'Red Hat',
  },
  azure: {
    logo: '/logos/azure.svg',
    logoHref: 'https://azure.microsoft.com/',
    displayName: 'Azure',
  },
}

export function normalisePlatformKey(platform: string | undefined | null): string {
  if (!platform) return ''
  return platform.toLowerCase().replace(/\s+/g, '').replace(/-/g, '')
}

export function getProviderLogo(provider: string | undefined | null): ProviderMeta | null {
  const key = normalisePlatformKey(provider)
  return PROVIDER_LOGOS[key] ?? null
}
