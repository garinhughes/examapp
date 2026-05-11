import { useCallback, useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { ensureCloudIconPacks, detectProviders } from '@/lib/cloudIconPacks'

const SAMPLE_DIAGRAM = `architecture-beta
  group cdn[Edge CDN]
  group vpc[Private VPC]
  group data[Data]
  group monitoring[Monitoring]

  service dns(icon:aws:route-53)[Route 53] in cdn
  service waf(icon:aws:waf)[WAF] in cdn
  service cfFE(icon:aws:cloudfront)[CloudFront Frontend] in cdn
  service s3fe(icon:aws:simple-storage-service)[S3 Frontend] in cdn
  service cfAPI(icon:aws:cloudfront)[CloudFront Backend API] in cdn

  service alb(icon:aws:elastic-load-balancing)[Internal ALB] in vpc
  service ecs(icon:aws:elastic-container-service)[ECS Fargate] in vpc
  service ecr(icon:aws:elastic-container-registry)[ECR] in vpc
  service sm(icon:aws:secrets-manager)[Secrets Mgr] in vpc
  service cognito(icon:aws:cognito)[Cognito] in vpc

  service dynamo(icon:aws:dynamodb)[DynamoDB] in data
  service s3data(icon:aws:simple-storage-service)[S3 Exams and Labs] in data

  service eb(icon:aws:eventbridge)[EventBridge] in monitoring
  service lambda(icon:aws:lambda)[Lambda] in monitoring
  service apigw(icon:aws:api-gateway)[API GW] in monitoring
  service cw(icon:aws:cloudwatch)[CloudWatch] in monitoring

  dns:R -- L:waf
  waf:R -- L:cfFE
  cfFE:B -- T:s3fe
  cfFE:R -- L:cfAPI
  cfAPI:B -- T:alb

  alb:R -- L:ecs
  ecr:B -- T:ecs
  sm:B -- T:ecs
  ecs:B -- T:cognito

  ecs:R -- L:dynamo
  dynamo:R -- L:s3data

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
            Use <code className="bg-muted px-1 rounded">icon:aws:</code>, <code className="bg-muted px-1 rounded">icon:azure:</code>, <code className="bg-muted px-1 rounded">icon:gcp:</code> for cloud icons (fetched from S3),{' '}
            <code className="bg-muted px-1 rounded">icon:logos:</code> for tech logos (docker, mysql, terraform…),{' '}
            and <code className="bg-muted px-1 rounded">icon:general:</code> for generic nodes (server, database, user…).
          </p>
        </div>
      </div>

      {/* Icon reference */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold">Icon reference for <code className="bg-muted px-1 rounded">architecture-beta</code></h3>
        <p className="text-xs text-muted-foreground">Click any icon name to copy it.</p>
        {[
          { label: 'AWS — Networking / Edge', icons: [
            'icon:aws:elastic-load-balancing',
            'icon:aws:virtual-private-cloud',
            'icon:aws:route-53',
            'icon:aws:cloudfront',
            'icon:aws:waf',
            'icon:aws:direct-connect',
            'icon:aws:site-to-site-vpn',
            'icon:aws:transit-gateway',
            'icon:aws:global-accelerator',
          ]},
          { label: 'AWS — Compute', icons: [
            'icon:aws:ec2',
            'icon:aws:lambda',
            'icon:aws:elastic-container-service',
            'icon:aws:elastic-kubernetes-service',
            'icon:aws:fargate-compute',
            'icon:aws:elastic-container-registry',
            'icon:aws:elastic-beanstalk',
            'icon:aws:batch',
            'icon:aws:ec2-auto-scaling',
          ]},
          { label: 'AWS — Storage', icons: [
            'icon:aws:simple-storage-service',
            'icon:aws:simple-storage-service-glacier',
            'icon:aws:elastic-block-store',
            'icon:aws:efs',
            'icon:aws:storage-gateway',
            'icon:aws:backup',
            'icon:aws:snowball',
          ]},
          { label: 'AWS — Databases', icons: [
            'icon:aws:rds',
            'icon:aws:aurora',
            'icon:aws:dynamodb',
            'icon:aws:elasticache',
            'icon:aws:redshift',
            'icon:aws:neptune',
            'icon:aws:documentdb',
            'icon:aws:database-migration-service',
          ]},
          { label: 'AWS — Integration / Messaging', icons: [
            'icon:aws:api-gateway',
            'icon:aws:eventbridge',
            'icon:aws:simple-notification-service',
            'icon:aws:simple-queue-service',
            'icon:aws:step-functions',
            'icon:aws:mq',
            'icon:aws:managed-streaming-for-apache-kafka',
          ]},
          { label: 'AWS — Security / Identity', icons: [
            'icon:aws:cognito',
            'icon:aws:identity-and-access-management',
            'icon:aws:iam-identity-center',
            'icon:aws:shield',
            'icon:aws:secrets-manager',
            'icon:aws:key-management-service',
            'icon:aws:certificate-manager',
            'icon:aws:artifact',
          ]},
          { label: 'AWS — Management / Monitoring', icons: [
            'icon:aws:cloudwatch',
            'icon:aws:cloudtrail',
            'icon:aws:config',
            'icon:aws:systems-manager',
            'icon:aws:cloudformation',
            'icon:aws:cost-explorer',
            'icon:aws:trusted-advisor',
          ]},
          { label: 'General — Compute & Servers', icons: [
            'icon:general:server','icon:general:server-network','icon:general:server-security',
            'icon:general:desktop-tower','icon:general:chip','icon:general:memory',
            'icon:general:layers','icon:general:layers-triple','icon:general:cube',
            'icon:general:application','icon:general:package-variant','icon:general:docker',
            'icon:general:kubernetes',
          ]},
          { label: 'General — Storage & Files', icons: [
            'icon:general:database','icon:general:database-lock','icon:general:database-sync',
            'icon:general:harddisk','icon:general:nas','icon:general:folder-network',
            'icon:general:file','icon:general:file-document','icon:general:file-code',
            'icon:general:archive','icon:general:backup-restore',
          ]},
          { label: 'General — Networking', icons: [
            'icon:general:network','icon:general:sitemap','icon:general:router',
            'icon:general:router-wireless','icon:general:access-point',
            'icon:general:transit-connection-variant','icon:general:ethernet',
            'icon:general:vpn','icon:general:wall-fire','icon:general:ip-network',
            'icon:general:lan','icon:general:wan','icon:general:switch','icon:general:hub',
          ]},
          { label: 'General — Internet & Cloud', icons: [
            'icon:general:earth','icon:general:cloud','icon:general:cloud-sync',
            'icon:general:cloud-lock','icon:general:web','icon:general:wifi',
            'icon:general:signal',
          ]},
          { label: 'General — Security', icons: [
            'icon:general:shield','icon:general:shield-check','icon:general:shield-lock',
            'icon:general:shield-key','icon:general:lock','icon:general:lock-alert',
            'icon:general:key','icon:general:key-variant','icon:general:fingerprint',
            'icon:general:two-factor-authentication','icon:general:certificate',
            'icon:general:incognito','icon:general:eye','icon:general:eye-off',
          ]},
          { label: 'General — Users & Identity', icons: [
            'icon:general:account','icon:general:account-group','icon:general:account-multiple',
            'icon:general:account-key','icon:general:account-lock','icon:general:domain',
            'icon:general:badge-account','icon:general:card-account-details',
          ]},
          { label: 'General — Devices', icons: [
            'icon:general:laptop','icon:general:monitor','icon:general:cellphone',
            'icon:general:tablet','icon:general:keyboard','icon:general:printer',
            'icon:general:camera','icon:general:webcam',
          ]},
          { label: 'General — Messaging & Integration', icons: [
            'icon:general:email','icon:general:email-fast','icon:general:bell',
            'icon:general:bell-alert','icon:general:api','icon:general:webhook',
            'icon:general:message-text','icon:general:send','icon:general:sync',
            'icon:general:transfer','icon:general:rss',
          ]},
          { label: 'General — Dev & Automation', icons: [
            'icon:general:git','icon:general:source-branch','icon:general:code-braces',
            'icon:general:console','icon:general:console-line','icon:general:language-python',
            'icon:general:ansible','icon:general:terraform',
            'icon:general:cog','icon:general:cogs','icon:general:robot',
            'icon:general:pipe','icon:general:state-machine',
          ]},
          { label: 'General — Monitoring & Misc', icons: [
            'icon:general:chart-line','icon:general:chart-bar','icon:general:gauge',
            'icon:general:monitor-dashboard','icon:general:alert','icon:general:alert-circle',
            'icon:general:magnify','icon:general:pulse','icon:general:clock',
            'icon:general:tag','icon:general:wrench','icon:general:tools',
            'icon:general:lightning-bolt','icon:general:power','icon:general:refresh',
            'icon:general:check-circle','icon:general:close-circle','icon:general:information',
          ]},
          { label: 'Tech logos (bundled)', icons: [
            'icon:logos:docker-icon',
            'icon:logos:kubernetes',
            'icon:logos:terraform-icon',
            'icon:logos:mysql-icon',
            'icon:logos:postgresql',
            'icon:logos:mongodb-icon',
            'icon:logos:redis',
            'icon:logos:linux-tux',
            'icon:logos:nginx',
            'icon:logos:github-icon',
            'icon:logos:redhat-icon',
            'icon:logos:terminal',
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
