import { useCallback, useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { ensureCloudIconPacks, detectProviders } from '@/lib/cloudIconPacks'

const SAMPLE_DIAGRAM = `architecture-beta
  %% Reordered left-to-right for better fit in preview
  group edge[Edge]
  group compute[Compute]
  group data[Data]
  group monitoring[Monitoring]

  service dns(icon:aws:route-53)[Route 53] in edge
  service waf(icon:aws:waf)[WAF] in edge
  service cf(icon:aws:cloudfront)[CloudFront] in edge
  service s3fe(icon:aws:simple-storage-service)[S3 frontend] in edge

  service alb(icon:aws:elastic-load-balancing)[ALB] in compute
  service ecs(icon:aws:elastic-container-service)[ECS Fargate] in compute
  service ecr(icon:aws:elastic-container-registry)[ECR] in compute
  service sm(icon:aws:secrets-manager)[Secrets Mgr] in data

  service cognito(icon:aws:cognito)[Cognito] in edge
  service dynamo(icon:aws:dynamodb)[DynamoDB] in data
  service s3exams(icon:aws:simple-storage-service)[S3 exams] in data

  service eb(icon:aws:eventbridge)[EventBridge] in monitoring
  service lambda(icon:aws:lambda)[Lambda] in monitoring
  service apigw(icon:aws:api-gateway)[API GW] in monitoring
  service cw(icon:aws:cloudwatch)[CloudWatch] in monitoring

  dns:R -- L:waf
  waf:R -- L:cf
  cf:R -- L:alb
  cf:B -- T:s3fe
  cognito:R -- R:s3fe

  alb:R -- L:ecs

  ecr:B -- T:ecs
  sm:B -- T:ecs

  ecs:B -- T:dynamo
  ecs:R -- L:s3exams

  eb:R -- L:lambda
  apigw:B -- T:lambda
  lambda:R -- L:cw
  lambda:B -- T:dynamo`

let mermaidTheme: string | null = null

export function DiagramsView() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  const [code, setCode] = useState(SAMPLE_DIAGRAM)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const renderIdRef = useRef(0)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const [rawSvg, setRawSvg] = useState<string>('')

  const ensureViewBox = useCallback((svgStr: string) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svgStr, 'image/svg+xml')
    const el = doc.querySelector('svg')
    if (!el) return svgStr
    if (!el.getAttribute('viewBox')) {
      const w = parseFloat((el.getAttribute('width') ?? '0').replace(/px$/, ''))
      const h = parseFloat((el.getAttribute('height') ?? '0').replace(/px$/, ''))
      if (w > 0 && h > 0) el.setAttribute('viewBox', `0 0 ${w} ${h}`)
    }
    el.setAttribute('width', '100%')
    el.removeAttribute('height')
    el.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    return new XMLSerializer().serializeToString(el)
  }, [])

  const exportPng = useCallback(() => {
    if (!rawSvg) return
    const parser = new DOMParser()
    const doc = parser.parseFromString(rawSvg, 'image/svg+xml')
    const el = doc.querySelector('svg')
    if (!el) return
    const w = parseFloat((el.getAttribute('width') ?? '800').replace(/px$/, '')) * 2
    const h = parseFloat((el.getAttribute('height') ?? '600').replace(/px$/, '')) * 2
    if (!el.getAttribute('viewBox')) {
      el.setAttribute('viewBox', `0 0 ${w / 2} ${h / 2}`)
    }
    el.setAttribute('width', String(w))
    el.setAttribute('height', String(h))
    const blob = new Blob([new XMLSerializer().serializeToString(el)], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#09090b'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(pngBlob)
        a.download = 'architecture-diagram.png'
        a.click()
        URL.revokeObjectURL(a.href)
      }, 'image/png')
    }
    img.src = url
  }, [rawSvg])

  const renderDiagram = useCallback(async (diagramCode: string, theme: string) => {
    const id = ++renderIdRef.current
    setRendering(true)
    setError(null)
    try {
      await ensureCloudIconPacks(detectProviders(diagramCode))
      const mTheme = theme === 'dark' ? 'dark' : 'default'
      if (mermaidTheme !== mTheme) {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: mTheme })
        mermaidTheme = mTheme
      }
      const uniqueId = `mermaid-diagram-${id}`
      const { svg: rendered } = await mermaid.render(uniqueId, diagramCode)
      if (renderIdRef.current === id) {
        setRawSvg(rendered)
        setSvg(ensureViewBox(rendered))
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
  }, [ensureViewBox])

  useEffect(() => {
    const theme = isDark ? 'dark' : 'light'
    const timer = setTimeout(() => renderDiagram(code, theme), 300)
    return () => clearTimeout(timer)
  }, [code, isDark, renderDiagram])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        {/* Preview */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">Preview</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded hover:bg-primary/10 hover:text-primary transition-colors"
                onClick={exportPng}
              >
                Export PNG
              </button>
              {rendering && (
                <span className="text-xs text-muted-foreground animate-pulse">Rendering…</span>
              )}
            </div>
          </div>
          <div ref={previewRef} className="w-full min-h-80 rounded-lg border border-border bg-card p-4 overflow-auto">
            {error ? (
              <div className="text-sm text-destructive font-mono whitespace-pre-wrap">{error}</div>
            ) : svg ? (
              <div
                className="w-full [&_svg]:w-full [&_svg]:h-auto"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              !rendering && <span className="text-muted-foreground text-sm">No output</span>
            )}
          </div>
        </div>

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
            Use the <code className="bg-muted px-1 rounded">logos:aws-*</code> prefix for AWS icons
            (bundled from <code className="bg-muted px-1 rounded">@iconify-json/logos</code>). See the{' '}
            <a
              href="https://icon-sets.iconify.design/logos/?keyword=aws"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              full AWS icons list
            </a>{' '}
            for all available codes.
          </p>
        </div>
      </div>

      {/* Mermaid AWS icons reference link */}
      <div className="text-right mt-2">
        <a
          href="https://icon-sets.iconify.design/logos/?keyword=aws"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline"
        >
          Browse all logos:aws-* icons
        </a>
      </div>

      {/* Icon reference */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold">AWS Icons for <code className="bg-muted px-1 rounded">architecture-beta</code></h3>
        <p className="text-xs text-muted-foreground">All icons use the <code className="bg-muted px-1 rounded">logos:aws-*</code> prefix. Click to copy.</p>
        {[
          { label: 'Networking / Edge', icons: [
            'logos:aws-elb',
            'logos:aws-vpc',
            'logos:aws-route53',
            'logos:aws-cloudfront',
            'logos:aws-waf',
          ]},
          { label: 'Compute', icons: [
            'logos:aws-ec2',
            'logos:aws-lambda',
            'logos:aws-ecs',
            'logos:aws-eks',
            'logos:aws-fargate',
            'logos:aws-ecr',
            'logos:aws-elastic-beanstalk',
            'logos:aws-batch',
          ]},
          { label: 'Storage', icons: [
            'logos:aws-s3',
            'logos:aws-glacier',
          ]},
          { label: 'Databases', icons: [
            'logos:aws-rds',
            'logos:aws-aurora',
            'logos:aws-dynamodb',
            'logos:aws-elasticache',
            'logos:aws-redshift',
            'logos:aws-neptune',
            'logos:aws-documentdb',
            'logos:aws-keyspaces',
            'logos:aws-timestream',
          ]},
          { label: 'Integration / Messaging', icons: [
            'logos:aws-api-gateway',
            'logos:aws-eventbridge',
            'logos:aws-sns',
            'logos:aws-sqs',
            'logos:aws-step-functions',
            'logos:aws-mq',
            'logos:aws-msk',
            'logos:aws-appsync',
          ]},
          { label: 'Security / Identity', icons: [
            'logos:aws-cognito',
            'logos:aws-iam',
            'logos:aws-waf',
            'logos:aws-shield',
            'logos:aws-secrets-manager',
            'logos:aws-kms',
            'logos:aws-certificate-manager',
          ]},
          { label: 'Management / Monitoring', icons: [
            'logos:aws-cloudwatch',
            'logos:aws-cloudtrail',
            'logos:aws-config',
            'logos:aws-systems-manager',
            'logos:aws-cloudformation',
            'logos:aws-xray',
          ]},
        ].map((group) => (
          <div key={group.label}>
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">{group.label}</h4>
            <div className="flex flex-wrap gap-2 text-xs font-mono">
              {group.icons.map((icon) => (
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
          </div>
        ))}
      </div>
    </div>
  )
}
