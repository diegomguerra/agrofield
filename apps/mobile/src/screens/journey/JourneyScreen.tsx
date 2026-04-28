import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { getDb, uuid } from '../../lib/db'
import { enqueue } from '../../lib/sync'
import { useAuthStore } from '../../store/auth'
import {
  useJourneyStore, ActiveJourney, Segment, JourneyPhase,
} from '../../store/journey'
import { useLocation } from '../../hooks/useLocation'
import { haversineKm, findNearestProperty, PropertyWithCoords } from '../../lib/geo'

// ── Colors ──
const C = {
  primary: '#238821', primaryDark: '#1d6c1c', primaryMuted: '#dcf5db',
  soil: '#ca5b21', soilMuted: '#faecda',
  bg: '#f8f7f4', border: '#e5e2db', text: '#28231d', muted: '#6e6457', subtle: '#9a907e',
  danger: '#dc2626', blue: '#2563eb', blueMuted: '#dbeafe',
}

interface PropertyRow {
  id: string; name: string; tipo: string; city: string | null
  latitude: number | null; longitude: number | null
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════
export default function JourneyScreen() {
  const nav = useNavigation<any>()
  const user = useAuthStore((s) => s.user)
  const store = useJourneyStore()
  const journey = store.journey
  const { requestLocation } = useLocation()

  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [busy, setBusy] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)

  // Form fields
  const [kmOdometerStart, setKmOdometerStart] = useState('')
  const [kmOdometerEnd, setKmOdometerEnd] = useState('')
  const [destPropertyId, setDestPropertyId] = useState<string | null>(null)
  const [showDestList, setShowDestList] = useState(false)
  const [observations, setObservations] = useState('')
  const [workHours, setWorkHours] = useState('')

  const phase: JourneyPhase = journey?.phase ?? 'idle'
  const currentSeg = journey?.currentSegment ?? null

  // ── Load properties ──
  const loadProperties = useCallback(async () => {
    const data = await getDb().getAllAsync<PropertyRow>(
      'SELECT id, name, tipo, city, latitude, longitude FROM properties ORDER BY tipo DESC, name ASC'
    )
    setProperties(data)
  }, [])

  useEffect(() => {
    const unsub = nav.addListener('focus', loadProperties)
    loadProperties()
    return unsub
  }, [nav, loadProperties])

  // ── Timer ──
  useEffect(() => {
    if (!currentSeg) { setElapsedSec(0); return }
    const tick = () => {
      const start = new Date(currentSeg.startedAt).getTime()
      setElapsedSec(Math.floor((Date.now() - start) / 1000))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [currentSeg?.id, currentSeg?.startedAt])

  // ── Helpers ──
  function getStaySegments(): Segment[] {
    return (journey?.segments ?? []).filter((s) => s.type === 'stay' && s.endedAt)
  }
  function getTravelSegments(): Segment[] {
    return (journey?.segments ?? []).filter((s) => s.type === 'travel' && s.endedAt)
  }
  function totalKm(): number {
    return getTravelSegments().reduce((sum, s) => sum + (s.distanceKm ?? 0), 0)
  }
  function totalTravelMin(): number {
    return getTravelSegments().reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0)
  }
  function totalStayMin(): number {
    return getStaySegments().reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0)
  }
  function stopsCount(): number {
    return getStaySegments().length
  }

  // ══════════════════════════════════════════════════════════════════
  //  ACTIONS
  // ══════════════════════════════════════════════════════════════════

  async function handleStartJourney() {
    if (!user) return Alert.alert('Erro', 'Usuario nao autenticado')
    setBusy(true)
    try {
      const fix = await requestLocation()
      if (!fix) { setBusy(false); return }

      const journeyId = uuid()
      const segId = uuid()
      const now = new Date().toISOString()

      const firstSeg: Segment = {
        id: segId, seq: 1, type: 'travel', startedAt: now,
        startLatitude: fix.latitude, startLongitude: fix.longitude,
      }

      const j: ActiveJourney = {
        id: journeyId, startedAt: now,
        kmOdometerStart: kmOdometerStart ? Number(kmOdometerStart) : undefined,
        segments: [firstSeg],
        currentSegment: firstSeg,
        phase: 'traveling',
      }
      store.startJourney(j)
      setKmOdometerStart('')
    } finally { setBusy(false) }
  }

