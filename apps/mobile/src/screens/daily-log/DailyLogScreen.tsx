import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Modal, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getDb, uuid } from '../../lib/db'
import { enqueue } from '../../lib/sync'
import { useAuthStore } from '../../store/auth'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const C = {
  primary: '#238821', primaryDark: '#1d6c1c', primaryMuted: '#dcf5db',
  soil: '#ca5b21', soilMuted: '#faecda',
  bg: '#f8f7f4', border: '#e5e2db', text: '#28231d', muted: '#6e6457', subtle: '#9a907e',
}

interface DailyLog {
  id: string; date: string; km_start: number | null; km_end: number | null
  fuel_liters: number | null; fuel_cost: number | null; observations: string | null; synced_at: string | null
}

export default function DailyLogScreen() {
  const user = useAuthStore(s => s.user)
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [kmStart, setKmStart] = useState('')
  const [kmEnd, setKmEnd] = useState('')
  const [fuelLiters, setFuelLiters] = useState('')
  const [fuelCost, setFuelCost] = useState('')
  const [observations, setObservations] = useState('')

  async function load() {
    const month = new Date().toISOString().slice(0, 7)
    const data = await getDb().getAllAsync<DailyLog>(
      'SELECT * FROM daily_logs WHERE date LIKE ? ORDER BY date DESC',
      [`${month}%`]
    )
    setLogs(data)
  }

  useEffect(() => { load() }, [])

  const totalKm = logs.reduce((a, l) =>
    a + (l.km_start != null && l.km_end != null ? l.km_end - l.km_start : 0), 0)
  const totalCombustivel = logs.reduce((a, l) => a + (l.fuel_cost ?? 0), 0)

  async function handleSave() {
    if (!user) return
    setSaving(true)
    try {
      const id = uuid()
      const payload = {
        id,
        date,
        collaborator_id: user.id,
        km_start: kmStart ? Number(kmStart) : null,
        km_end: kmEnd ? Number(kmEnd) : null,
        fuel_liters: fuelLiters ? Number(fuelLiters) : null,
        fuel_cost: fuelCost ? Number(fuelCost) : null,
        observations: observations || null,
        tenant_id: user.tenant_id,
      }

      await getDb().runAsync(
        `INSERT INTO daily_logs (id, date, collaborator_id, km_start, km_end, fuel_liters, fuel_cost, observations, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, payload.date, payload.collaborator_id, payload.km_start, payload.km_end,
         payload.fuel_liters, payload.fuel_cost, payload.observations, payload.tenant_id]
      )

      await enqueue('daily_logs', 'INSERT', payload, uuid())
      await load()
      setShowModal(false)
      // Reset form
      setKmStart(''); setKmEnd(''); setFuelLiters(''); setFuelCost(''); setObservations('')
    } catch (e: any) {
      Alert.alert('Erro', e.message)
    } finally {
      setSaving(false)
    }
  }

  const currentMonth = format(new Date(), 'MMMM yyyy', { locale: ptBR })

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>KM Diário</Text>
        <Text style={styles.subtitle}>{currentMonth}</Text>
      </View>

      {/* Totais */}
      <View style={styles.totals}>
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>KM no mês</Text>
          <Text style={styles.totalValue}>{totalKm.toLocaleString('pt-BR')}</Text>
          <Text style={styles.totalUnit}>km</Text>
        </View>
        <View style={[styles.totalCard, { borderLeftWidth: 1, borderLeftColor: C.border }]}>
          <Text style={styles.totalLabel}>Combustível</Text>
          <Text style={styles.totalValue}>
            R$ {totalCombustivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </Text>
        </View>
      </View>

      <FlatList
        data={logs}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Nenhum registro neste mês.</Text>
        }
        renderItem={({ item }) => {
          const km = item.km_start != null && item.km_end != null ? item.km_end - item.km_start : null
          return (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardDate}>{item.date}</Text>
                {!item.synced_at && <View style={styles.pendingDot} />}
              </View>
              <View style={styles.cardStats}>
                {km != null && (
                  <Text style={styles.cardKm}>{km.toLocaleString('pt-BR')} km</Text>
                )}
                {item.fuel_cost != null && (
                  <Text style={styles.cardFuel}>
                    R$ {item.fuel_cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </Text>
                )}
              </View>
              {item.observations ? (
                <Text style={styles.cardObs}>{item.observations}</Text>
              ) : null}
            </View>
          )
        }}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Modal novo registro */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Registro de KM</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={{ color: C.muted, fontSize: 15 }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              {[
                { label: 'Data', value: date, onChange: setDate, placeholder: 'AAAA-MM-DD', keyboard: 'numeric' },
                { label: 'KM inicial', value: kmStart, onChange: setKmStart, placeholder: '0', keyboard: 'numeric' },
                { label: 'KM final', value: kmEnd, onChange: setKmEnd, placeholder: '0', keyboard: 'numeric' },
                { label: 'Litros abastecidos', value: fuelLiters, onChange: setFuelLiters, placeholder: '0', keyboard: 'numeric' },
                { label: 'Custo combustível (R$)', value: fuelCost, onChange: setFuelCost, placeholder: '0,00', keyboard: 'numeric' },
              ].map(f => (
                <View key={f.label} style={{ marginBottom: 16 }}>
                  <Text style={styles.label}>{f.label}</Text>
                  <TextInput
                    style={styles.input}
                    value={f.value}
                    onChangeText={f.onChange}
                    placeholder={f.placeholder}
                    keyboardType={f.keyboard as any}
                    placeholderTextColor={C.subtle}
                  />
                </View>
              ))}
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.label}>Observações</Text>
                <TextInput
                  style={[styles.input, { minHeight: 80 }]}
                  value={observations}
                  onChangeText={setObservations}
                  placeholder="Anotações…"
                  multiline
                  textAlignVertical="top"
                  placeholderTextColor={C.subtle}
                />
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>Salvar</Text>}
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { padding: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.border },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 13, color: C.subtle, marginTop: 2 },
  totals: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.border },
  totalCard: { flex: 1, padding: 16, alignItems: 'center' },
  totalLabel: { fontSize: 11, color: C.subtle, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  totalValue: { fontSize: 22, fontWeight: '700', color: C.text, marginTop: 4 },
  totalUnit: { fontSize: 12, color: C.subtle },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: C.border },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDate: { fontSize: 13, color: C.muted, fontWeight: '500' },
  pendingDot: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#f59e0b' },
  cardStats: { flexDirection: 'row', gap: 16, marginTop: 8 },
  cardKm: { fontSize: 18, fontWeight: '700', color: C.primaryDark },
  cardFuel: { fontSize: 15, color: C.muted, alignSelf: 'flex-end' },
  cardObs: { fontSize: 13, color: C.subtle, marginTop: 6, fontStyle: 'italic' },
  empty: { textAlign: 'center', color: C.subtle, marginTop: 40, fontSize: 14 },
  fab: {
    position: 'absolute', bottom: 28, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  label: { fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 6, textTransform: 'uppercase' },
  input: {
    backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 8, padding: 12, fontSize: 15, color: C.text,
  },
  saveBtn: { backgroundColor: C.primary, borderRadius: 10, padding: 16, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#c8c2b5' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
