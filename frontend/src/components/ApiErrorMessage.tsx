import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  context?: string
}

export function ApiErrorMessage({ context }: Props) {
  const subject = encodeURIComponent('certshack — page not loading')
  const body = encodeURIComponent(
    `Hi,\n\nI'm having trouble loading ${context ?? 'content'} on certshack.com. The page shows an error.\n\nURL: ${window.location.href}\nTime: ${new Date().toISOString()}\n`
  )

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
        <AlertTriangle className="w-6 h-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">Something went wrong</p>
        <p className="text-sm text-muted-foreground">
          {context ? `Unable to load ${context}.` : 'This content failed to load.'}{' '}
          This is usually temporary — try refreshing the page.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Refresh
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href={`mailto:support@certshack.com?subject=${subject}&body=${body}`}>
            Report issue
          </a>
        </Button>
      </div>
    </div>
  )
}
