/**
 * Renders structured explanation text from skill lab JSON.
 *
 * Supports:
 *   - Paragraphs separated by blank lines (\n\n)
 *   - Bullet list items starting with "- "
 *   - Numbered list items starting with "N. "
 */
export function ExplanationBlock({ text, className = '' }: { text: string; className?: string }) {
  const blocks = text.split('\n\n').filter(Boolean)

  return (
    <div className={`space-y-2 text-sm text-muted-foreground ${className}`}>
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter(Boolean)

        // Detect bullet or numbered lists
        const isBulletList = lines.every(l => l.startsWith('- '))
        const isNumberedList = lines.every(l => /^\d+\. /.test(l))

        if (isBulletList) {
          return (
            <ul key={i} className="list-disc list-outside ml-4 space-y-1">
              {lines.map((line, j) => (
                <li key={j}>{line.slice(2)}</li>
              ))}
            </ul>
          )
        }

        if (isNumberedList) {
          return (
            <ol key={i} className="list-decimal list-outside ml-4 space-y-1">
              {lines.map((line, j) => (
                <li key={j}>{line.replace(/^\d+\. /, '')}</li>
              ))}
            </ol>
          )
        }

        // Mixed block: some lines may be list items, some prose
        const hasList = lines.some(l => l.startsWith('- ') || /^\d+\. /.test(l))
        if (hasList) {
          return (
            <div key={i} className="space-y-1">
              {lines.map((line, j) => {
                if (line.startsWith('- ')) {
                  return (
                    <div key={j} className="flex gap-2">
                      <span className="shrink-0">•</span>
                      <span>{line.slice(2)}</span>
                    </div>
                  )
                }
                if (/^\d+\. /.test(line)) {
                  const num = line.match(/^(\d+)\. /)?.[1]
                  return (
                    <div key={j} className="flex gap-2">
                      <span className="shrink-0 font-medium text-foreground">{num}.</span>
                      <span>{line.replace(/^\d+\. /, '')}</span>
                    </div>
                  )
                }
                return <p key={j}>{line}</p>
              })}
            </div>
          )
        }

        // Plain paragraph
        return <p key={i}>{block}</p>
      })}
    </div>
  )
}