  async function handleArrived() {
    if (!journey || !currentSeg || currentSeg.type !== 'travel') return
    setBusy(true)
    try {
      const fix = await requestLocation()
      if (!fix) { setBusy(false); return }

      const dist = haversineKm(
        currentSeg.startLatitude!, currentSeg.startLongitude!,
        fix.latitude, fix.longitude,
      )
      const durMin = (Date.now() - new Date(currentSeg.startedAt).getTime()) / 60000
      const now = new Date().toISOString()

      // Detect nearby property
      const propsCoords: PropertyWithCoords[] = properties.map((p) => ({
        id: p.id, name: p.name, tipo: p.tipo,
        latitude: p.latitude, longitude: p.longitude,
      }))
      const nearest = findNearestProperty(propsCoords, fix.latitude, fix.longitude, 0.5)

      // If user pre-selected a destination, use that; otherwise use nearest
      let propId = destPropertyId
      let propName = destPropertyId ? properties.find((p) => p.id === destPropertyId)?.name : undefined
      let propTipo = destPropertyId ? properties.find((p) => p.id === destPropertyId)?.tipo : undefined

      if (!propId && nearest) {
        propId = nearest.property.id
        propName = nearest.property.name
        propTipo = nearest.property.tipo
      }

      // Close travel segment
      store.closeCurrentSegment({
        endedAt: now,
        endLatitude: fix.latitude, endLongitude: fix.longitude,
        distanceKm: dist, durationMinutes: durMin,
      })

      // Open stay segment
      const staySeg: Segment = {
        id: uuid(), seq: currentSeg.seq + 1, type: 'stay', startedAt: now,
        propertyId: propId ?? undefined,
        propertyName: propName,
        propertyTipo: propTipo,
      }
      store.pushSegment(staySeg)
      store.setPhase('on_site')
      setDestPropertyId(null)
      setShowDestList(false)
      setObservations('')
      setWorkHours('')

      // If no property matched, prompt
      if (!propId) {
        Alert.alert(
          'Propriedade nao identificada',
          'Nao encontramos fazenda proxima. Selecione manualmente ou cadastre uma nova.',
          [
            { text: 'Selecionar', onPress: () => {} },
            {
              text: 'Cadastrar nova',
              onPress: () => nav.navigate('NewProperty', { latitude: fix.latitude, longitude: fix.longitude }),
            },
          ]
        )
      }
    } finally { setBusy(false) }
  }

  async function handleLeave() {
    if (!journey || !currentSeg || currentSeg.type !== 'stay') return

    if (!currentSeg.propertyId) {
      return Alert.alert('Atencao', 'Selecione a propriedade antes de sair.')
    }

    setBusy(true)
    try {
      const fix = await requestLocation()
      if (!fix) { setBusy(false); return }
      const now = new Date().toISOString()
      const durMin = (Date.now() - new Date(currentSeg.startedAt).getTime()) / 60000

      // Close stay segment
      store.closeCurrentSegment({
        endedAt: now, durationMinutes: durMin,
        observations: observations || undefined,
        workHours: workHours ? Number(workHours) : undefined,
      })

      // Open new travel segment
      const travelSeg: Segment = {
        id: uuid(), seq: currentSeg.seq + 1, type: 'travel', startedAt: now,
        startLatitude: fix.latitude, startLongitude: fix.longitude,
      }
      store.pushSegment(travelSeg)
      store.setPhase('traveling')
      setObservations('')
      setWorkHours('')
    } finally { setBusy(false) }
  }

