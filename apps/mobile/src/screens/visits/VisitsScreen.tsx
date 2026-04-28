import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { listVisitsLocal } from '../../hooks/useVisits'
import { syncPendingItems } from '../../lib/sync'
import { getDb } from '../../lib/db'

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
  property_id: string
  property_name: string
  property_tipo: string
  date: string
  distance_km: number | null
  travel_minutes: number | null
  stay_minutes: number | null
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

  const currentMonth = format(new Date(), 'yyyy-MM')

  async function loadJourneyStays() {
    const db = getDb()
    const data = await db.getAllAsync<JourneyStay>(
      `SELECT
        js.id, js.journey_id, js.property_id,
        p.name as property_name, p.tipo as property_tipo,
        j.date, js.distance_km,
        prev.duration_minutes as travel_minutes,
        js.duration_minutes as stay_minutes,
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
        <ActivityIndicator color="#238821" />
      </View>
    )
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
            {syncing ? 'Sincronizando…' : pendingCount > 0 ? `Sincronizar (${pendingCount})` : '✓ Sincronizado'}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#238821" />}
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
            return (
              <View style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={[styles.tipoBadge, isPropria ? styles.badgePropria : styles.badgeCliente]}>
                    <Text style={[styles.tipoText, isPropria ? styles.tipoTextPropria : styles.tipoTextCliente]}>
                      {isPropria ? 'PROPRIA' : 'CLIENTE'}
                    </Text>
                  </View>
                  {!js.synced_at && <View style={styles.pendingDot} />}
                </View>
                <Text style={styles.propertyName}>{js.property_name ?? '—'}</Text>
                <View style={styles.journeyMeta}>
                  {js.travel_minutes != null && (
                    <Text style={styles.metaChip}>
                      🚗 {(js.distance_km ?? 0).toFixed(1)} km · {Math.round(js.travel_minutes)} min
                    </Text>
                  )}
                  {js.stay_minutes != null && (
                    <Text style={styles.metaChip}>
                      📍 {Math.round(js.stay_minutes)} min no local
                    </Text>
                  )}
                  {js.work_hours != null && (
                    <Text style={styles.metaChip}>⏱ {js.work_hours}h trabalhadas</Text>
                  )}
                </View>
                {js.observations ? (
                  <Text style={styles.obsText}>{js.observations}</Text>
                ) : null}
                <View style={styles.cardFooter}>
                  <Text style={styles.cardDate}>
                    {format(new Date(js.date), "dd 'de' MMM", { locale: ptBR })}
                  </Text>
                  <Text style={styles.journeyBadge}>JORNADA</Text>
                </View>
              </View>
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
                {!v.synced_at && (
                  <View style={styles.pendingDot} />
                )}
              </View>
              <Text style={styles.propertyName}>{v.property_name ?? '—'}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardDate}>
                  {format(new Date(v.date), "dd 'de' MMM", { locale: ptBR })}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f7f4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingTop: 56, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e5e2db',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#28231d' },
  subtitle: { fontSize: 13, color: '#9a907e', marginTop: 2 },
  syncBtn: {
    backgroundColor: '#238821', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  syncBtnDisabled: { backgroundColor: '#c8c2b5' },
  syncBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#e5e2db',
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  tipoBadge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  badgePropria: { backgroundColor: '#dcf5db' },
  badgeCliente: { backgroundColor: '#faecda' },
  tipoText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  tipoTextPropria: { color: '#1d6c1c' },
  tipoTextCliente: { color: '#a8451d' },
  pendingDot: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#f59e0b' },
  propertyName: { fontSize: 16, fontWeight: '600', color: '#28231d', marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  cardDate: { fontSize: 13, color: '#9a907e' },
  cardKm: { fontSize: 13, fontWeight: '600', color: '#238821' },
  journeyMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  metaChip: {
    fontSize: 12, color: '#1d6c1c', fontWeight: '500',
    backgroundColor: '#dcf5db', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  obsText: { fontSize: 12, color: '#9a907e', fontStyle: 'italic', marginBottom: 8 },
  journeyBadge: {
    fontSize: 9, fontWeight: '700', color: '#2563eb', letterSpacing: 0.5,
    backgroundColor: '#dbeafe', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#6e6457' },
  emptySubtext: { fontSize: 13, color: '#9a907e', marginTop: 4 },
  fab: {
    position: 'absolute', bottom: 32, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#238821',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 },
})
