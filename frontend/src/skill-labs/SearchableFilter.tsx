import { useState, useRef, useEffect } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'

interface SearchableFilterProps {
  label: string
  options: string[]
  selected: Set<string>
  onChange: (selected: Set<string>) => void
}

export function SearchableFilter({ label, options, selected, onChange }: SearchableFilterProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options

  const toggle = (value: string) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  const clearAll = () => onChange(new Set())

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-sm hover:bg-muted/50 transition"
      >
        <span className="font-medium">{label}</span>
        {selected.size > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-semibold leading-none">
            {selected.size}
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-56 rounded-lg border border-border bg-card shadow-lg">
          {/* Search input */}
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                placeholder={`Search ${label.toLowerCase()}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <div className="text-xs text-muted-foreground px-3 py-2">No results</div>
            )}
            {filtered.map((option) => (
              <label
                key={option}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.has(option)}
                  onChange={() => toggle(option)}
                  className="rounded border-border text-primary focus:ring-primary/50 h-3.5 w-3.5"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>

          {/* Clear */}
          {selected.size > 0 && (
            <div className="border-t border-border p-1.5">
              <button
                onClick={clearAll}
                className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-1"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
