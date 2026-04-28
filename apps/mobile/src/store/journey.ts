import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type JourneyPhase = 'idle' | 'traveling' | 'on_site' | 'summary'

export interface Segment {
  id: string
  seq: number
  type: 'travel' | 'stay'
  startedAt: string
  endedAt?: string
  durationMinutes?: number
  // travel
  startLatitude?: number
  startLongitude?: number
  endLatitude?: number
  endLongitude?: number
  distanceKm?: number
  // stay
  propertyId?: string
  propertyName?: string
  propertyTipo?: string
  observations?: string
  workHours?: number
}

export interface ActiveJourney {
  id: string
  startedAt: string
  kmOdometerStart?: number
  kmOdometerEnd?: number
  segments: Segment[]
  currentSegment: Segment | null
  phase: JourneyPhase
}

interface JourneyState {
  journey: ActiveJourney | null
  // Actions
  startJourney: (j: ActiveJourney) => void
  setPhase: (phase: JourneyPhase) => void
  pushSegment: (seg: Segment) => void
  closeCurrentSegment: (patch: Partial<Segment>) => void
  setCurrentSegment: (seg: Segment) => void
  updateCurrentSegment: (patch: Partial<Segment>) => void
  setKmOdometerEnd: (km: number) => void
  endJourney: () => void
}

export const useJourneyStore = create<JourneyState>()(
  persist(
    (set) => ({
      journey: null,

      startJourney: (j) => set({ journey: j }),

      setPhase: (phase) =>
        set((s) => s.journey ? { journey: { ...s.journey, phase } } : s),

      pushSegment: (seg) =>
        set((s) => {
          if (!s.journey) return s
          return {
            journey: {
              ...s.journey,
              segments: [...s.journey.segments, seg],
              currentSegment: seg,
            },
          }
        }),

      closeCurrentSegment: (patch) =>
        set((s) => {
          if (!s.journey?.currentSegment) return s
          const closed = { ...s.journey.currentSegment, ...patch }
          const segments = s.journey.segments.map((seg) =>
            seg.id === closed.id ? closed : seg
          )
          return {
            journey: { ...s.journey, segments, currentSegment: null },
          }
        }),

      setCurrentSegment: (seg) =>
        set((s) => s.journey ? { journey: { ...s.journey, currentSegment: seg } } : s),

      updateCurrentSegment: (patch) =>
        set((s) => {
          if (!s.journey?.currentSegment) return s
          const updated = { ...s.journey.currentSegment, ...patch }
          const segments = s.journey.segments.map((seg) =>
            seg.id === updated.id ? updated : seg
          )
          return {
            journey: { ...s.journey, currentSegment: updated, segments },
          }
        }),

      setKmOdometerEnd: (km) =>
        set((s) => s.journey ? { journey: { ...s.journey, kmOdometerEnd: km } } : s),

      endJourney: () => set({ journey: null }),
    }),
    {
      name: 'agrofield-active-journey',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)