  async function handleEndJourney() {
    if (!journey || !user) return

    const doEnd = async () => {
      setBusy(true)
      try {
        const now = new Date().toISOString()

        // Close current segment if open
        if (currentSeg && !currentSeg.endedAt) {
          const durMin = (Date.now() - new Date(currentSeg.startedAt).getTime()) / 60000
          if (currentSeg.type === 'travel') {
            const fix = await requestLocation()
            const dist = fix ? haversineKm(
              currentSeg.startLatitude!, currentSeg.startLongitude!,
              fix.latitude, fix.longitude,
            ) : 0
            store.closeCurrentSegment({
              endedAt: now, durationMinutes: durMin,
              endLatitude: fix?.latitude, endLongitude: fix?.longitude,
              distanceKm: dist,
            })
          } else {
            store.closeCurrentSegment({
              endedAt: now, durationMinutes: durMin,
              observations: observations || undefined,
              workHours: workHours ? Number(workHours) : undefined,
            })
          }
        }

        store.setPhase('summary')
      } finally { setBusy(false) }
    }

    Alert.alert(
      'Encerrar jornada',
      'Deseja encerrar a jornada do dia?',
      [
        { text: 'Nao', style: 'cancel' },
        { text: 'Encerrar', onPress: doEnd },
      ]
    )
  }

