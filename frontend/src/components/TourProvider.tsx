import { createContext, useContext } from 'react'
import { useTour, type TourApi } from '@/hooks/useTour'

const TourContext = createContext<TourApi | null>(null)

export function useTourContext(): TourApi {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTourContext must be used within TourProvider')
  return ctx
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const tour = useTour()
  return <TourContext.Provider value={tour}>{children}</TourContext.Provider>
}
