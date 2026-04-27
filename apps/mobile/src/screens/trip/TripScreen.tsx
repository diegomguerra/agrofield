import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { getDb, uuid } from '../../lib/db'
import { enqueue } from '../../lib/sync'
import { useAuthStore } from '../../store/auth'
import { useTripStore, ActiveTrip } from '../../store/trip'
import { useLocation } from '../../hooks/useLocation'
import { findNearestProperty, haversineKm, PropertyWithCoords } from '../../lib/geo'

const C = {
  primary: '#238821', primaryDark: '#1d6c1c', primaryMuted: '#dcf5db',
  soil: '#ca5b21', soilMuted: '#faecda',
  bg: '#f8f7f4', border: '#e5e2db', text: '#28231d', muted: '#6e6457', subtle: '#9a907e',
  danger: '#dc2626',
}

interface PropertyRow {
  id: string; name: string; tipo: string; city: string | null
  latitude: number | null; longitude: number | null
}

export default function TripScreen() {
  const nav = useNavigation<any>()
  const user = useAuthStore((s) => s.user)
  const { active, startTrip, endTrip } = useTripStore()
  const { requestLocation } = useLocation()

  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [originPropertyId, setOriginPropertyId] = useState<string | null>(null)
  const [showOriginList, setShowOriginList] = useState(false)
  const [observations, setObservations] = useState('')
  const [busy, setBusy] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)

  // Carrega propriedades com coords
  async function loadProperties() {
    const data = await getDb().getAllAsync<PropertyRow>(
      'SELECT id, name, tipo, city, latitude, longitude FROM properties ORDER BY tipo DESC, name ASC'
    )
    setProperties(data)
  }

  useEffect(() => {
    const unsub = nav.addListener('focus', loadProperties)
    loadProperties()
    return unsub
  }, [nav])

  // Timer durante viagem ativa
  useEffect(() => {
    if (!active) { setElapsedSec(0); return }
    const tick = () => {
      const start = new Date(active.startAt).getTime()
      setElapsedSec(Math.floor((Date.now() - start) / 1000))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [active])

  async function handleStart() {
    if (!user) return Alert.alert('Erro', 'Usuário não autenticado')
    setBusy(true)
    try {
      let lat: number | null = null
      let lng: number | null = null
      let originId: string | null = originPropertyId

      // Se origem foi escolhida e ela tem coords, usa direto. Senão captura GPS.
      const origin = originPropertyId ? properties.find(p => p.id === originPropertyId) : null
      if (origin && origin.latitude != null && origin.longitude != null) {
        lat = origin.latitude
        lng = origin.longitude
      } else {
        const fix = await requestLocation()
        if (!fix) { setBusy(false); return }
        lat = fix.latitude
        lng = fix.longitude
        originId = null
      }

      const trip: ActiveTrip = {
        id: uuid(),
        startAt: new Date().toISOString(),
        startLatitude: lat,
        startLongitude: lng,
        startPropertyId: originId,
      }
      startTrip(trip)
    } finally {
      setBusy(false)
    }
  }

  async function handleEnd() {
    if (!active || !user) return
    setBusy(true)
    try {
      const fix = await requestLocation()
      if (!fix) { setBusy(false); return }

      const distance = haversineKm(
        active.startLatitude, active.startLongitude,
        fix.latitude, fix.longitude
      )
      const durationMinutes =
        (Date.now() - new Date(active.startAt).getTime()) / 60000

      // Match com fazenda existente (raio 500m)
      const propsWithCoords: PropertyWithCoords[] = properties.map(p => ({
        id: p.id, name: p.name, tipo: p.tipo,
        latitude: p.latitude, longitude: p.longitude,
      }))
      const nearest = findNearestProperty(propsWithCoords, fix.latitude, fix.longitude, 0.5)

      const finishTrip = async (endPropertyId: string | null) => {
        const tripId = active.id
        const now = new Date().toISOString()
        await getDb().runAsync(
          `INSERT INTO trips
            (id, collaborator_id, start_at, end_at,
             start_latitude, start_longitude, end_latitude, end_longitude,
             start_property_id, end_property_id, distance_km, duration_minutes,
             observations, tenant_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tripId, user.id, active.startAt, now,
            active.startLatitude, active.startLongitude, fix.latitude, fix.longitude,
            active.startPropertyId, endPropertyId, distance, durationMinutes,
            observations || null, user.tenant_id, now,
          ]
        )
        await enqueue('trips', 'INSERT', {
          id: tripId,
          collaborator_id: user.id,
          start_at: active.startAt,
          end_at: now,
          start_latitude: active.startLatitude,
          start_longitude: active.startLongitude,
          end_latitude: fix.latitude,
          end_longitude: fix.longitude,
          start_property_id: active.startPropertyId,
          end_property_id: endPropertyId,
          distance_km: distance,
          duration_minutes: durationMinutes,
          observations: observations || null,
          tenant_id: user.tenant_id,
        }, uuid())
        endTrip()
        setObservations('')
        setOriginPropertyId(null)
        Alert.alert(
          '✓ Viagem encerrada',
          `${distance.toFixed(1)} km · ${formatDuration(durationMinutes)}`
        )
      }

      if (nearest) {
        // Já existe — pergunta confirmação
        Alert.alert(
          'Fazenda identificada',
          `Chegada em "${nearest.property.name}" (~${Math.round(nearest.distanceKm * 1000)}m).\nRegistrar?`,
          [
            { text: 'Não, é outra', onPress: () => askNewProperty(fix.latitude, fix.longitude, distance, durationMinutes) },
            { text: 'Sim', onPress: () => finishTrip(nearest.property.id) },
          ]
        )
      } else {
        askNewProperty(fix.latitude, fix.longitude, distance, durationMinutes)
      }

      // Função interna pra abrir form de nova fazenda
      function askNewProperty(lat: number, lng: number, _km: number, _min: number) {
        Alert.alert(
          'Nova fazenda?',
          'Não há fazenda cadastrada perto deste ponto. Deseja cadastrar?',
          [
            {
              text: 'Não, encerrar sem fazenda',
              onPress: () => finishTrip(null),
            },
            {
              text: 'Cadastrar',
              onPress: () => {
                // Salva trip sem fazenda primeiro, depois abre cadastro
                finishTrip(null).then(() => {
                  nav.navigate('NewProperty', { latitude: lat, longitude: lng })
                })
              },
            },
          ]
        )
      }
    } finally {
      setBusy(false)
    }
  }

  function handleCancel() {
    Alert.alert(
      'Cancelar viagem',
      'Tem certeza que quer descartar a viagem em andamento?',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () => { endTrip(); setObservations('') },
        },
      ]
    )
  }

  // ====== render ======
  if (active) {
    const startProperty = active.startPropertyId
      ? properties.find(p => p.id === active.startPropertyId)
      : null
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.activeCard}>
            <Text style={styles.activeLabel}>VIAGEM EM ANDAMENTO</Text>
            <Text style={styles.timer}>{formatTimer(elapsedSec)}</Text>
            <Text style={styles.activeStartedAt}>
              Iniciada às {formatTime(active.startAt)}
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Origem</Text>
            <Text style={styles.originText}>
              {startProperty
                ? `🏠 ${startProperty.name}`
                : `📍 ${active.startLatitude.toFixed(5)}, ${active.startLongitude.toFixed(5)}`}
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Observações</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={observations}
              onChangeText={setObservations}
              placeholder="Anotações opcionais"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              placeholderTextColor={C.subtle}
            />
          </View>

          <TouchableOpacity
            style={[styles.btnPrimary, busy && styles.btnDisabled]}
            onPress={handleEnd}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator color="#fff" />
              : (
                <>
                  <Ionicons name="flag" size={18} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Encerrar viagem (chegada)</Text>
                </>
              )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnGhost} onPress={handleCancel} disabled={busy}>
            <Text style={styles.btnGhostText}>Cancelar viagem</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // Sem viagem ativa
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Viagem</Text>
          <Text style={styles.subtitle}>Registre o trajeto de saída até a fazenda</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Origem (opcional)</Text>
          <TouchableOpacity
            style={[styles.input, styles.selector]}
            onPress={() => setShowOriginList(v => !v)}
          >
            <Text style={originPropertyId ? styles.inputText : styles.placeholder}>
              {originPropertyId
                ? properties.find(p => p.id === originPropertyId)?.name ?? '?'
                : 'GPS atual (use coords da localização)'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={C.subtle} />
          </TouchableOpacity>
          {showOriginList && (
            <View style={styles.dropdown}>
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => { setOriginPropertyId(null); setShowOriginList(false) }}
              >
                <Text style={styles.dropdownText}>📍 Usar GPS atual</Text>
              </TouchableOpacity>
              {properties.filter(p => p.latitude != null).map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.dropdownItem}
                  onPress={() => { setOriginPropertyId(p.id); setShowOriginList(false) }}
                >
                  <Text style={styles.dropdownText}>
                    {p.tipo === 'propria' ? '🏠 ' : '👤 '}{p.name}
                  </Text>
                  {p.city ? <Text style={styles.dropdownSub}>{p.city}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Text style={styles.hint}>
            Selecione uma fazenda já cadastrada (carrega coords) ou use GPS atual.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.btnPrimary, busy && styles.btnDisabled]}
          onPress={handleStart}
          disabled={busy}
        >
          {busy
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <Ionicons name="play" size={18} color="#fff" />
                <Text style={styles.btnPrimaryText}>Iniciar viagem</Text>
              </>
            )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

function formatTimer(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h}h${m > 0 ? ` ${m}min` : ''}`
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20 },
  header: { marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 4 },
  activeCard: {
    backgroundColor: C.primaryMuted,
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.primary,
  },
  activeLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    color: C.primaryDark, textTransform: 'uppercase',
  },
  timer: {
    fontSize: 40, fontWeight: '700', color: C.primaryDark,
    marginVertical: 8, fontVariant: ['tabular-nums'],
  },
  activeStartedAt: { fontSize: 13, color: C.muted },
  field: { marginBottom: 18 },
  label: {
    fontSize: 12, fontWeight: '600', color: C.muted,
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3,
  },
  hint: { fontSize: 11, color: C.subtle, marginTop: 6 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.border,
    borderRadius: 8, padding: 12, fontSize: 15, color: C.text,
  },
  inputText: { fontSize: 15, color: C.text, flex: 1 },
  placeholder: { fontSize: 15, color: C.subtle, flex: 1 },
  selector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  textarea: { minHeight: 70 },
  dropdown: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: C.border,
    borderRadius: 8, marginTop: 4, maxHeight: 320, overflow: 'hidden',
  },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownText: { fontSize: 15, color: C.text, fontWeight: '500' },
  dropdownSub: { fontSize: 12, color: C.subtle, marginTop: 2 },
  originText: {
    fontSize: 15, color: C.text,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.border,
    borderRadius: 8, padding: 12,
  },
  btnPrimary: {
    backgroundColor: C.primary, borderRadius: 10,
    padding: 16, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8, marginTop: 8,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnDisabled: { backgroundColor: '#c8c2b5' },
  btnGhost: { padding: 12, alignItems: 'center', marginTop: 8 },
  btnGhostText: { color: C.danger, fontSize: 14, fontWeight: '500' },
})
