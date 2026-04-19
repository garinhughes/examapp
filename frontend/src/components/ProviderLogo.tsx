import { useExam } from '@/exam/ExamContext'
import { getProviderLogo } from '@/lib/providerLogos'
import { cn } from '@/lib/utils'

interface ProviderLogoProps {
  provider: string | undefined | null
  size?: 'sm' | 'md'
  className?: string
}

export function ProviderLogo({ provider, size = 'md', className }: ProviderLogoProps) {
  const { dark } = useExam()
  const meta = getProviderLogo(provider)
  const height = size === 'sm' ? 'h-12' : 'h-14'

  if (!meta) {
    return (
      <div className={cn(height, 'bg-muted/40 flex items-center justify-center border-b border-border text-muted-foreground text-xs font-medium', className)}>
        {provider ?? ''}
      </div>
    )
  }

  const src = dark && meta.logoDark ? meta.logoDark : meta.logo
  const inner = (
    <img
      src={src}
      alt={`${meta.displayName} logo`}
      className="max-h-8 max-w-full w-auto object-contain"
    />
  )
  const containerClass = cn(
    height,
    'bg-white dark:bg-muted flex items-center justify-center px-4 border-b border-border',
    className,
  )

  return (
    <div aria-hidden className={containerClass}>
      {inner}
    </div>
  )
}
