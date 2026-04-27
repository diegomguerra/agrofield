/**
 * Distância em km entre dois pontos GPS (fórmula de haversine).
 */
export function haversineKm(
  lat1: number, lng1: number, lat2: number, lng2: number
): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Encontra a propriedade mais próxima dentro de um raio (km).
 * Retorna null se não houver propriedade no raio.
 */
export interface PropertyWithCoords {
  id: string
  name: string
  tipo: string
  latitude: number | null
  longitude: number | null
}

export function findNearestProperty(
  properties: PropertyWithCoords[],
  lat: number, lng: number,
  radiusKm = 0.5
): { property: PropertyWithCoords; distanceKm: number } | null {
  let best: { property: PropertyWithCoords; distanceKm: number } | null = null
  for (const p of properties) {
    if (p.latitude == null || p.longitude == null) continue
    const d = haversineKm(lat, lng, p.latitude, p.longitude)
    if (d <= radiusKm && (!best || d < best.distanceKm)) {
      best = { property: p, distanceKm: d }
    }
  }
  return best
}
