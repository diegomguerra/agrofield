import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { listVisitsLocal } from '../../hooks/useVisits'
import { syncPendingItems } from '../../lib/sync'
import { getDb } from '../../lib/db'

const C = {
  primary: '#238821', primaryDark: '#1d6c1c', primaryMuted: '#dcf5db',
  soil: '#ca5b21', soilMuted: '#faecda',
  bg: '#f8f7f4', border: '#e5e2db', text: '#28231d', muted: '#6e6457', subtle: '#9a907e',
  blue: '#2563eb', blueMuted: '#dbeafe',
}

type LocalVisit = {
  id: string
  property_id: string
  property_name: string
  property_tipo: 'propria' | 'cliente'
  date: string
  km_start: number | null
  km_end: number | null
  synced_at: string | null
}

type JourneyStay = {
  id: string
  journey_id: string
  property_id: string | null
  property_name: string | null
  property_tipo: string | null
  location_name: string | null
  date: string
  // From travel segment (prev)
  travel_distance_km: number | null
  travel_minutes: number | null
  // From journey totals
  total_distance_km: number | null
  total_travel_minutes: number | null
  total_stay_minutes: number | null
  average_speed_kmh: number | null
  // Journey meta
  objective: string | null
  client_name: string | null
  origin_name: string | null
  vehicle_type: string | null
  vehicle_plate: string | null
  fuel_type: string | null
  fuel_price_per_liter: number | null
  km_odometer_start: number | null
  km_odometer_end: number | null
  started_at: string | null
  ended_at: string | null
  // Segment
  observations: string | null
  work_hours: number | null
  synced_at: string | null
}

