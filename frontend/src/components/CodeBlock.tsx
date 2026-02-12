import React from 'react'
import Highlight, { defaultProps } from 'prism-react-renderer'
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

  return (
    <Highlight {...defaultProps} code={code} language={language} theme={theme}>
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
