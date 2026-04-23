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

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      })

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
