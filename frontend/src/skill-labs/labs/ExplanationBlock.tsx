import { MarkdownText } from '@/exam/utils'

export function ExplanationBlock({ text, className = '' }: { text: string; className?: string }) {
  return (
    <MarkdownText text={text} className={`text-sm text-muted-foreground ${className}`} />
  )
}
