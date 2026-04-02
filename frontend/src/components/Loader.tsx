import { DNA } from 'react-loader-spinner'

export default function Loader({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6">
      <DNA height={60} width={60} />
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  )
}