export default function VisitsScreen() {
  const nav = useNavigation<any>()
  const [visits, setVisits] = useState<LocalVisit[]>([])
  const [journeyStays, setJourneyStays] = useState<JourneyStay[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const currentMonth = format(new Date(), 'yyyy-MM')

  async function loadJourneyStays() {
    const db = getDb()
    const data = await db.getAllAsync<JourneyStay>(
      `SELECT
        js.id, js.journey_id, js.property_id,
        COALESCE(p.name, js.location_name) as property_name,
        p.tipo as property_tipo,
        js.location_name,
        j.date,
        prev.distance_km as travel_distance_km,
        prev.duration_minutes as travel_minutes,
        j.total_distance_km,
        j.total_travel_minutes,
        j.total_stay_minutes,
        j.average_speed_kmh,
        j.objective,
        j.client_name,
        j.origin_name,
        j.vehicle_type,
        j.vehicle_plate,
        j.fuel_type,
        j.fuel_price_per_liter,
        j.km_odometer_start,
        j.km_odometer_end,
        j.started_at,
        j.ended_at,
        js.observations, js.work_hours, j.synced_at
      FROM journey_segments js
      JOIN journeys j ON j.id = js.journey_id
      LEFT JOIN properties p ON p.id = js.property_id
      LEFT JOIN journey_segments prev ON prev.journey_id = js.journey_id
        AND prev.seq = js.seq - 1 AND prev.type = 'travel'
      WHERE js.type = 'stay' AND j.date LIKE ?
      ORDER BY j.date DESC, js.seq ASC`,
      [`${currentMonth}%`]
    )
    setJourneyStays(data)
  }

  async function load() {
    const data = await listVisitsLocal(currentMonth)
    setVisits(data as LocalVisit[])
    await loadJourneyStays()
    setLoading(false)
  }

  async function handleSync() {
    setSyncing(true)
    await syncPendingItems()
    await load()
    setSyncing(false)
  }

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  useEffect(() => { load() }, [])

  const pendingCount = visits.filter((v) => !v.synced_at).length

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.primary} />
      </View>
    )
  }

  function formatDuration(min: number | null) {
    if (min == null || min < 1) return '< 1 min'
    if (min < 60) return `${Math.round(min)} min`
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`
  }

  function formatTime(iso: string | null) {
    if (!iso) return '--:--'
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Visitas</Text>
          <Text style={styles.subtitle}>
            {format(new Date(), 'MMMM yyyy', { locale: ptBR })}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
          onPress={handleSync}
          disabled={syncing}
        >
          <Text style={styles.syncBtnText}>
            {syncing ? 'Sincronizando...' : pendingCount > 0 ? `Sincronizar (${pendingCount})` : 'Sincronizado'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={[
          ...journeyStays.map((js) => ({ ...js, _source: 'journey' as const })),
          ...visits.map((v) => ({ ...v, _source: 'visit' as const })),
        ].sort((a, b) => (b.date > a.date ? 1 : -1))}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhuma visita este mes.</Text>
            <Text style={styles.emptySubtext}>Use a aba Jornada para registrar.</Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item._source === 'journey') {
            const js = item as JourneyStay & { _source: 'journey' }
            const isPropria = js.property_tipo === 'propria'
            const isExpanded = expandedId === js.id
            const travelKm = js.travel_distance_km ?? js.total_distance_km ?? 0
            const travelMin = js.travel_minutes ?? js.total_travel_minutes ?? 0

            // Custo estimado: 10 km/l (premissa cidade/estrada)
            const KM_PER_LITER = 10
            const totalKm = js.total_distance_km ?? travelKm
            const fuelCost = (js.fuel_price_per_liter && totalKm > 0)
              ? (totalKm / KM_PER_LITER) * js.fuel_price_per_liter
              : null
            const costPerKm = (fuelCost && totalKm > 0) ? fuelCost / totalKm : null

            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => setExpandedId(isExpanded ? null : js.id)}
              >
                <View style={styles.cardRow}>
                  <View style={[styles.tipoBadge, isPropria ? styles.badgePropria : styles.badgeCliente]}>
                    <Text style={[styles.tipoText, isPropria ? styles.tipoTextPropria : styles.tipoTextCliente]}>
                      {isPropria ? 'PROPRIA' : js.property_tipo ? 'CLIENTE' : 'LOCAL'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {!js.synced_at && <View style={styles.pendingDot} />}
                    <Text style={styles.journeyBadge}>JORNADA</Text>
                  </View>
                </View>

                <Text style={styles.propertyName}>{js.property_name ?? js.location_name ?? 'Sem local'}</Text>

                <View style={styles.journeyMeta}>
                  {travelKm > 0 && (
                    <Text style={styles.metaChip}>
                      {travelKm.toFixed(1)} km
                    </Text>
                  )}
                  {travelMin > 0 && (
                    <Text style={styles.metaChip}>
                      {formatDuration(travelMin)} trajeto
                    </Text>
                  )}
                  {js.work_hours != null && js.work_hours > 0 && (
                    <Text style={styles.metaChip}>{js.work_hours}h trabalhadas</Text>
                  )}
                  {fuelCost != null && fuelCost > 0 && (
                    <Text style={[styles.metaChip, styles.metaChipSoil]}>
                      R$ {fuelCost.toFixed(2)}
                    </Text>
                  )}
                  {js.objective && (
                    <Text style={[styles.metaChip, styles.metaChipBlue]}>{js.objective}</Text>
                  )}
                </View>

                {js.observations ? (
                  <Text style={styles.obsText} numberOfLines={isExpanded ? undefined : 1}>{js.observations}</Text>
                ) : null}

                <View style={styles.cardFooter}>
                  <Text style={styles.cardDate}>
                    {format(parseISO(js.date), "dd 'de' MMM", { locale: ptBR })}
                  </Text>
                  <Text style={[styles.cardDate, { color: C.primary }]}>
                    {formatTime(js.started_at)} - {formatTime(js.ended_at)}
                  </Text>
                </View>

                {/* Detalhes expandidos */}
                {isExpanded && (
                  <View style={styles.detail}>
                    <View style={styles.detailDivider} />

                    {js.origin_name && (
                      <DetailRow label="Origem" value={js.origin_name} />
                    )}
                    {js.client_name && (
                      <DetailRow label="Cliente" value={js.client_name} />
                    )}
                    {js.vehicle_type && (
                      <DetailRow
                        label="Veiculo"
                        value={`${js.vehicle_type}${js.vehicle_plate ? ` (${js.vehicle_plate})` : ''}`}
                      />
                    )}
                    {(js.km_odometer_start != null || js.km_odometer_end != null) && (
                      <DetailRow
                        label="Odometro"
                        value={`${js.km_odometer_start ?? '?'} → ${js.km_odometer_end ?? '?'} km`}
                      />
                    )}
                    {js.total_distance_km != null && js.total_distance_km > 0 && (
                      <DetailRow label="Distancia total" value={`${js.total_distance_km.toFixed(1)} km`} />
                    )}
                    {js.total_travel_minutes != null && js.total_travel_minutes > 0 && (
                      <DetailRow label="Tempo trajeto" value={formatDuration(js.total_travel_minutes)} />
                    )}
                    {js.average_speed_kmh != null && js.average_speed_kmh > 0 && (
                      <DetailRow label="Vel. media" value={`${js.average_speed_kmh.toFixed(0)} km/h`} />
                    )}
                    {js.fuel_type && (
                      <DetailRow
                        label="Combustivel"
                        value={`${js.fuel_type}${js.fuel_price_per_liter ? ` (R$ ${js.fuel_price_per_liter.toFixed(2)}/l)` : ''}`}
                      />
                    )}
                    {costPerKm != null && costPerKm > 0 && (
                      <DetailRow label="Custo/km" value={`R$ ${costPerKm.toFixed(2)}`} />
                    )}
                    {fuelCost != null && fuelCost > 0 && (
                      <DetailRow label="Custo jornada" value={`R$ ${fuelCost.toFixed(2)}`} />
                    )}
                  </View>
                )}
              </TouchableOpacity>
            )
          }

          // Legacy visit
          const v = item as LocalVisit & { _source: 'visit' }
          const km = v.km_start != null && v.km_end != null
            ? v.km_end - v.km_start : null
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => {}}
              activeOpacity={0.75}
            >
              <View style={styles.cardRow}>
                <View style={[styles.tipoBadge, v.property_tipo === 'propria' ? styles.badgePropria : styles.badgeCliente]}>
                  <Text style={[styles.tipoText, v.property_tipo === 'propria' ? styles.tipoTextPropria : styles.tipoTextCliente]}>
                    {v.property_tipo === 'propria' ? 'PROPRIA' : 'CLIENTE'}
                  </Text>
                </View>
                {!v.synced_at && <View style={styles.pendingDot} />}
              </View>
              <Text style={styles.propertyName}>{v.property_name ?? '—'}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardDate}>
                  {format(parseISO(v.date), "dd 'de' MMM", { locale: ptBR })}
                </Text>
                {km != null && (
                  <Text style={styles.cardKm}>{km.toLocaleString('pt-BR')} km</Text>
                )}
              </View>
            </TouchableOpacity>
          )
        }}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => nav.navigate('NewVisit')}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingTop: 56, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 13, color: C.subtle, marginTop: 2 },
  syncBtn: {
    backgroundColor: C.primary, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  syncBtnDisabled: { backgroundColor: '#c8c2b5' },
  syncBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: C.border,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  tipoBadge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  badgePropria: { backgroundColor: C.primaryMuted },
  badgeCliente: { backgroundColor: C.soilMuted },
  tipoText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  tipoTextPropria: { color: C.primaryDark },
  tipoTextCliente: { color: '#a8451d' },
  pendingDot: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#f59e0b' },
  propertyName: { fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDate: { fontSize: 13, color: C.subtle },
  cardKm: { fontSize: 13, fontWeight: '600', color: C.primary },
  journeyMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  metaChip: {
    fontSize: 12, color: C.primaryDark, fontWeight: '500',
    backgroundColor: C.primaryMuted, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  metaChipBlue: {
    color: C.blue, backgroundColor: C.blueMuted,
  },
  metaChipSoil: {
    color: C.soil, backgroundColor: C.soilMuted,
  },
  obsText: { fontSize: 12, color: C.subtle, fontStyle: 'italic', marginBottom: 8 },
  journeyBadge: {
    fontSize: 9, fontWeight: '700', color: C.blue, letterSpacing: 0.5,
    backgroundColor: C.blueMuted, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  // Detail expanded
  detail: { marginTop: 4 },
  detailDivider: { height: 1, backgroundColor: C.border, marginBottom: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  detailLabel: { fontSize: 12, color: C.subtle, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  detailValue: { fontSize: 13, color: C.text, fontWeight: '500' },
  // Empty / FAB
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: C.muted },
  emptySubtext: { fontSize: 13, color: C.subtle, marginTop: 4 },
  fab: {
    position: 'absolute', bottom: 32, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.primary,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 },
})
