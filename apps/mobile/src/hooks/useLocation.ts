import { useState, useCallback } from 'react'
import * as Location from 'expo-location'
import { Alert, Linking, Platform } from 'react-native'

interface GpsCoords {
  latitude: number
  longitude: number
  accuracy: number | null
}

/**
 * Hook para capturar localização GPS.
 * Pede permissão ao usuário e retorna coordenadas.
 */
export function useLocation() {
  const [loading, setLoading] = useState(false)
  const [coords, setCoords] = useState<GpsCoords | null>(null)
  const [error, setError] = useState<string | null>(null)

  const requestLocation = useCallback(async (): Promise<GpsCoords | null> => {
    setLoading(true)
    setError(null)

    try {
      const { status } = await Location.requestForegroundPermissionsAsync()

      if (status !== 'granted') {
        const msg = 'Permissão de localização negada. Ative nas configurações do dispositivo.'
        setError(msg)
        Alert.alert(
          'GPS desativado',
          msg,
          Platform.OS === 'ios'
            ? [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
              ]
            : [{ text: 'OK' }]
        )
        return null
      }

      // Em sinal fraco getCurrentPositionAsync pode travar — race contra timeout,
      // com fallback pra última posição conhecida (até 5min) antes de desistir.
      const fix = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
      ])

      const location =
        fix ?? (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }))

      if (!location) {
        const msg = 'Sinal de GPS fraco. Tente novamente em local aberto.'
        setError(msg)
        return null
      }

      const result: GpsCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      }

      setCoords(result)
      return result
    } catch (err: any) {
      const msg = 'Não foi possível obter a localização GPS.'
      setError(msg)
      console.warn('[GPS]', err)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { coords, loading, error, requestLocation }
}
