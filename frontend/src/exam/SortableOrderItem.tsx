import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export function SortableOrderItem({ id, disabled, className, children }: {
  id: string
  disabled: boolean
  className: string
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${className}${isDragging ? ' shadow-lg opacity-80 z-50' : ''}`}
      {...attributes}
      {...(disabled ? {} : listeners)}
    >
      {children}
    </div>
  )
}