  async function handleSaveJourney() {
    if (!journey || !user) return
    setBusy(true)
    try {
      const db = getDb()
      const now = new Date().toISOString()
      const segments = journey.segments

      const travelSegs = segments.filter((s) => s.type === 'travel' && s.endedAt)
      const staySegs = segments.filter((s) => s.type === 'stay' && s.endedAt)
      const totDistKm = travelSegs.reduce((a, s) => a + (s.distanceKm ?? 0), 0)
      const totTravelMin = travelSegs.reduce((a, s) => a + (s.durationMinutes ?? 0), 0)
      const totStayMin = staySegs.reduce((a, s) => a + (s.durationMinutes ?? 0), 0)

      // Save journey
      await db.runAsync(
        `INSERT INTO journeys
          (id, collaborator_id, date, started_at, ended_at,
           total_distance_km, total_travel_minutes, total_stay_minutes,
           km_odometer_start, km_odometer_end, observations, tenant_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          journey.id, user.id, journey.startedAt.split('T')[0],
          journey.startedAt, now,
          totDistKm, totTravelMin, totStayMin,
          journey.kmOdometerStart ?? null,
          journey.kmOdometerEnd ?? null,
          null, user.tenant_id, now,
        ]
      )
      await enqueue('journeys', 'INSERT', {
        id: journey.id, collaborator_id: user.id,
        date: journey.startedAt.split('T')[0],
        started_at: journey.startedAt, ended_at: now,
        total_distance_km: totDistKm, total_travel_minutes: totTravelMin,
        total_stay_minutes: totStayMin,
        km_odometer_start: journey.kmOdometerStart,
        km_odometer_end: journey.kmOdometerEnd,
        tenant_id: user.tenant_id,
      }, uuid())

      // Save segments
      for (const seg of segments) {
        if (!seg.endedAt) continue
        await db.runAsync(
          `INSERT INTO journey_segments
            (id, journey_id, seq, type, started_at, ended_at, duration_minutes,
             start_latitude, start_longitude, end_latitude, end_longitude, distance_km,
             property_id, observations, work_hours, tenant_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            seg.id, journey.id, seg.seq, seg.type,
            seg.startedAt, seg.endedAt, seg.durationMinutes ?? null,
            seg.startLatitude ?? null, seg.startLongitude ?? null,
            seg.endLatitude ?? null, seg.endLongitude ?? null,
            seg.distanceKm ?? null,
            seg.propertyId ?? null, seg.observations ?? null,
            seg.workHours ?? null, user.tenant_id, now,
          ]
        )
        await enqueue('journey_segments', 'INSERT', {
          id: seg.id, journey_id: journey.id, seq: seg.seq, type: seg.type,
          started_at: seg.startedAt, ended_at: seg.endedAt,
          duration_minutes: seg.durationMinutes,
          start_latitude: seg.startLatitude, start_longitude: seg.startLongitude,
          end_latitude: seg.endLatitude, end_longitude: seg.endLongitude,
          distance_km: seg.distanceKm,
          property_id: seg.propertyId, observations: seg.observations,
          work_hours: seg.workHours, tenant_id: user.tenant_id,
        }, uuid())
      }

      Alert.alert('Jornada salva', 'Dados registrados. Sincronize quando houver conexao.')
      store.endJourney()
      setKmOdometerEnd('')
      setObservations('')
      setWorkHours('')
    } catch (e: any) {
      Alert.alert('Erro', e.message)
    } finally { setBusy(false) }
  }

  function handleCancelJourney() {
    Alert.alert(
      'Cancelar jornada',
      'Deseja descartar a jornada em andamento? Todos os dados serao perdidos.',
      [
        { text: 'Nao', style: 'cancel' },
        {
          text: 'Descartar', style: 'destructive',
          onPress: () => {
            store.endJourney()
            setObservations('')
            setWorkHours('')
            setKmOdometerEnd('')
          },
        },
      ]
    )
  }

  // ══════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════

  // ── IDLE ──
  if (phase === 'idle') {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.header}>
            <Text style={s.title}>Jornada</Text>
            <Text style={s.subtitle}>Registre seu dia: deslocamentos e paradas</Text>
          </View>

          <View style={s.field}>
            <Text style={s.label}>KM odometro inicial (opcional)</Text>
            <TextInput
              style={s.input}
              value={kmOdometerStart}
              onChangeText={setKmOdometerStart}
              placeholder="Ex: 45230"
              keyboardType="numeric"
              placeholderTextColor={C.subtle}
            />
          </View>

          <TouchableOpacity
            style={[s.btnPrimary, busy && s.btnDisabled]}
            onPress={handleStartJourney}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="play" size={18} color="#fff" />
                <Text style={s.btnPrimaryText}>Iniciar Jornada</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ── TRAVELING ──
  if (phase === 'traveling' && currentSeg) {
    const selectedDest = destPropertyId ? properties.find((p) => p.id === destPropertyId) : null
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.phaseCard}>
            <View style={s.phaseRow}>
              <Ionicons name="car" size={20} color={C.blue} />
              <Text style={s.phaseLabel}>EM DESLOCAMENTO</Text>
              <Text style={s.phaseSeg}>Segmento #{currentSeg.seq}</Text>
            </View>
            <Text style={s.timer}>{formatTimer(elapsedSec)}</Text>
            <Text style={s.phaseStarted}>
              Partida as {formatTime(currentSeg.startedAt)}
            </Text>
          </View>

          {/* Destination picker */}
          <View style={s.field}>
            <Text style={s.label}>Destino</Text>
            <TouchableOpacity
              style={[s.input, s.selector]}
              onPress={() => setShowDestList((v) => !v)}
            >
              <Text style={selectedDest ? s.inputText : s.placeholder}>
                {selectedDest ? selectedDest.name : 'Selecionar propriedade (ou detectar ao chegar)'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={C.subtle} />
            </TouchableOpacity>
            {showDestList && (
              <View style={s.dropdown}>
                <TouchableOpacity
                  style={s.dropdownItem}
                  onPress={() => { setDestPropertyId(null); setShowDestList(false) }}
                >
                  <Text style={s.dropdownText}>Detectar por GPS ao chegar</Text>
                </TouchableOpacity>
                {properties.filter((p) => p.latitude != null).map((p) => (
                  <TouchableOpacity
                    key={p.id} style={s.dropdownItem}
                    onPress={() => { setDestPropertyId(p.id); setShowDestList(false) }}
                  >
                    <Text style={s.dropdownText}>
                      {p.tipo === 'propria' ? '🏠 ' : '👤 '}{p.name}
                    </Text>
                    {p.city ? <Text style={s.dropdownSub}>{p.city}</Text> : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Partial summary */}
          <PartialSummary km={totalKm()} stops={stopsCount()} travelMin={totalTravelMin()} stayMin={totalStayMin()} />

          <TouchableOpacity
            style={[s.btnArrived, busy && s.btnDisabled]}
            onPress={handleArrived}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="location" size={18} color="#fff" />
                <Text style={s.btnPrimaryText}>Cheguei</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btnOutline, { marginTop: 8 }]}
            onPress={handleEndJourney}
            disabled={busy}
          >
            <Ionicons name="flag" size={16} color={C.primary} />
            <Text style={s.btnOutlineText}>Encerrar Jornada</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.btnGhost} onPress={handleCancelJourney} disabled={busy}>
            <Text style={s.btnGhostText}>Cancelar jornada</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ── ON_SITE ──
  if (phase === 'on_site' && currentSeg) {
    const prevTravel = journey!.segments.find(
      (seg) => seg.seq === currentSeg.seq - 1 && seg.type === 'travel'
    )
    const isPropria = currentSeg.propertyTipo === 'propria'

    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.content}>
            <View style={[s.phaseCard, { borderColor: C.primary, backgroundColor: C.primaryMuted }]}>
              <View style={s.phaseRow}>
                <Ionicons name="location" size={20} color={C.primaryDark} />
                <Text style={[s.phaseLabel, { color: C.primaryDark }]}>NO LOCAL</Text>
                <Text style={s.phaseSeg}>Parada #{Math.ceil(currentSeg.seq / 2)}</Text>
              </View>
              <Text style={s.propertyOnSite}>
                {currentSeg.propertyName ?? 'Propriedade nao selecionada'}
              </Text>
              {prevTravel && (
                <Text style={s.travelInfo}>
                  Deslocamento: {(prevTravel.distanceKm ?? 0).toFixed(1)} km  {formatDuration(prevTravel.durationMinutes ?? 0)}
                </Text>
              )}
              <Text style={[s.timer, { color: C.primaryDark }]}>{formatTimer(elapsedSec)}</Text>
              <Text style={s.timerLabel}>permanencia</Text>
            </View>

            {/* Property selector (if not auto-detected) */}
            {!currentSeg.propertyId && (
              <View style={s.field}>
                <Text style={s.label}>Selecione a propriedade *</Text>
                <TouchableOpacity
                  style={[s.input, s.selector]}
                  onPress={() => setShowDestList((v) => !v)}
                >
                  <Text style={s.placeholder}>Selecionar...</Text>
                  <Ionicons name="chevron-down" size={16} color={C.subtle} />
                </TouchableOpacity>
                {showDestList && (
                  <View style={s.dropdown}>
                    {properties.map((p) => (
                      <TouchableOpacity
                        key={p.id} style={s.dropdownItem}
                        onPress={() => {
                          store.updateCurrentSegment({
                            propertyId: p.id, propertyName: p.name, propertyTipo: p.tipo,
                          })
                          setShowDestList(false)
                        }}
                      >
                        <Text style={s.dropdownText}>
                          {p.tipo === 'propria' ? '🏠 ' : '👤 '}{p.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Tipo badge */}
            {currentSeg.propertyId && (
              <View style={[s.tipoBadge, isPropria ? s.badgePropria : s.badgeCliente]}>
                <Text style={[s.tipoText, isPropria ? s.tipoTextPropria : s.tipoTextCliente]}>
                  {isPropria ? '🏠 Fazenda Propria — horas e insumos' : '👤 Cliente — servicos e vendas'}
                </Text>
              </View>
            )}

            {/* Observations */}
            <View style={s.field}>
              <Text style={s.label}>Observacoes</Text>
              <TextInput
                style={[s.input, s.textarea]}
                value={observations}
                onChangeText={setObservations}
                placeholder="Anotacoes sobre esta parada..."
                multiline numberOfLines={3}
                textAlignVertical="top"
                placeholderTextColor={C.subtle}
              />
            </View>

            {/* Work hours (own farm) */}
            {isPropria && (
              <View style={s.field}>
                <Text style={s.label}>Horas trabalhadas</Text>
                <TextInput
                  style={s.input}
                  value={workHours}
                  onChangeText={setWorkHours}
                  placeholder="Ex: 8"
                  keyboardType="numeric"
                  placeholderTextColor={C.subtle}
                />
              </View>
            )}

            {/* Partial summary */}
            <PartialSummary km={totalKm()} stops={stopsCount()} travelMin={totalTravelMin()} stayMin={totalStayMin()} />

            {/* Actions */}
            <TouchableOpacity
              style={[s.btnPrimary, busy && s.btnDisabled]}
              onPress={handleLeave}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="car" size={18} color="#fff" />
                  <Text style={s.btnPrimaryText}>Sair (proximo deslocamento)</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.btnOutline, { marginTop: 8 }]}
              onPress={handleEndJourney}
              disabled={busy}
            >
              <Ionicons name="flag" size={16} color={C.primary} />
              <Text style={s.btnOutlineText}>Encerrar Jornada</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.btnGhost} onPress={handleCancelJourney} disabled={busy}>
              <Text style={s.btnGhostText}>Cancelar jornada</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // ── SUMMARY ──
  if (phase === 'summary' && journey) {
    const segments = journey.segments.filter((seg) => seg.endedAt)
    const travelSegs = segments.filter((seg) => seg.type === 'travel')
    const staySegs = segments.filter((seg) => seg.type === 'stay')
    const totKm = travelSegs.reduce((a, seg) => a + (seg.distanceKm ?? 0), 0)
    const totTravelMin = travelSegs.reduce((a, seg) => a + (seg.durationMinutes ?? 0), 0)
    const totStayMin = staySegs.reduce((a, seg) => a + (seg.durationMinutes ?? 0), 0)
    const totMin = totTravelMin + totStayMin

    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <ScrollView contentContainerStyle={s.content}>
          <View style={[s.phaseCard, { borderColor: C.primary, backgroundColor: C.primaryMuted }]}>
            <Ionicons name="checkmark-circle" size={32} color={C.primaryDark} />
            <Text style={[s.phaseLabel, { color: C.primaryDark, marginTop: 8 }]}>JORNADA ENCERRADA</Text>
            <Text style={s.summaryDate}>{formatDateBR(journey.startedAt)}</Text>
          </View>

          {/* Segment list */}
          {segments.map((seg) => (
            <View key={seg.id} style={s.segmentCard}>
              {seg.type === 'travel' ? (
                <View style={s.segmentRow}>
                  <Ionicons name="car" size={16} color={C.blue} />
                  <Text style={s.segmentTitle}>Deslocamento</Text>
                  <Text style={s.segmentMeta}>
                    {(seg.distanceKm ?? 0).toFixed(1)} km  {formatDuration(seg.durationMinutes ?? 0)}
                  </Text>
                </View>
              ) : (
                <View>
                  <View style={s.segmentRow}>
                    <Ionicons name="location" size={16} color={C.primary} />
                    <Text style={s.segmentTitle}>{seg.propertyName ?? 'Sem propriedade'}</Text>
                  </View>
                  <Text style={s.segmentMeta}>
                    Permanencia: {formatDuration(seg.durationMinutes ?? 0)}
                    {seg.workHours ? `  |  ${seg.workHours}h trabalhadas` : ''}
                  </Text>
                  {seg.observations ? <Text style={s.segmentObs}>{seg.observations}</Text> : null}
                </View>
              )}
            </View>
          ))}

          {/* Totals */}
          <View style={s.totalsCard}>
            <TotalRow icon="speedometer" label="Total KM" value={`${totKm.toFixed(1)} km`} />
            <TotalRow icon="car" label="Deslocamento" value={formatDuration(totTravelMin)} />
            <TotalRow icon="location" label="Permanencia" value={formatDuration(totStayMin)} />
            <TotalRow icon="time" label="Jornada total" value={formatDuration(totMin)} />
            <TotalRow icon="flag" label="Paradas" value={`${staySegs.length}`} />
          </View>

          {/* Odometer end */}
          <View style={s.field}>
            <Text style={s.label}>KM odometro final (opcional)</Text>
            <TextInput
              style={s.input}
              value={kmOdometerEnd}
              onChangeText={(v) => { setKmOdometerEnd(v); if (v) store.setKmOdometerEnd(Number(v)) }}
              placeholder="Ex: 45312"
              keyboardType="numeric"
              placeholderTextColor={C.subtle}
            />
          </View>

          <TouchableOpacity
            style={[s.btnPrimary, busy && s.btnDisabled]}
            onPress={handleSaveJourney}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : (
              <Text style={s.btnPrimaryText}>Salvar Jornada</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.btnGhost} onPress={handleCancelJourney} disabled={busy}>
            <Text style={s.btnGhostText}>Descartar</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    )
  }

  // Fallback
  return null
}

// ══════════════════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════

function PartialSummary({ km, stops, travelMin, stayMin }: {
  km: number; stops: number; travelMin: number; stayMin: number
}) {
  return (
    <View style={s.partialSummary}>
      <Text style={s.partialTitle}>Resumo parcial</Text>
      <Text style={s.partialText}>
        {km.toFixed(1)} km  |  {stops} parada{stops !== 1 ? 's' : ''}  |  {formatDuration(travelMin + stayMin)} total
      </Text>
    </View>
  )
}

function TotalRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={s.totalRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={icon as any} size={16} color={C.muted} />
        <Text style={s.totalLabel}>{label}</Text>
      </View>
      <Text style={s.totalValue}>{value}</Text>
    </View>
  )
}

// ══════════════════════════════════════════════════════════════════════
//  FORMATTERS
// ══════════════════════════════════════════════════════════════════════

function formatTimer(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const sec = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDuration(minutes: number) {
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h}h${m > 0 ? `${String(m).padStart(2, '0')}` : ''}`
}

function formatDateBR(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// ══════════════════════════════════════════════════════════════════════
//  STYLES
// ══════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20 },
  header: { marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 4 },

  // Phase card
  phaseCard: {
    backgroundColor: C.blueMuted, borderRadius: 12, padding: 20,
    marginBottom: 20, alignItems: 'center',
    borderWidth: 1, borderColor: C.blue,
  },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phaseLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    color: C.blue, textTransform: 'uppercase',
  },
  phaseSeg: { fontSize: 11, color: C.subtle },
  phaseStarted: { fontSize: 13, color: C.muted, marginTop: 4 },
  propertyOnSite: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 8 },
  travelInfo: { fontSize: 13, color: C.muted, marginTop: 4 },
  timer: {
    fontSize: 40, fontWeight: '700', color: C.blue,
    marginVertical: 8, fontVariant: ['tabular-nums'],
  },
  timerLabel: { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDate: { fontSize: 14, color: C.muted, marginTop: 4 },

  // Fields
  field: { marginBottom: 16 },
  label: {
    fontSize: 12, fontWeight: '600', color: C.muted,
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3,
  },
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
    borderRadius: 8, marginTop: 4, maxHeight: 280, overflow: 'hidden',
  },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownText: { fontSize: 15, color: C.text, fontWeight: '500' },
  dropdownSub: { fontSize: 12, color: C.subtle, marginTop: 2 },

  // Tipo badge
  tipoBadge: { borderRadius: 8, padding: 10, marginBottom: 14 },
  badgePropria: { backgroundColor: C.primaryMuted },
  badgeCliente: { backgroundColor: C.soilMuted },
  tipoText: { fontSize: 13, fontWeight: '500' },
  tipoTextPropria: { color: C.primaryDark },
  tipoTextCliente: { color: '#a8451d' },

  // Partial summary
  partialSummary: {
    backgroundColor: '#fff', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: C.border, marginBottom: 16,
  },
  partialTitle: { fontSize: 10, fontWeight: '700', color: C.subtle, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  partialText: { fontSize: 13, color: C.muted, fontWeight: '500' },

  // Segment cards (summary)
  segmentCard: {
    backgroundColor: '#fff', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: C.border, marginBottom: 8,
  },
  segmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segmentTitle: { fontSize: 15, fontWeight: '600', color: C.text, flex: 1 },
  segmentMeta: { fontSize: 12, color: C.muted, marginTop: 4 },
  segmentObs: { fontSize: 12, color: C.subtle, marginTop: 4, fontStyle: 'italic' },

  // Totals card
  totalsCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    borderWidth: 1.5, borderColor: C.primary, marginVertical: 16,
  },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6,
  },
  totalLabel: { fontSize: 14, color: C.muted },
  totalValue: { fontSize: 14, fontWeight: '700', color: C.text },

  // Buttons
  btnPrimary: {
    backgroundColor: C.primary, borderRadius: 10, padding: 16,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8, marginTop: 8,
  },
  btnArrived: {
    backgroundColor: C.blue, borderRadius: 10, padding: 16,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8, marginTop: 8,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnDisabled: { backgroundColor: '#c8c2b5' },
  btnOutline: {
    borderWidth: 1.5, borderColor: C.primary, borderRadius: 10, padding: 14,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
  },
  btnOutlineText: { color: C.primary, fontWeight: '600', fontSize: 15 },
  btnGhost: { padding: 12, alignItems: 'center', marginTop: 8 },
  btnGhostText: { color: C.danger, fontSize: 14, fontWeight: '500' },
})
