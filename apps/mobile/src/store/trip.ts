import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface ActiveTrip {
  id: string
  startAt: string
  startLatitude: number
  startLongitude: number
  startPropertyId: string | null
}

interface TripState {
  active: ActiveTrip | null
  startTrip: (trip: ActiveTrip) => void
  endTrip: () => void
}

export const useTripStore = create<TripState>()(
  persist(
    (set) => ({
      active: null,
      startTrip: (trip) => set({ active: trip }),
      endTrip: () => set({ active: null }),
    }),
    {
      name: 'agrofield-active-trip',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)
