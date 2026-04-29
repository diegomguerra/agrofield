import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type JourneyPhase = 'idle' | 'traveling' | 'arrival' | 'summary'

export const OBJECTIVE_OPTIONS = [
  'Entrega de mercadorias',
  'Entrega de sementes',
  'Entrega de semen',
  'Visita de prospeccao',
  'Visita tecnica',
  'Palestra',
  'Treinamento',
  'Coleta de amostras',
  'Manutencao',
  'Outro',
] as const

export const VEHICLE_TYPE_OPTIONS = [
  'Carro', 'Caminhonete', 'Caminhao', 'Moto', 'Van', 'Outro',
] as const

export const FUEL_TYPE_OPTIONS = [
  'Gasolina', 'Etanol', 'Diesel', 'GNV', 'Flex',
] as const

export interface VehicleConfig {
  vehicleType?: string
  vehiclePlate?: string
  fuelType?: string
  fuelPricePerLiter?: number
}

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
  locationName?: string // name typed manually (not a registered property)
  observations?: string
  workHours?: number
}

export interface ActiveJourney {
  id: string
  startedAt: string
  // Origin
  originPropertyId?: string
  originPropertyName?: string
  originName?: string   // manual name
  originCity?: string
  // Objective & commercial
  objective?: string
  clientName?: string
  invoiceNumber?: string
  invoiceValue?: number
  // Vehicle
  vehicle?: VehicleConfig
  // Odometer
  kmOdometerStart?: number
  kmOdometerEnd?: number
  // State
  segments: Segment[]
  currentSegment: Segment | null
  phase: JourneyPhase
}

interface JourneyState {
  journey: ActiveJourney | null
  // Persisted vehicle defaults
  savedVehicle: VehicleConfig | null
  // Actions
  startJourney: (j: ActiveJourney) => void
  setPhase: (phase: JourneyPhase) => void
  pushSegment: (seg: Segment) => void
  closeCurrentSegment: (patch: Partial<Segment>) => void
  setCurrentSegment: (seg: Segment) => void
  updateCurrentSegment: (patch: Partial<Segment>) => void
  updateJourney: (patch: Partial<ActiveJourney>) => void
  setKmOdometerEnd: (km: number) => void
  setSavedVehicle: (v: VehicleConfig) => void
  endJourney: () => void
}

export const useJourneyStore = create<JourneyState>()(
  persist(
    (set) => ({
      journey: null,
      savedVehicle: null,

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

      updateJourney: (patch) =>
        set((s) => s.journey ? { journey: { ...s.journey, ...patch } } : s),

      setKmOdometerEnd: (km) =>
        set((s) => s.journey ? { journey: { ...s.journey, kmOdometerEnd: km } } : s),

      setSavedVehicle: (v) => set({ savedVehicle: v }),

      endJourney: () => set({ journey: null }),
    }),
    {
      name: 'agrofield-active-journey',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)
