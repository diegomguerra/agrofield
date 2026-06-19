import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { getDb, uuid } from '../../lib/db'
import { enqueue } from '../../lib/sync'

const C = {
  primary: '#238821', primaryDark: '#1d6c1c', primaryMuted: '#dcf5db',
  bg: '#f8f7f4', border: '#e5e2db', text: '#28231d', muted: '#6e6457', subtle: '#9a907e',
}

type JourneyRow = {
  id: string
  fuel_price_per_liter: number | null
  objective: string | null
  client_name: string | null
  invoice_number: string | null
  invoice_value: number | null
  observations: string | null
  km_odometer_start: number | null
  km_odometer_end: number | null
  total_distance_km: number | null
  total_travel_minutes: number | null
  average_speed_kmh: number | null
  tenant_id: string
  created_at: string | null
  synced_at: string | null
}

function parseNum(s: string): number | null {
  if (!s.trim()) return null
  const n = Number(s.replace(',', '.'))
  return isNaN(n) ? null : n
}

function formatCurrencyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const cents = parseInt(digits, 10)
  return (cents / 100).toFixed(2).replace('.', ',')
}

function formatNumberInput(n: number | null): string {
  return n == null ? '' : String(n).replace('.', ',')
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  )
}

export default function EditJourneyScreen() {
  const nav = useNavigation<any>()
  const route = useRoute<any>()
  const journeyId = route.params?.journeyId as string | undefined

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [journey, setJourney] = useState<JourneyRow | null>(null)
  const [lastEditedAt, setLastEditedAt] = useState<string | null>(null)

  const [fuelPrice, setFuelPrice] = useState('')
  const [objective, setObjective] = useState('')
  const [clientName, setClientName] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceValue, setInvoiceValue] = useState('')
  const [observations, setObservations] = useState('')
  const [kmStart, setKmStart] = useState('')
  const [kmEnd, setKmEnd] = useState('')

  useEffect(() => {
    async function load() {
      if (!journeyId) {
        Alert.alert('Erro', 'Jornada nao informada.', [{ text: 'OK', onPress: () => nav.goBack() }])
        return
      }

      const row = await getDb().getFirstAsync<JourneyRow>(
        'SELECT * FROM journeys WHERE id = ?',
        [journeyId]
      )
      if (!row) {
        Alert.alert('Erro', 'Jornada nao encontrada.', [{ text: 'OK', onPress: () => nav.goBack() }])
        return
      }

      setJourney(row)
      setFuelPrice(row.fuel_price_per_liter == null ? '' : row.fuel_price_per_liter.toFixed(2).replace('.', ','))
      setObjective(row.objective ?? '')
      setClientName(row.client_name ?? '')
      setInvoiceNumber(row.invoice_number ?? '')
      setInvoiceValue(formatNumberInput(row.invoice_value))
      setObservations(row.observations ?? '')
      setKmStart(formatNumberInput(row.km_odometer_start))
      setKmEnd(formatNumberInput(row.km_odometer_end))
      setLoading(false)
    }
    void load()
  }, [journeyId, nav])

  async function handleSave() {
    if (!journey) return

    const fuel = parseNum(fuelPrice)
    if (fuel != null && fuel > 50) {
      Alert.alert('Valor suspeito', `Preco por litro R$ ${fuelPrice} parece alto. Confirma?`, [
        { text: 'Corrigir', style: 'cancel' },
        { text: 'Confirmar', onPress: () => { void save() } },
      ])
      return
    }

    await save()
  }

  async function save() {
    if (!journey) return
    setSaving(true)
    try {
      const db = getDb()
      const now = new Date().toISOString()
      const odometerStart = parseNum(kmStart)
      const odometerEnd = parseNum(kmEnd)
      const gpsDistance = await db.getFirstAsync<{ total: number | null }>(
        `SELECT SUM(distance_km) as total
         FROM journey_segments
         WHERE journey_id = ? AND type = 'travel'`,
        [journey.id]
      )
      const odometerKm = (
        odometerStart != null &&
        odometerEnd != null &&
        odometerEnd > odometerStart
      ) ? odometerEnd - odometerStart : null
      const totalDistanceKm = odometerKm ?? gpsDistance?.total ?? journey.total_distance_km ?? null
      const totalTravelMinutes = journey.total_travel_minutes ?? 0
      const averageSpeedKmh = totalDistanceKm != null && totalTravelMinutes > 0
        ? totalDistanceKm / (totalTravelMinutes / 60)
        : journey.average_speed_kmh

      const payload = {
        id: journey.id,
        fuel_price_per_liter: parseNum(fuelPrice),
        objective: objective.trim() || null,
        client_name: clientName.trim() || null,
        invoice_number: invoiceNumber.trim() || null,
        invoice_value: parseNum(invoiceValue),
        observations: observations.trim() || null,
        km_odometer_start: odometerStart,
        km_odometer_end: odometerEnd,
        total_distance_km: totalDistanceKm,
        average_speed_kmh: averageSpeedKmh,
        tenant_id: journey.tenant_id,
      }

      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `UPDATE journeys SET
             fuel_price_per_liter = ?,
             objective = ?,
             client_name = ?,
             invoice_number = ?,
             invoice_value = ?,
             observations = ?,
             km_odometer_start = ?,
             km_odometer_end = ?,
             total_distance_km = ?,
             average_speed_kmh = ?,
             synced_at = NULL
           WHERE id = ?`,
          [
            payload.fuel_price_per_liter,
            payload.objective,
            payload.client_name,
            payload.invoice_number,
            payload.invoice_value,
            payload.observations,
            payload.km_odometer_start,
            payload.km_odometer_end,
            payload.total_distance_km,
            payload.average_speed_kmh,
            journey.id,
          ]
        )
        await enqueue('journeys', 'UPDATE', payload, uuid())
      })

      setLastEditedAt(now)
      Alert.alert('Jornada atualizada', 'Alteracoes salvas localmente.', [
        { text: 'OK', onPress: () => nav.goBack() },
      ])
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.primary} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Editar jornada</Text>
        <Text style={styles.audit}>
          {lastEditedAt ? `Ultima edicao: ${new Date(lastEditedAt).toLocaleString('pt-BR')}` : 'Alteracoes ficam pendentes ate sincronizar.'}
        </Text>

        <Field label="Preco/litro (R$)">
          <TextInput
            style={styles.input}
            value={fuelPrice}
            onChangeText={(t) => setFuelPrice(formatCurrencyInput(t))}
            placeholder="0,00"
            keyboardType="numeric"
            placeholderTextColor={C.subtle}
          />
        </Field>

        <Field label="Objetivo">
          <TextInput style={styles.input} value={objective} onChangeText={setObjective} placeholderTextColor={C.subtle} />
        </Field>

        <Field label="Cliente">
          <TextInput style={styles.input} value={clientName} onChangeText={setClientName} placeholderTextColor={C.subtle} />
        </Field>

        <Field label="Numero da nota">
          <TextInput style={styles.input} value={invoiceNumber} onChangeText={setInvoiceNumber} placeholderTextColor={C.subtle} />
        </Field>

        <Field label="Valor da nota">
          <TextInput style={styles.input} value={invoiceValue} onChangeText={setInvoiceValue} keyboardType="numeric" placeholderTextColor={C.subtle} />
        </Field>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="KM inicial">
              <TextInput style={styles.input} value={kmStart} onChangeText={setKmStart} keyboardType="numeric" placeholderTextColor={C.subtle} />
            </Field>
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Field label="KM final">
              <TextInput style={styles.input} value={kmEnd} onChangeText={setKmEnd} keyboardType="numeric" placeholderTextColor={C.subtle} />
            </Field>
          </View>
        </View>

        <Field label="Observacoes">
          <TextInput
            style={[styles.input, styles.textarea]}
            value={observations}
            onChangeText={setObservations}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholderTextColor={C.subtle}
          />
        </Field>

        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Salvar alteracoes</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  content: { padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 4 },
  audit: { fontSize: 13, color: C.subtle, marginBottom: 18 },
  field: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.border,
    borderRadius: 8, padding: 12, fontSize: 15, color: C.text,
  },
  textarea: { minHeight: 96 },
  row: { flexDirection: 'row' },
  saveBtn: {
    backgroundColor: C.primary, borderRadius: 10,
    padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 32,
  },
  saveBtnDisabled: { backgroundColor: '#c8c2b5' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
