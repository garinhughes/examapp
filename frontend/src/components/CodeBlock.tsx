import React from 'react'
import Highlight, { defaultProps, Language } from 'prism-react-renderer'
import theme from 'prism-react-renderer/themes/dracula'

type Props = { code: string; language?: string; inline?: boolean }

export default function CodeBlock({ code, language = 'bash', inline = false }: Props) {
  if (inline) {
    return <code className="font-mono text-sm bg-slate-800 px-1 py-0.5 rounded">{code}</code>
  }
  // For shell/CLI snippets, apply a small tokeniser to highlight options/flags
  if (language === 'bash' || language === 'sh' || language === 'shell') {
    const lines = code.split('\n')
    return (
      <pre className="p-3 rounded bg-slate-900 text-sm overflow-auto font-mono">
        {lines.map((ln, i) => (
          <div key={i} className="leading-6">
            {ln.split(/(\s+)/).map((tok, j) => {
              if (/^\s+$/.test(tok)) return <span key={j}>{tok}</span>
              if (/^--[A-Za-z0-9\-_=]+/.test(tok)) return <span key={j} style={{ color: 'var(--color-correct-2)' }}>{tok}</span>
              if (/^-[A-Za-z0-9]+/.test(tok)) return <span key={j} style={{ color: '#f59e0b' }}>{tok}</span>
              if (/^aws$/.test(tok)) return <span key={j} style={{ color: '#7dd3fc' }}>{tok}</span>
              if (/^[a-z0-9_\-]+\/[a-z0-9_\-]+/.test(tok)) return <span key={j} style={{ color: '#7dd3fc' }}>{tok}</span>
              return <span key={j} style={{ color: '#e2e8f0' }}>{tok}</span>
            })}
          </div>
        ))}
      </pre>
    )
  }

  // YAML tokeniser — highlights keys, values, booleans, and comments
  if (language === 'yaml' || language === 'yml') {
    const lines = code.split('\n')
    return (
      <pre className="p-3 rounded bg-slate-900 text-sm overflow-auto font-mono">
        {lines.map((ln, i) => {
          // Comment lines
          if (/^\s*#/.test(ln)) {
            return <div key={i} className="leading-6" style={{ color: '#6272a4' }}>{ln}</div>
          }
          // Key: value lines
          const m = ln.match(/^(\s*)([\w.\-/]+)(:)(.*)$/)
          if (m) {
            const [, indent, key, colon, rest] = m
            // Colour booleans, numbers, and special keywords in the value
            let valStyle: React.CSSProperties = { color: '#f1fa8c' }
            const trimmed = rest.trim()
            if (/^(true|false|yes|no|on|off|null|~)$/i.test(trimmed)) valStyle = { color: '#bd93f9' }
            else if (/^-?\d+(\.\d+)?$/.test(trimmed)) valStyle = { color: '#bd93f9' }
            else if (/^['"]/.test(trimmed)) valStyle = { color: '#f1fa8c' }
            else if (trimmed.startsWith('!')) valStyle = { color: '#ff79c6' }
            return (
              <div key={i} className="leading-6">
                <span style={{ color: '#e2e8f0' }}>{indent}</span>
                <span style={{ color: '#8be9fd' }}>{key}</span>
                <span style={{ color: '#e2e8f0' }}>{colon}</span>
                <span style={valStyle}>{rest}</span>
              </div>
            )
          }
          // List item lines (- value)
          const listMatch = ln.match(/^(\s*)(-)(\s+)(.*)$/)
          if (listMatch) {
            const [, indent, dash, space, val] = listMatch
            return (
              <div key={i} className="leading-6">
                <span style={{ color: '#e2e8f0' }}>{indent}</span>
                <span style={{ color: '#ff79c6' }}>{dash}</span>
                <span style={{ color: '#e2e8f0' }}>{space}</span>
                <span style={{ color: '#f1fa8c' }}>{val}</span>
              </div>
            )
          }
          return <div key={i} className="leading-6" style={{ color: '#e2e8f0' }}>{ln}</div>
        })}
      </pre>
    )
  }

  return (
    <Highlight {...defaultProps} code={code} language={language as Language} theme={theme}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={`${className} p-3 rounded bg-slate-900 text-sm overflow-auto font-mono`} style={{ ...style }}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line, key: i })}>
              {line.map((token, k) => (
                <span key={k} {...getTokenProps({ token, key: k })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  )
}
