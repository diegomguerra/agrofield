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
  OBJECTIVE_OPTIONS, VEHICLE_TYPE_OPTIONS, FUEL_TYPE_OPTIONS,
  VehicleConfig,
} from '../../store/journey'
import { useLocation } from '../../hooks/useLocation'
import { haversineKm, findNearestProperty, PropertyWithCoords } from '../../lib/geo'

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

export default function JourneyScreen() {
  const nav = useNavigation<any>()
  const user = useAuthStore((s) => s.user)
  const store = useJourneyStore()
  const journey = store.journey
  const savedVehicle = store.savedVehicle
  const { requestLocation } = useLocation()

  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [busy, setBusy] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)

  // IDLE form
  const [kmOdometerStart, setKmOdometerStart] = useState('')
  const [originMode, setOriginMode] = useState<'gps' | 'property' | 'manual'>('gps')
  const [originPropertyId, setOriginPropertyId] = useState<string | null>(null)
  const [showOriginList, setShowOriginList] = useState(false)
  const [originName, setOriginName] = useState('')
  const [originCity, setOriginCity] = useState('')
  const [objective, setObjective] = useState('')
  const [showObjectiveList, setShowObjectiveList] = useState(false)
  const [clientName, setClientName] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceValue, setInvoiceValue] = useState('')
  const [vehicleType, setVehicleType] = useState(savedVehicle?.vehicleType ?? '')
  const [showVehicleType, setShowVehicleType] = useState(false)
  const [vehiclePlate, setVehiclePlate] = useState(savedVehicle?.vehiclePlate ?? '')
  const [fuelType, setFuelType] = useState(savedVehicle?.fuelType ?? '')
  const [showFuelType, setShowFuelType] = useState(false)
  const [fuelPrice, setFuelPrice] = useState(savedVehicle?.fuelPricePerLiter?.toString() ?? '')
  const [showVehicleSection, setShowVehicleSection] = useState(false)
  const [idleGpsCoords, setIdleGpsCoords] = useState<string | null>(null)

  // ARRIVAL form
  const [arrivalPropertyId, setArrivalPropertyId] = useState<string | null>(null)
  const [showArrivalList, setShowArrivalList] = useState(false)
  const [arrivalLocationName, setArrivalLocationName] = useState('')
  const [arrivalGpsCoords, setArrivalGpsCoords] = useState<string | null>(null)
  const [observations, setObservations] = useState('')
  const [workHours, setWorkHours] = useState('')

  // SUMMARY
  const [kmOdometerEnd, setKmOdometerEnd] = useState('')

  const phase: JourneyPhase = journey?.phase ?? 'idle'
  const currentSeg = journey?.currentSegment ?? null

  // Load properties
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

  // Timer
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

  // Helpers
  function getTravelSegments(): Segment[] {
    return (journey?.segments ?? []).filter((s) => s.type === 'travel' && s.endedAt)
  }
  function getStaySegments(): Segment[] {
    return (journey?.segments ?? []).filter((s) => s.type === 'stay' && s.endedAt)
  }
  function totalKm() { return getTravelSegments().reduce((sum, s) => sum + (s.distanceKm ?? 0), 0) }
  function totalTravelMin() { return getTravelSegments().reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0) }
  function totalStayMin() { return getStaySegments().reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0) }
  function stopsCount() { return getStaySegments().length }

  // ══════════════════════════════════════════════════════════════════
  //  ACTIONS
  // ══════════════════════════════════════════════════════════════════

  async function handleCaptureGPS(target: 'idle' | 'arrival') {
    const fix = await requestLocation()
    if (!fix) return
    const coordStr = `${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)} (~${Math.round(fix.accuracy ?? 0)}m)`
    if (target === 'idle') setIdleGpsCoords(coordStr)
    else setArrivalGpsCoords(coordStr)
  }

  async function handleStartJourney() {
    if (!user) return Alert.alert('Erro', 'Usuario nao autenticado')
    setBusy(true)
    try {
      const fix = await requestLocation()
      if (!fix) { setBusy(false); return }

      let oPropertyId: string | undefined
      let oPropertyName: string | undefined
      let oName: string | undefined
      let oCity: string | undefined
      if (originMode === 'property' && originPropertyId) {
        const p = properties.find((pr) => pr.id === originPropertyId)
        oPropertyId = originPropertyId; oPropertyName = p?.name; oCity = p?.city ?? undefined
      } else if (originMode === 'manual') {
        oName = originName || undefined; oCity = originCity || undefined
      }

      const vConfig: VehicleConfig = {
        vehicleType: vehicleType || undefined, vehiclePlate: vehiclePlate || undefined,
        fuelType: fuelType || undefined, fuelPricePerLiter: fuelPrice ? Number(fuelPrice) : undefined,
      }
      if (vConfig.vehicleType || vConfig.vehiclePlate) store.setSavedVehicle(vConfig)

      const firstSeg: Segment = {
        id: uuid(), seq: 1, type: 'travel', startedAt: new Date().toISOString(),
        startLatitude: fix.latitude, startLongitude: fix.longitude,
      }
      const j: ActiveJourney = {
        id: uuid(), startedAt: new Date().toISOString(),
        originPropertyId: oPropertyId, originPropertyName: oPropertyName,
        originName: oName, originCity: oCity,
        objective: objective || undefined, clientName: clientName || undefined,
        invoiceNumber: invoiceNumber || undefined,
        invoiceValue: invoiceValue ? Number(invoiceValue) : undefined,
        vehicle: vConfig,
        kmOdometerStart: kmOdometerStart ? Number(kmOdometerStart) : undefined,
        segments: [firstSeg], currentSegment: firstSeg, phase: 'traveling',
      }
      store.startJourney(j)
      setKmOdometerStart(''); setOriginPropertyId(null); setOriginName(''); setOriginCity('')
      setObjective(''); setClientName(''); setInvoiceNumber(''); setInvoiceValue('')
      setIdleGpsCoords(null)
    } finally { setBusy(false) }
  }

  async function handleEndJourney() {
    if (!journey || !currentSeg) return
    setBusy(true)
    try {
      const fix = await requestLocation()
      if (!fix) { setBusy(false); return }
      const now = new Date().toISOString()
      const durMin = (Date.now() - new Date(currentSeg.startedAt).getTime()) / 60000

      if (currentSeg.type === 'travel') {
        const dist = haversineKm(
          currentSeg.startLatitude!, currentSeg.startLongitude!,
          fix.latitude, fix.longitude,
        )
        store.closeCurrentSegment({
          endedAt: now, durationMinutes: durMin,
          endLatitude: fix.latitude, endLongitude: fix.longitude,
          distanceKm: dist,
        })
      }

      setArrivalGpsCoords(`${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)} (~${Math.round(fix.accuracy ?? 0)}m)`)
      setArrivalPropertyId(null)
      setArrivalLocationName('')
      setObservations('')
      setWorkHours('')

      // Auto-detect nearby property
      const propsCoords: PropertyWithCoords[] = properties.map((p) => ({
        id: p.id, name: p.name, tipo: p.tipo, latitude: p.latitude, longitude: p.longitude,
      }))
      const nearest = findNearestProperty(propsCoords, fix.latitude, fix.longitude, 0.5)
      if (nearest) {
        setArrivalPropertyId(nearest.property.id)
      }

      store.setPhase('arrival')
    } finally { setBusy(false) }
  }

  async function handleSaveJourney() {
    if (!journey || !user) return

    if (!arrivalPropertyId && !arrivalLocationName.trim()) {
      return Alert.alert('Atencao', 'Informe o local de chegada (propriedade ou nome).')
    }

    setBusy(true)
    try {
      const db = getDb()
      const now = new Date().toISOString()

      // Create a stay segment for the arrival
      const lastSeg = journey.segments[journey.segments.length - 1]
      const staySeg: Segment = {
        id: uuid(), seq: lastSeg.seq + 1, type: 'stay',
        startedAt: lastSeg.endedAt ?? now, endedAt: now, durationMinutes: 0,
        propertyId: arrivalPropertyId ?? undefined,
        propertyName: arrivalPropertyId ? properties.find((p) => p.id === arrivalPropertyId)?.name : undefined,
        propertyTipo: arrivalPropertyId ? properties.find((p) => p.id === arrivalPropertyId)?.tipo : undefined,
        locationName: (!arrivalPropertyId && arrivalLocationName) ? arrivalLocationName : undefined,
        observations: observations || undefined,
        workHours: workHours ? Number(workHours) : undefined,
      }
      store.pushSegment(staySeg)

      // Now save everything
      const allSegments = [...journey.segments, staySeg]
      const travelSegs = allSegments.filter((s) => s.type === 'travel' && s.endedAt)
      const staySegs = allSegments.filter((s) => s.type === 'stay')
      const totDistKm = travelSegs.reduce((a, s) => a + (s.distanceKm ?? 0), 0)
      const totTravelMin = travelSegs.reduce((a, s) => a + (s.durationMinutes ?? 0), 0)
      const totStayMin = staySegs.reduce((a, s) => a + (s.durationMinutes ?? 0), 0)
      const avgSpeed = totTravelMin > 0 ? (totDistKm / (totTravelMin / 60)) : 0

      await db.runAsync(
        `INSERT INTO journeys
          (id, collaborator_id, date, started_at, ended_at,
           total_distance_km, total_travel_minutes, total_stay_minutes, average_speed_kmh,
           km_odometer_start, km_odometer_end,
           origin_property_id, origin_name, origin_city,
           objective, client_name, invoice_number, invoice_value,
           vehicle_type, vehicle_plate, fuel_type, fuel_price_per_liter,
           observations, tenant_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          journey.id, user.id, journey.startedAt.split('T')[0],
          journey.startedAt, now,
          totDistKm, totTravelMin, totStayMin, avgSpeed,
          journey.kmOdometerStart ?? null, journey.kmOdometerEnd ?? null,
          journey.originPropertyId ?? null, journey.originName ?? null, journey.originCity ?? null,
          journey.objective ?? null, journey.clientName ?? null,
          journey.invoiceNumber ?? null, journey.invoiceValue ?? null,
          journey.vehicle?.vehicleType ?? null, journey.vehicle?.vehiclePlate ?? null,
          journey.vehicle?.fuelType ?? null, journey.vehicle?.fuelPricePerLiter ?? null,
          null, user.tenant_id, now,
        ]
      )
      await enqueue('journeys', 'INSERT', {
        id: journey.id, collaborator_id: user.id,
        date: journey.startedAt.split('T')[0],
        started_at: journey.startedAt, ended_at: now,
        total_distance_km: totDistKm, total_travel_minutes: totTravelMin,
        total_stay_minutes: totStayMin, average_speed_kmh: avgSpeed,
        km_odometer_start: journey.kmOdometerStart, km_odometer_end: journey.kmOdometerEnd,
        origin_property_id: journey.originPropertyId,
        origin_name: journey.originName, origin_city: journey.originCity,
        objective: journey.objective, client_name: journey.clientName,
        invoice_number: journey.invoiceNumber, invoice_value: journey.invoiceValue,
        vehicle_type: journey.vehicle?.vehicleType, vehicle_plate: journey.vehicle?.vehiclePlate,
        fuel_type: journey.vehicle?.fuelType, fuel_price_per_liter: journey.vehicle?.fuelPricePerLiter,
        tenant_id: user.tenant_id,
      }, uuid())

      for (const seg of allSegments) {
        if (!seg.endedAt) continue
        await db.runAsync(
          `INSERT INTO journey_segments
            (id, journey_id, seq, type, started_at, ended_at, duration_minutes,
             start_latitude, start_longitude, end_latitude, end_longitude, distance_km,
             property_id, location_name, observations, work_hours, tenant_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            seg.id, journey.id, seg.seq, seg.type,
            seg.startedAt, seg.endedAt, seg.durationMinutes ?? null,
            seg.startLatitude ?? null, seg.startLongitude ?? null,
            seg.endLatitude ?? null, seg.endLongitude ?? null,
            seg.distanceKm ?? null, seg.propertyId ?? null, seg.locationName ?? null,
            seg.observations ?? null, seg.workHours ?? null, user.tenant_id, now,
          ]
        )
        await enqueue('journey_segments', 'INSERT', {
          id: seg.id, journey_id: journey.id, seq: seg.seq, type: seg.type,
          started_at: seg.startedAt, ended_at: seg.endedAt,
          duration_minutes: seg.durationMinutes,
          start_latitude: seg.startLatitude, start_longitude: seg.startLongitude,
          end_latitude: seg.endLatitude, end_longitude: seg.endLongitude,
          distance_km: seg.distanceKm, property_id: seg.propertyId,
          location_name: seg.locationName, observations: seg.observations,
          work_hours: seg.workHours, tenant_id: user.tenant_id,
        }, uuid())
      }

      store.setPhase('summary')
      Alert.alert('Jornada salva', 'Dados registrados. Sincronize quando houver conexao.')
      store.endJourney()
      setKmOdometerEnd(''); setObservations(''); setWorkHours('')
    } catch (e: any) {
      Alert.alert('Erro', e.message)
    } finally { setBusy(false) }
  }

  function handleCancelJourney() {
    Alert.alert('Cancelar jornada', 'Deseja descartar? Todos os dados serao perdidos.', [
      { text: 'Nao', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => {
        store.endJourney(); setObservations(''); setWorkHours(''); setKmOdometerEnd('')
      }},
    ])
  }

  // ══════════════════════════════════════════════════════════════════
  //  STEP INDICATOR
  // ══════════════════════════════════════════════════════════════════
  const stepIndex = phase === 'idle' ? 0 : phase === 'traveling' ? 1 : phase === 'arrival' ? 2 : 3
  const STEPS = ['Partida', 'Trajeto', 'Chegada', 'Resumo']

  function StepIndicator() {
    return (
      <View style={st.steps}>
        {STEPS.map((label, i) => {
          const done = i < stepIndex
          const active = i === stepIndex
          return (
            <View key={label} style={st.step}>
              <View style={[st.stepDot, done && st.stepDone, active && st.stepActive]}>
                <Text style={[st.stepDotText, (done || active) && st.stepDotTextActive]}>
                  {done ? '✓' : String(i + 1)}
                </Text>
              </View>
              <Text style={[st.stepLabel, (done || active) && st.stepLabelActive]}>{label}</Text>
              {i < STEPS.length - 1 && (
                <View style={[st.stepLine, done && st.stepLineDone]} />
              )}
            </View>
          )
        })}
      </View>
    )
  }

  // ══════════════════════════════════════════════════════════════════
  //  RENDER — IDLE
  // ══════════════════════════════════════════════════════════════════
  if (phase === 'idle') {
    const selectedOriginProp = originPropertyId ? properties.find((p) => p.id === originPropertyId) : null
    return (
      <SafeAreaView style={st.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={st.content}>
            <View style={st.header}>
              <Text style={st.title}>Jornada</Text>
              <Text style={st.subtitle}>Registre seu dia: deslocamentos e paradas</Text>
            </View>

            <StepIndicator />

            <SectionHeader title="Ponto de partida" />

            {/* GPS inline + coords */}
            <View style={st.gpsRow}>
              <TouchableOpacity
                style={[st.gpsBtn, idleGpsCoords && st.gpsBtnFound]}
                onPress={() => handleCaptureGPS('idle')}
              >
                <Ionicons name="locate" size={18} color={idleGpsCoords ? '#fff' : C.blue} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[st.gpsText, idleGpsCoords && st.gpsTextFound]}>
                  {idleGpsCoords ? 'GPS capturado' : 'Clique para capturar GPS'}
                </Text>
                {idleGpsCoords && <Text style={st.gpsCoords}>{idleGpsCoords}</Text>}
              </View>
            </View>

            {/* Origin mode chips */}
            <View style={st.modeChips}>
              {(['gps', 'property', 'manual'] as const).map((m) => (
                <TouchableOpacity key={m}
                  style={[st.chip, originMode === m && st.chipActive]}
                  onPress={() => { setOriginMode(m); setShowOriginList(false) }}>
                  <Text style={[st.chipText, originMode === m && st.chipTextActive]}>
                    {m === 'gps' ? 'GPS atual' : m === 'property' ? 'Propriedade' : 'Digitar local'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {originMode === 'property' && (
              <View style={st.field}>
                <TouchableOpacity style={[st.input, st.selector]} onPress={() => setShowOriginList((v) => !v)}>
                  <Text style={selectedOriginProp ? st.inputText : st.placeholder}>
                    {selectedOriginProp ? selectedOriginProp.name : 'Selecionar propriedade...'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={C.subtle} />
                </TouchableOpacity>
                {showOriginList && (
                  <View style={st.dropdown}>
                    {properties.map((p) => (
                      <TouchableOpacity key={p.id} style={st.dropdownItem}
                        onPress={() => { setOriginPropertyId(p.id); setShowOriginList(false) }}>
                        <Text style={st.dropdownText}>{p.tipo === 'propria' ? '🏠 ' : '👤 '}{p.name}</Text>
                        {p.city ? <Text style={st.dropdownSub}>{p.city}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {originMode === 'manual' && (
              <>
                <View style={st.field}>
                  <Text style={st.label}>Nome do local</Text>
                  <TextInput style={st.input} value={originName} onChangeText={setOriginName}
                    placeholder="Ex: Escritorio, Casa, Hotel..." placeholderTextColor={C.subtle} />
                </View>
                <View style={st.field}>
                  <Text style={st.label}>Cidade</Text>
                  <TextInput style={st.input} value={originCity} onChangeText={setOriginCity}
                    placeholder="Ex: Campinas - SP" placeholderTextColor={C.subtle} />
                </View>
              </>
            )}

            <SectionHeader title="Informacoes da jornada" />

            <View style={st.field}>
              <Text style={st.label}>Objetivo</Text>
              <TouchableOpacity style={[st.input, st.selector]} onPress={() => setShowObjectiveList((v) => !v)}>
                <Text style={objective ? st.inputText : st.placeholder}>{objective || 'Selecionar objetivo...'}</Text>
                <Ionicons name="chevron-down" size={16} color={C.subtle} />
              </TouchableOpacity>
              {showObjectiveList && (
                <View style={st.dropdown}>
                  {OBJECTIVE_OPTIONS.map((opt) => (
                    <TouchableOpacity key={opt} style={st.dropdownItem}
                      onPress={() => { setObjective(opt); setShowObjectiveList(false) }}>
                      <Text style={st.dropdownText}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={st.field}>
              <Text style={st.label}>Nome do cliente (opcional)</Text>
              <TextInput style={st.input} value={clientName} onChangeText={setClientName}
                placeholder="Ex: Fazenda Boa Vista Ltda" placeholderTextColor={C.subtle} />
            </View>

            <View style={st.row}>
              <View style={{ flex: 1 }}>
                <Text style={st.label}>N. da nota</Text>
                <TextInput style={st.input} value={invoiceNumber} onChangeText={setInvoiceNumber}
                  placeholder="000000" keyboardType="numeric" placeholderTextColor={C.subtle} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={st.label}>Valor (R$)</Text>
                <TextInput style={st.input} value={invoiceValue} onChangeText={setInvoiceValue}
                  placeholder="0,00" keyboardType="numeric" placeholderTextColor={C.subtle} />
              </View>
            </View>

            <TouchableOpacity style={st.sectionToggle} onPress={() => setShowVehicleSection((v) => !v)}>
              <Ionicons name="car" size={16} color={C.muted} />
              <Text style={st.sectionToggleText}>Veiculo e combustivel</Text>
              <Ionicons name={showVehicleSection ? 'chevron-up' : 'chevron-down'} size={16} color={C.subtle} />
            </TouchableOpacity>

            {showVehicleSection && (
              <View style={{ marginBottom: 8 }}>
                <View style={st.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.label}>Tipo</Text>
                    <TouchableOpacity style={[st.input, st.selector]} onPress={() => setShowVehicleType((v) => !v)}>
                      <Text style={vehicleType ? st.inputText : st.placeholder}>{vehicleType || 'Selecionar...'}</Text>
                      <Ionicons name="chevron-down" size={14} color={C.subtle} />
                    </TouchableOpacity>
                    {showVehicleType && (
                      <View style={st.dropdown}>{VEHICLE_TYPE_OPTIONS.map((opt) => (
                        <TouchableOpacity key={opt} style={st.dropdownItem}
                          onPress={() => { setVehicleType(opt); setShowVehicleType(false) }}>
                          <Text style={st.dropdownText}>{opt}</Text>
                        </TouchableOpacity>
                      ))}</View>
                    )}
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.label}>Placa</Text>
                    <TextInput style={st.input} value={vehiclePlate} onChangeText={setVehiclePlate}
                      placeholder="ABC-1234" autoCapitalize="characters" placeholderTextColor={C.subtle} />
                  </View>
                </View>
                <View style={st.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.label}>Combustivel</Text>
                    <TouchableOpacity style={[st.input, st.selector]} onPress={() => setShowFuelType((v) => !v)}>
                      <Text style={fuelType ? st.inputText : st.placeholder}>{fuelType || 'Selecionar...'}</Text>
                      <Ionicons name="chevron-down" size={14} color={C.subtle} />
                    </TouchableOpacity>
                    {showFuelType && (
                      <View style={st.dropdown}>{FUEL_TYPE_OPTIONS.map((opt) => (
                        <TouchableOpacity key={opt} style={st.dropdownItem}
                          onPress={() => { setFuelType(opt); setShowFuelType(false) }}>
                          <Text style={st.dropdownText}>{opt}</Text>
                        </TouchableOpacity>
                      ))}</View>
                    )}
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.label}>Preco/litro (R$)</Text>
                    <TextInput style={st.input} value={fuelPrice} onChangeText={setFuelPrice}
                      placeholder="6,50" keyboardType="numeric" placeholderTextColor={C.subtle} />
                  </View>
                </View>
              </View>
            )}

            <View style={[st.field, { marginTop: 16 }]}>
              <Text style={st.label}>KM odometro inicial (opcional)</Text>
              <TextInput style={st.input} value={kmOdometerStart} onChangeText={setKmOdometerStart}
                placeholder="Ex: 45230" keyboardType="numeric" placeholderTextColor={C.subtle} />
            </View>

            <TouchableOpacity style={[st.btnPrimary, busy && st.btnDisabled]} onPress={handleStartJourney} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="play" size={18} color="#fff" /><Text style={st.btnPrimaryText}>Iniciar Jornada</Text></>
              )}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // ══════════════════════════════════════════════════════════════════
  //  RENDER — TRAVELING
  // ══════════════════════════════════════════════════════════════════
  if (phase === 'traveling' && currentSeg) {
    return (
      <SafeAreaView style={st.container} edges={['top']}>
        <ScrollView contentContainerStyle={st.content}>
          <StepIndicator />

          <View style={st.phaseCard}>
            <View style={st.phaseRow}>
              <Ionicons name="car" size={20} color={C.blue} />
              <Text style={st.phaseLabel}>EM DESLOCAMENTO</Text>
            </View>
            {journey?.objective && <Text style={st.objectiveBadge}>{journey.objective}</Text>}
            <Text style={st.timer}>{formatTimer(elapsedSec)}</Text>
            <Text style={st.phaseStarted}>Partida as {formatTime(currentSeg.startedAt)}</Text>
          </View>

          {/* GPS display */}
          <View style={[st.gpsRow, st.gpsRowFound]}>
            <View style={[st.gpsBtn, st.gpsBtnFound]}>
              <Ionicons name="locate" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.gpsTextFound}>GPS ativo</Text>
              <Text style={st.gpsCoords}>
                {currentSeg.startLatitude?.toFixed(6)}, {currentSeg.startLongitude?.toFixed(6)}
              </Text>
            </View>
          </View>

          <PartialSummary km={totalKm()} stops={stopsCount()} travelMin={totalTravelMin()} stayMin={totalStayMin()} />

          <TouchableOpacity style={[st.btnPrimary, busy && st.btnDisabled]} onPress={handleEndJourney} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : (
              <><Ionicons name="flag" size={18} color="#fff" /><Text style={st.btnPrimaryText}>Encerrar Jornada</Text></>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={st.btnGhost} onPress={handleCancelJourney} disabled={busy}>
            <Text style={st.btnGhostText}>Cancelar jornada</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ══════════════════════════════════════════════════════════════════
  //  RENDER — ARRIVAL
  // ══════════════════════════════════════════════════════════════════
  if (phase === 'arrival' && journey) {
    const travelSegs = journey.segments.filter((s) => s.type === 'travel' && s.endedAt)
    const totKm = travelSegs.reduce((a, s) => a + (s.distanceKm ?? 0), 0)
    const totTravelMin = travelSegs.reduce((a, s) => a + (s.durationMinutes ?? 0), 0)
    const selectedArrivalProp = arrivalPropertyId ? properties.find((p) => p.id === arrivalPropertyId) : null
    const isPropria = selectedArrivalProp?.tipo === 'propria'

    return (
      <SafeAreaView style={st.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={st.content}>
            <StepIndicator />

            <View style={[st.phaseCard, { borderColor: C.primary, backgroundColor: C.primaryMuted }]}>
              <View style={st.phaseRow}>
                <Ionicons name="location" size={20} color={C.primaryDark} />
                <Text style={[st.phaseLabel, { color: C.primaryDark }]}>REGISTRAR CHEGADA</Text>
              </View>
              <Text style={st.travelInfo}>Deslocamento: {totKm.toFixed(1)} km em {Math.round(totTravelMin)} min</Text>
            </View>

            {/* Arrival form */}
            <View style={st.arrivalForm}>
              <Text style={st.arrivalFormTitle}>Ponto de chegada</Text>

              {/* GPS inline + Property selector */}
              <View style={st.field}>
                <Text style={st.label}>Propriedade / Estabelecimento</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[st.gpsBtn, arrivalGpsCoords && st.gpsBtnFound]}
                    onPress={() => handleCaptureGPS('arrival')}
                  >
                    <Ionicons name="locate" size={18} color={arrivalGpsCoords ? '#fff' : C.blue} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.input, st.selector, { flex: 1 }]}
                    onPress={() => setShowArrivalList((v) => !v)}>
                    <Text style={selectedArrivalProp ? st.inputText : st.placeholder}>
                      {selectedArrivalProp ? selectedArrivalProp.name : 'Selecionar propriedade...'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={C.subtle} />
                  </TouchableOpacity>
                </View>
                {arrivalGpsCoords && <Text style={st.gpsCoordsInline}>{arrivalGpsCoords}</Text>}
                {showArrivalList && (
                  <View style={st.dropdown}>
                    {properties.map((p) => (
                      <TouchableOpacity key={p.id} style={st.dropdownItem}
                        onPress={() => { setArrivalPropertyId(p.id); setArrivalLocationName(''); setShowArrivalList(false) }}>
                        <Text style={st.dropdownText}>{p.tipo === 'propria' ? '🏠 ' : '👤 '}{p.name}</Text>
                        {p.city ? <Text style={st.dropdownSub}>{p.city}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={st.field}>
                <Text style={st.label}>Ou digite o nome do local</Text>
                <TextInput style={st.input} value={arrivalLocationName}
                  onChangeText={(v) => { setArrivalLocationName(v); if (v) setArrivalPropertyId(null) }}
                  placeholder="Ex: Cooperativa, Posto, Fazenda nova..." placeholderTextColor={C.subtle} />
              </View>

              {selectedArrivalProp && (
                <View style={[st.tipoBadge, isPropria ? st.badgePropria : st.badgeCliente]}>
                  <Text style={[st.tipoText, isPropria ? st.tipoTextPropria : st.tipoTextCliente]}>
                    {isPropria ? '🏠 Fazenda Propria' : '👤 Cliente'}
                  </Text>
                </View>
              )}

              <View style={st.field}>
                <Text style={st.label}>Observacoes</Text>
                <TextInput style={[st.input, st.textarea]} value={observations}
                  onChangeText={setObservations} placeholder="Anotacoes sobre esta visita..."
                  multiline numberOfLines={3} textAlignVertical="top" placeholderTextColor={C.subtle} />
              </View>

              {isPropria && (
                <View style={st.field}>
                  <Text style={st.label}>Horas trabalhadas</Text>
                  <TextInput style={st.input} value={workHours} onChangeText={setWorkHours}
                    placeholder="Ex: 8" keyboardType="numeric" placeholderTextColor={C.subtle} />
                </View>
              )}
            </View>

            <View style={st.field}>
              <Text style={st.label}>KM odometro final (opcional)</Text>
              <TextInput style={st.input} value={kmOdometerEnd}
                onChangeText={(v) => { setKmOdometerEnd(v); if (v) store.setKmOdometerEnd(Number(v)) }}
                placeholder="Ex: 45312" keyboardType="numeric" placeholderTextColor={C.subtle} />
            </View>

            <TouchableOpacity style={[st.btnPrimary, busy && st.btnDisabled]} onPress={handleSaveJourney} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="checkmark-circle" size={18} color="#fff" /><Text style={st.btnPrimaryText}>Salvar Jornada</Text></>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={st.btnGhost} onPress={() => store.setPhase('traveling')} disabled={busy}>
              <Text style={[st.btnGhostText, { color: C.muted }]}>Voltar ao trajeto</Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.btnGhost} onPress={handleCancelJourney} disabled={busy}>
              <Text style={st.btnGhostText}>Descartar</Text>
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return null
}

// ══════════════════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={st.sectionHeader}>
      <Text style={st.sectionTitle}>{title}</Text>
    </View>
  )
}

function PartialSummary({ km, stops, travelMin, stayMin }: {
  km: number; stops: number; travelMin: number; stayMin: number
}) {
  return (
    <View style={st.partialSummary}>
      <Text style={st.partialTitle}>Resumo parcial</Text>
      <Text style={st.partialText}>
        {km.toFixed(1)} km  |  {stops} parada{stops !== 1 ? 's' : ''}  |  {formatDuration(travelMin + stayMin)} total
      </Text>
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

// ══════════════════════════════════════════════════════════════════════
//  STYLES
// ══════════════════════════════════════════════════════════════════════

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20 },
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 4 },

  // Steps
  steps: { flexDirection: 'row', marginBottom: 20, paddingHorizontal: 10 },
  step: { flex: 1, alignItems: 'center', position: 'relative' },
  stepDot: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: C.border,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  stepActive: { borderColor: C.primary, backgroundColor: C.primary },
  stepDone: { borderColor: C.primary, backgroundColor: C.primaryMuted },
  stepDotText: { fontSize: 12, fontWeight: '700', color: C.subtle },
  stepDotTextActive: { color: '#fff' },
  stepLabel: { fontSize: 10, fontWeight: '600', color: C.subtle, marginTop: 4, textTransform: 'uppercase' },
  stepLabelActive: { color: C.primaryDark },
  stepLine: { position: 'absolute', top: 14, left: '50%', width: '100%', height: 2, backgroundColor: C.border, zIndex: 0 },
  stepLineDone: { backgroundColor: C.primary },

  // Section
  sectionHeader: { marginTop: 8, marginBottom: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.subtle, letterSpacing: 0.8, textTransform: 'uppercase' },
  sectionToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, marginTop: 8, borderTopWidth: 1, borderTopColor: C.border },
  sectionToggleText: { fontSize: 14, fontWeight: '600', color: C.muted, flex: 1 },

  // GPS
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  gpsRowFound: {},
  gpsBtn: {
    width: 48, height: 48, borderRadius: 8, borderWidth: 1.5, borderColor: C.blue,
    backgroundColor: C.blueMuted, alignItems: 'center', justifyContent: 'center',
  },
  gpsBtnFound: { borderColor: C.primary, backgroundColor: C.primary },
  gpsText: { fontSize: 13, color: C.subtle },
  gpsTextFound: { fontSize: 13, color: C.primaryDark, fontWeight: '500' },
  gpsCoords: { fontSize: 11, color: C.muted, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  gpsCoordsInline: { fontSize: 11, color: C.primaryDark, fontWeight: '500', marginTop: 4, paddingLeft: 56, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // Mode chips
  modeChips: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, backgroundColor: '#fff' },
  chipActive: { borderColor: C.primary, backgroundColor: C.primaryMuted },
  chipText: { fontSize: 13, color: C.muted, fontWeight: '500' },
  chipTextActive: { color: C.primaryDark },

  // Phase card
  phaseCard: {
    backgroundColor: C.blueMuted, borderRadius: 12, padding: 20,
    marginBottom: 20, alignItems: 'center', borderWidth: 1, borderColor: C.blue,
  },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phaseLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: C.blue, textTransform: 'uppercase' },
  phaseStarted: { fontSize: 13, color: C.muted, marginTop: 4 },
  objectiveBadge: {
    fontSize: 12, fontWeight: '600', color: C.blue,
    backgroundColor: '#fff', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8, overflow: 'hidden',
  },
  travelInfo: { fontSize: 13, color: C.muted, marginTop: 8 },
  timer: { fontSize: 40, fontWeight: '700', color: C.blue, marginVertical: 8, fontVariant: ['tabular-nums'] },

  // Arrival form
  arrivalForm: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    borderWidth: 1.5, borderColor: C.primary, marginBottom: 16,
  },
  arrivalFormTitle: { fontSize: 14, fontWeight: '700', color: C.primaryDark, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Fields
  field: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.border, borderRadius: 8, padding: 12, fontSize: 15, color: C.text },
  inputText: { fontSize: 15, color: C.text, flex: 1 },
  placeholder: { fontSize: 15, color: C.subtle, flex: 1 },
  selector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  textarea: { minHeight: 70 },
  row: { flexDirection: 'row', marginBottom: 14 },
  dropdown: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 8, marginTop: 4, maxHeight: 280, overflow: 'hidden' },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownText: { fontSize: 15, color: C.text, fontWeight: '500' },
  dropdownSub: { fontSize: 12, color: C.subtle, marginTop: 2 },

  // Badges
  tipoBadge: { borderRadius: 8, padding: 10, marginBottom: 14 },
  badgePropria: { backgroundColor: C.primaryMuted },
  badgeCliente: { backgroundColor: C.soilMuted },
  tipoText: { fontSize: 13, fontWeight: '500' },
  tipoTextPropria: { color: C.primaryDark },
  tipoTextCliente: { color: '#a8451d' },

  // Partial summary
  partialSummary: { backgroundColor: '#fff', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  partialTitle: { fontSize: 10, fontWeight: '700', color: C.subtle, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  partialText: { fontSize: 13, color: C.muted, fontWeight: '500' },

  // Buttons
  btnPrimary: {
    backgroundColor: C.primary, borderRadius: 10, padding: 16,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 8,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnDisabled: { backgroundColor: '#c8c2b5' },
  btnGhost: { padding: 12, alignItems: 'center', marginTop: 8 },
  btnGhostText: { color: C.danger, fontSize: 14, fontWeight: '500' },
})
