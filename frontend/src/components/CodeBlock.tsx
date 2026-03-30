import { useEffect, useState } from 'react'
import Highlight, { defaultProps, Language } from 'prism-react-renderer'
import darkTheme from 'prism-react-renderer/themes/dracula'
import lightTheme from 'prism-react-renderer/themes/vsLight'

function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

type Props = { code: string; language?: string; inline?: boolean }

export default function CodeBlock({ code, language = 'bash', inline = false }: Props) {
  const dark = useDark()

  if (inline) {
    return <code className="font-mono text-sm bg-card px-1 py-0.5 rounded">{code}</code>
  }
  // For shell/CLI snippets, apply a small tokeniser to highlight options/flags
  if (language === 'bash' || language === 'sh' || language === 'shell') {
    const lines = code.split('\n')
    return (
      <div>
        <pre className="p-3 rounded text-sm overflow-x-auto font-mono whitespace-pre-wrap break-all max-w-full" style={{ backgroundColor: 'var(--code-block-bg)', color: 'var(--code-block-fg)' }}>
        {lines.map((ln, i) => (
          <div key={i} className="leading-6">
            {ln.split(/(\s+)/).map((tok, j) => {
              if (/^\s+$/.test(tok)) return <span key={j}>{tok}</span>
              if (/^--[A-Za-z0-9\-_=]+/.test(tok)) return <span key={j} style={{ color: 'var(--code-token-flag-long)' }}>{tok}</span>
              if (/^-[A-Za-z0-9]+/.test(tok)) return <span key={j} style={{ color: 'var(--code-token-flag-short)' }}>{tok}</span>
              if (/^aws$/.test(tok)) return <span key={j} style={{ color: 'var(--code-token-keyword)' }}>{tok}</span>
              if (/^[a-z0-9_\-]+\/[a-z0-9_\-]+/.test(tok)) return <span key={j} style={{ color: 'var(--code-token-path)' }}>{tok}</span>
              return <span key={j} style={{ color: 'inherit' }}>{tok}</span>
            })}
          </div>
        ))}
        </pre>
      </div>
    )
  }

  // YAML tokeniser — highlights keys, values, booleans, and comments
  if (language === 'yaml' || language === 'yml') {
    const lines = code.split('\n')
    return (
      <div>
        <pre className="p-3 rounded text-sm overflow-x-auto font-mono whitespace-pre-wrap break-all max-w-full" style={{ backgroundColor: 'var(--code-block-bg)', color: 'var(--code-block-fg)' }}>
        {lines.map((ln, i) => {
          // Comment lines
          if (/^\s*#/.test(ln)) {
            return <div key={i} className="leading-6" style={{ color: 'var(--code-yaml-comment)' }}>{ln}</div>
          }
          // Key: value lines
          const m = ln.match(/^(\s*)([\w.\-/]+)(:)(.*)$/)
          if (m) {
            const [, indent, key, colon, rest] = m
            // Colour booleans, numbers, and special keywords in the value
            let valColor = 'var(--code-yaml-value)'
            const trimmed = rest.trim()
            if (/^(true|false|yes|no|on|off|null|~)$/i.test(trimmed)) valColor = 'var(--code-yaml-bool)'
            else if (/^-?\d+(\.\d+)?$/.test(trimmed)) valColor = 'var(--code-yaml-bool)'
            else if (/^['"]/.test(trimmed)) valColor = 'var(--code-yaml-value)'
            else if (trimmed.startsWith('!')) valColor = 'var(--code-yaml-list)'
            return (
              <div key={i} className="leading-6">
                <span style={{ color: 'inherit' }}>{indent}</span>
                <span style={{ color: 'var(--code-yaml-key)' }}>{key}</span>
                <span style={{ color: 'inherit' }}>{colon}</span>
                <span style={{ color: valColor }}>{rest}</span>
              </div>
            )
          }
          // List item lines (- value)
          const listMatch = ln.match(/^(\s*)(-)(\s+)(.*)$/)
          if (listMatch) {
            const [, indent, dash, space, val] = listMatch
            return (
              <div key={i} className="leading-6">
                <span style={{ color: 'inherit' }}>{indent}</span>
                <span style={{ color: 'var(--code-yaml-list)' }}>{dash}</span>
                <span style={{ color: 'inherit' }}>{space}</span>
                <span style={{ color: 'var(--code-yaml-value)' }}>{val}</span>
              </div>
            )
          }
          return <div key={i} className="leading-6" style={{ color: 'inherit' }}>{ln}</div>
        })}
        </pre>
      </div>
    )
  }

  return (
    <Highlight {...defaultProps} code={code} language={language as Language} theme={dark ? darkTheme : lightTheme}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => {
        return (
          <div>
            <pre className={`${className} p-3 rounded text-sm overflow-x-auto font-mono whitespace-pre-wrap break-all max-w-full`} style={{ ...style }}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line, key: i })}>
                  {line.map((token, k) => (
                    <span key={k} {...getTokenProps({ token, key: k })} />
                  ))}
                </div>
              ))}
            </pre>
          </div>
        )
      }}
    </Highlight>
  )
}
