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

export default function VisitsScreen() {
  const nav = useNavigation<any>()
  const [visits, setVisits] = useState<LocalVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const currentMonth = format(new Date(), 'yyyy-MM')

  async function load() {
    const data = await listVisitsLocal(currentMonth)
    setVisits(data as LocalVisit[])
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
        data={visits}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#238821" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhuma visita este mês.</Text>
            <Text style={styles.emptySubtext}>Toque em + para registrar.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const km = item.km_start != null && item.km_end != null
            ? item.km_end - item.km_start : null
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => {}}
              activeOpacity={0.75}
            >
              <View style={styles.cardRow}>
                <View style={[styles.tipoBadge, item.property_tipo === 'propria' ? styles.badgePropria : styles.badgeCliente]}>
                  <Text style={[styles.tipoText, item.property_tipo === 'propria' ? styles.tipoTextPropria : styles.tipoTextCliente]}>
                    {item.property_tipo === 'propria' ? 'PRÓPRIA' : 'CLIENTE'}
                  </Text>
                </View>
                {!item.synced_at && (
                  <View style={styles.pendingDot} />
                )}
              </View>
              <Text style={styles.propertyName}>{item.property_name ?? '—'}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardDate}>
                  {format(new Date(item.date), "dd 'de' MMM", { locale: ptBR })}
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
