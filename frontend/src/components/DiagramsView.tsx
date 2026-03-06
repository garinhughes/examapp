import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import mermaid from 'mermaid'
import { icons as logosIcons } from '@iconify-json/logos'

const SAMPLE_DIAGRAM = `architecture-beta
  group api(logos:aws-lambda)[API]

  service db(logos:aws-aurora)[Database] in api
  service disk1(logos:aws-glacier)[Storage] in api
  service disk2(logos:aws-s3)[Storage] in api
  service server(logos:aws-ec2)[Server] in api

  db:L -- R:server
  disk1:T -- B:server
  disk2:T -- B:db`

let iconPacksRegistered = false
let mermaidTheme: string | null = null

function ensureIconPacks() {
  if (!iconPacksRegistered) {
    mermaid.registerIconPacks([{ name: 'logos', icons: logosIcons }])
    iconPacksRegistered = true
  }
}

export function DiagramsView() {
  const { resolvedTheme } = useTheme()
  const [code, setCode] = useState(SAMPLE_DIAGRAM)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const renderIdRef = useRef(0)

  const renderDiagram = useCallback(async (diagramCode: string, theme: string) => {
    const id = ++renderIdRef.current
    setRendering(true)
    setError(null)
    try {
      ensureIconPacks()
      const mTheme = theme === 'dark' ? 'dark' : 'default'
      if (mermaidTheme !== mTheme) {
        mermaid.initialize({ startOnLoad: false, theme: mTheme })
        mermaidTheme = mTheme
      }
      const uniqueId = `mermaid-diagram-${id}`
      const { svg: rendered } = await mermaid.render(uniqueId, diagramCode)
      if (renderIdRef.current === id) {
        setSvg(rendered)
      }
    } catch (e: any) {
      if (renderIdRef.current === id) {
        setError(e?.message ?? String(e))
        setSvg('')
      }
    } finally {
      if (renderIdRef.current === id) {
        setRendering(false)
      }
    }
  }, [])

  useEffect(() => {
    const theme = resolvedTheme ?? 'dark'
    const timer = setTimeout(() => renderDiagram(code, theme), 300)
    return () => clearTimeout(timer)
  }, [code, resolvedTheme, renderDiagram])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">Mermaid Code</label>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">architecture-beta</span>
          </div>
          <textarea
            className="w-full h-80 rounded-lg border border-border bg-card text-foreground font-mono text-sm p-4 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            Uses <code className="bg-muted px-1 rounded">logos:*</code> icons from{' '}
            <span className="font-medium">@iconify-json/logos</span>. AWS icons:&nbsp;
            <code className="bg-muted px-1 rounded">logos:aws-lambda</code>,{' '}
            <code className="bg-muted px-1 rounded">logos:aws-ec2</code>,{' '}
            <code className="bg-muted px-1 rounded">logos:aws-s3</code>, etc.
          </p>
        </div>

        {/* Preview */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">Preview</label>
            {rendering && (
              <span className="text-xs text-muted-foreground animate-pulse">Rendering…</span>
            )}
          </div>
          <div className="flex-1 min-h-80 rounded-lg border border-border bg-card flex items-center justify-center p-4 overflow-auto">
            {error ? (
              <div className="text-sm text-destructive font-mono whitespace-pre-wrap">{error}</div>
            ) : svg ? (
              <div
                className="w-full flex items-center justify-center [&_svg]:max-w-full [&_svg]:h-auto"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              !rendering && <span className="text-muted-foreground text-sm">No output</span>
            )}
          </div>
        </div>
      </div>

      {/* Icon reference */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Common AWS Icons</h3>
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          {[
            'logos:aws-lambda',
            'logos:aws-ec2',
            'logos:aws-s3',
            'logos:aws-aurora',
            'logos:aws-glacier',
            'logos:aws-cloudfront',
            'logos:aws-cognito',
            'logos:aws-dynamodb',
            'logos:aws-ecs',
            'logos:aws-fargate',
            'logos:aws-api-gateway',
            'logos:aws-cloudwatch',
            'logos:aws-sns',
            'logos:aws-sqs',
            'logos:aws-rds',
            'logos:aws-elastic-load-balancing',
          ].map((icon) => (
            <code
              key={icon}
              className="bg-muted px-2 py-1 rounded cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
              title="Click to copy"
              onClick={() => navigator.clipboard.writeText(icon)}
            >
              {icon}
            </code>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Click any icon name to copy it.</p>
      </div>
    </div>
  )
}
