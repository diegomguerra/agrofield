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

  // IDLE form fields
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
  // Vehicle
  const [vehicleType, setVehicleType] = useState(savedVehicle?.vehicleType ?? '')
  const [showVehicleType, setShowVehicleType] = useState(false)
  const [vehiclePlate, setVehiclePlate] = useState(savedVehicle?.vehiclePlate ?? '')
  const [fuelType, setFuelType] = useState(savedVehicle?.fuelType ?? '')
  const [showFuelType, setShowFuelType] = useState(false)
  const [fuelPrice, setFuelPrice] = useState(savedVehicle?.fuelPricePerLiter?.toString() ?? '')
  const [showVehicleSection, setShowVehicleSection] = useState(false)

  // TRAVELING fields
  const [destPropertyId, setDestPropertyId] = useState<string | null>(null)
  const [destName, setDestName] = useState('')
  const [showDestList, setShowDestList] = useState(false)

  // ON_SITE fields
  const [observations, setObservations] = useState('')
  const [workHours, setWorkHours] = useState('')

  // SUMMARY
  const [kmOdometerEnd, setKmOdometerEnd] = useState('')

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
      const now = new Date().toISOString()

      // Resolve origin
      let oPropertyId: string | undefined
      let oPropertyName: string | undefined
      let oName: string | undefined
      let oCity: string | undefined

      if (originMode === 'property' && originPropertyId) {
        const p = properties.find((pr) => pr.id === originPropertyId)
        oPropertyId = originPropertyId
        oPropertyName = p?.name
        oCity = p?.city ?? undefined
      } else if (originMode === 'manual') {
        oName = originName || undefined
        oCity = originCity || undefined
      }

      // Save vehicle config
      const vConfig: VehicleConfig = {
        vehicleType: vehicleType || undefined,
        vehiclePlate: vehiclePlate || undefined,
        fuelType: fuelType || undefined,
        fuelPricePerLiter: fuelPrice ? Number(fuelPrice) : undefined,
      }
      if (vConfig.vehicleType || vConfig.vehiclePlate) {
        store.setSavedVehicle(vConfig)
      }

      const firstSeg: Segment = {
        id: uuid(), seq: 1, type: 'travel', startedAt: now,
        startLatitude: fix.latitude, startLongitude: fix.longitude,
      }

      const j: ActiveJourney = {
        id: journeyId, startedAt: now,
        originPropertyId: oPropertyId,
        originPropertyName: oPropertyName,
        originName: oName,
        originCity: oCity,
        objective: objective || undefined,
        clientName: clientName || undefined,
        invoiceNumber: invoiceNumber || undefined,
        invoiceValue: invoiceValue ? Number(invoiceValue) : undefined,
        vehicle: vConfig,
        kmOdometerStart: kmOdometerStart ? Number(kmOdometerStart) : undefined,
        segments: [firstSeg],
        currentSegment: firstSeg,
        phase: 'traveling',
      }
      store.startJourney(j)

      // Reset idle fields
      setKmOdometerStart('')
      setOriginPropertyId(null)
      setOriginName('')
      setOriginCity('')
      setObjective('')
      setClientName('')
      setInvoiceNumber('')
      setInvoiceValue('')
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

      // Close travel segment
      store.closeCurrentSegment({
        endedAt: now,
        endLatitude: fix.latitude, endLongitude: fix.longitude,
        distanceKm: dist, durationMinutes: durMin,
      })

      // Detect nearby property
      const propsCoords: PropertyWithCoords[] = properties.map((p) => ({
        id: p.id, name: p.name, tipo: p.tipo,
        latitude: p.latitude, longitude: p.longitude,
      }))
      const nearest = findNearestProperty(propsCoords, fix.latitude, fix.longitude, 0.5)

      // If user pre-selected, use that; otherwise use nearest
      let propId = destPropertyId
      let propName = destPropertyId ? properties.find((p) => p.id === destPropertyId)?.name : undefined
      let propTipo = destPropertyId ? properties.find((p) => p.id === destPropertyId)?.tipo : undefined
      let locName = (!destPropertyId && destName) ? destName : undefined

      if (!propId && !locName && nearest) {
        propId = nearest.property.id
        propName = nearest.property.name
        propTipo = nearest.property.tipo
      }

      // Open stay segment
      const staySeg: Segment = {
        id: uuid(), seq: currentSeg.seq + 1, type: 'stay', startedAt: now,
        propertyId: propId ?? undefined,
        propertyName: propName,
        propertyTipo: propTipo,
        locationName: locName,
      }
      store.pushSegment(staySeg)
      store.setPhase('on_site')
      setDestPropertyId(null)
      setDestName('')
      setShowDestList(false)
      setObservations('')
      setWorkHours('')

      // If nothing matched, ask user
      if (!propId && !locName) {
        promptArrivalLocation(fix.latitude, fix.longitude)
      }
    } finally { setBusy(false) }
  }

  function promptArrivalLocation(lat: number, lng: number) {
    Alert.alert(
      'Local de chegada',
      'Informe onde voce chegou:',
      [
        { text: 'Selecionar propriedade', onPress: () => {} },
        { text: 'Digitar nome', onPress: () => {} },
        {
          text: 'Cadastrar nova propriedade',
          onPress: () => nav.navigate('NewProperty', { latitude: lat, longitude: lng }),
        },
      ]
    )
  }

  async function handleLeave() {
    if (!journey || !currentSeg || currentSeg.type !== 'stay') return

    if (!currentSeg.propertyId && !currentSeg.locationName) {
      return Alert.alert('Atencao', 'Informe o local (propriedade ou nome) antes de sair.')
    }

    setBusy(true)
    try {
      const fix = await requestLocation()
      if (!fix) { setBusy(false); return }
      const now = new Date().toISOString()
      const durMin = (Date.now() - new Date(currentSeg.startedAt).getTime()) / 60000

      store.closeCurrentSegment({
        endedAt: now, durationMinutes: durMin,
        observations: observations || undefined,
        workHours: workHours ? Number(workHours) : undefined,
      })

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
    Alert.alert('Encerrar jornada', 'Deseja encerrar a jornada do dia?', [
      { text: 'Nao', style: 'cancel' },
      { text: 'Encerrar', onPress: doEnd },
    ])
  }

  async function handleSaveJourney() {
    if (!journey || !user) return
    setBusy(true)
    try {
      const db = getDb()
      const now = new Date().toISOString()
      const segments = journey.segments

      const travelSegs = segments.filter((seg) => seg.type === 'travel' && seg.endedAt)
      const staySegs = segments.filter((seg) => seg.type === 'stay' && seg.endedAt)
      const totDistKm = travelSegs.reduce((a, seg) => a + (seg.distanceKm ?? 0), 0)
      const totTravelMin = travelSegs.reduce((a, seg) => a + (seg.durationMinutes ?? 0), 0)
      const totStayMin = staySegs.reduce((a, seg) => a + (seg.durationMinutes ?? 0), 0)
      const totMin = totTravelMin + totStayMin
      const avgSpeed = totMin > 0 ? (totDistKm / (totTravelMin / 60)) : 0

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
        km_odometer_start: journey.kmOdometerStart,
        km_odometer_end: journey.kmOdometerEnd,
        origin_property_id: journey.originPropertyId,
        origin_name: journey.originName, origin_city: journey.originCity,
        objective: journey.objective, client_name: journey.clientName,
        invoice_number: journey.invoiceNumber, invoice_value: journey.invoiceValue,
        vehicle_type: journey.vehicle?.vehicleType,
        vehicle_plate: journey.vehicle?.vehiclePlate,
        fuel_type: journey.vehicle?.fuelType,
        fuel_price_per_liter: journey.vehicle?.fuelPricePerLiter,
        tenant_id: user.tenant_id,
      }, uuid())

      for (const seg of segments) {
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
            seg.distanceKm ?? null,
            seg.propertyId ?? null, seg.locationName ?? null,
            seg.observations ?? null, seg.workHours ?? null,
            user.tenant_id, now,
          ]
        )
        await enqueue('journey_segments', 'INSERT', {
          id: seg.id, journey_id: journey.id, seq: seg.seq, type: seg.type,
          started_at: seg.startedAt, ended_at: seg.endedAt,
          duration_minutes: seg.durationMinutes,
          start_latitude: seg.startLatitude, start_longitude: seg.startLongitude,
          end_latitude: seg.endLatitude, end_longitude: seg.endLongitude,
          distance_km: seg.distanceKm,
          property_id: seg.propertyId, location_name: seg.locationName,
          observations: seg.observations, work_hours: seg.workHours,
          tenant_id: user.tenant_id,
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
            setObservations(''); setWorkHours(''); setKmOdometerEnd('')
          },
        },
      ]
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

            {/* ── ORIGIN SECTION ── */}
            <SectionHeader title="Ponto de partida" />

            <View style={st.originModes}>
              {(['gps', 'property', 'manual'] as const).map((m) => (
                <TouchableOpacity
                  key={m} style={[st.modeChip, originMode === m && st.modeChipActive]}
                  onPress={() => { setOriginMode(m); setShowOriginList(false) }}
                >
                  <Text style={[st.modeChipText, originMode === m && st.modeChipTextActive]}>
                    {m === 'gps' ? 'GPS atual' : m === 'property' ? 'Propriedade' : 'Digitar local'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {originMode === 'property' && (
              <View style={st.field}>
                <TouchableOpacity
                  style={[st.input, st.selector]}
                  onPress={() => setShowOriginList((v) => !v)}
                >
                  <Text style={selectedOriginProp ? st.inputText : st.placeholder}>
                    {selectedOriginProp ? selectedOriginProp.name : 'Selecionar propriedade...'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={C.subtle} />
                </TouchableOpacity>
                {showOriginList && (
                  <View style={st.dropdown}>
                    {properties.map((p) => (
                      <TouchableOpacity
                        key={p.id} style={st.dropdownItem}
                        onPress={() => { setOriginPropertyId(p.id); setShowOriginList(false) }}
                      >
                        <Text style={st.dropdownText}>
                          {p.tipo === 'propria' ? '🏠 ' : '👤 '}{p.name}
                        </Text>
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

            {/* ── OBJECTIVE SECTION ── */}
            <SectionHeader title="Informacoes da jornada" />

            <View style={st.field}>
              <Text style={st.label}>Objetivo</Text>
              <TouchableOpacity
                style={[st.input, st.selector]}
                onPress={() => setShowObjectiveList((v) => !v)}
              >
                <Text style={objective ? st.inputText : st.placeholder}>
                  {objective || 'Selecionar objetivo...'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={C.subtle} />
              </TouchableOpacity>
              {showObjectiveList && (
                <View style={st.dropdown}>
                  {OBJECTIVE_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt} style={st.dropdownItem}
                      onPress={() => { setObjective(opt); setShowObjectiveList(false) }}
                    >
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
                <Text style={st.label}>Valor da nota (R$)</Text>
                <TextInput style={st.input} value={invoiceValue} onChangeText={setInvoiceValue}
                  placeholder="0,00" keyboardType="numeric" placeholderTextColor={C.subtle} />
              </View>
            </View>

            {/* ── VEHICLE SECTION ── */}
            <TouchableOpacity
              style={st.sectionToggle}
              onPress={() => setShowVehicleSection((v) => !v)}
            >
              <Ionicons name="car" size={16} color={C.muted} />
              <Text style={st.sectionToggleText}>Veiculo e combustivel</Text>
              <Ionicons name={showVehicleSection ? 'chevron-up' : 'chevron-down'} size={16} color={C.subtle} />
            </TouchableOpacity>

            {showVehicleSection && (
              <View style={st.vehicleSection}>
                <View style={st.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.label}>Tipo de veiculo</Text>
                    <TouchableOpacity
                      style={[st.input, st.selector]}
                      onPress={() => setShowVehicleType((v) => !v)}
                    >
                      <Text style={vehicleType ? st.inputText : st.placeholder}>
                        {vehicleType || 'Selecionar...'}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={C.subtle} />
                    </TouchableOpacity>
                    {showVehicleType && (
                      <View style={st.dropdown}>
                        {VEHICLE_TYPE_OPTIONS.map((opt) => (
                          <TouchableOpacity key={opt} style={st.dropdownItem}
                            onPress={() => { setVehicleType(opt); setShowVehicleType(false) }}>
                            <Text style={st.dropdownText}>{opt}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.label}>Placa</Text>
                    <TextInput style={st.input} value={vehiclePlate} onChangeText={setVehiclePlate}
                      placeholder="ABC-1234" autoCapitalize="characters" placeholderTextColor={C.subtle} />
                  </View>
                </View>

                <View style={[st.row, { marginTop: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.label}>Combustivel</Text>
                    <TouchableOpacity
                      style={[st.input, st.selector]}
                      onPress={() => setShowFuelType((v) => !v)}
                    >
                      <Text style={fuelType ? st.inputText : st.placeholder}>
                        {fuelType || 'Selecionar...'}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={C.subtle} />
                    </TouchableOpacity>
                    {showFuelType && (
                      <View style={st.dropdown}>
                        {FUEL_TYPE_OPTIONS.map((opt) => (
                          <TouchableOpacity key={opt} style={st.dropdownItem}
                            onPress={() => { setFuelType(opt); setShowFuelType(false) }}>
                            <Text style={st.dropdownText}>{opt}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
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

            {/* ── ODOMETER ── */}
            <View style={[st.field, { marginTop: 16 }]}>
              <Text style={st.label}>KM odometro inicial (opcional)</Text>
              <TextInput style={st.input} value={kmOdometerStart} onChangeText={setKmOdometerStart}
                placeholder="Ex: 45230" keyboardType="numeric" placeholderTextColor={C.subtle} />
            </View>

            <TouchableOpacity
              style={[st.btnPrimary, busy && st.btnDisabled]}
              onPress={handleStartJourney}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="play" size={18} color="#fff" />
                  <Text style={st.btnPrimaryText}>Iniciar Jornada</Text>
                </>
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
    const selectedDest = destPropertyId ? properties.find((p) => p.id === destPropertyId) : null
    return (
      <SafeAreaView style={st.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={st.content}>
            <View style={st.phaseCard}>
              <View style={st.phaseRow}>
                <Ionicons name="car" size={20} color={C.blue} />
                <Text style={st.phaseLabel}>EM DESLOCAMENTO</Text>
                <Text style={st.phaseSeg}>Segmento #{currentSeg.seq}</Text>
              </View>
              {journey?.objective && (
                <Text style={st.objectiveBadge}>{journey.objective}</Text>
              )}
              <Text style={st.timer}>{formatTimer(elapsedSec)}</Text>
              <Text style={st.phaseStarted}>Partida as {formatTime(currentSeg.startedAt)}</Text>
            </View>

            {/* Destination */}
            <View style={st.field}>
              <Text style={st.label}>Destino (propriedade cadastrada)</Text>
              <TouchableOpacity
                style={[st.input, st.selector]}
                onPress={() => setShowDestList((v) => !v)}
              >
                <Text style={selectedDest ? st.inputText : st.placeholder}>
                  {selectedDest ? selectedDest.name : 'Selecionar ou detectar ao chegar'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={C.subtle} />
              </TouchableOpacity>
              {showDestList && (
                <View style={st.dropdown}>
                  <TouchableOpacity style={st.dropdownItem}
                    onPress={() => { setDestPropertyId(null); setShowDestList(false) }}>
                    <Text style={st.dropdownText}>Detectar por GPS ao chegar</Text>
                  </TouchableOpacity>
                  {properties.map((p) => (
                    <TouchableOpacity key={p.id} style={st.dropdownItem}
                      onPress={() => { setDestPropertyId(p.id); setDestName(''); setShowDestList(false) }}>
                      <Text style={st.dropdownText}>
                        {p.tipo === 'propria' ? '🏠 ' : '👤 '}{p.name}
                      </Text>
                      {p.city ? <Text style={st.dropdownSub}>{p.city}</Text> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={st.field}>
              <Text style={st.label}>Ou digite o nome do destino</Text>
              <TextInput style={st.input} value={destName}
                onChangeText={(v) => { setDestName(v); if (v) setDestPropertyId(null) }}
                placeholder="Ex: Posto Shell BR-101, Cooperativa..." placeholderTextColor={C.subtle} />
            </View>

            <PartialSummary km={totalKm()} stops={stopsCount()} travelMin={totalTravelMin()} stayMin={totalStayMin()} />

            <TouchableOpacity
              style={[st.btnArrived, busy && st.btnDisabled]}
              onPress={handleArrived} disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="location" size={18} color="#fff" />
                  <Text style={st.btnPrimaryText}>Cheguei</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={[st.btnOutline, { marginTop: 8 }]}
              onPress={handleEndJourney} disabled={busy}>
              <Ionicons name="flag" size={16} color={C.primary} />
              <Text style={st.btnOutlineText}>Encerrar Jornada</Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.btnGhost} onPress={handleCancelJourney} disabled={busy}>
              <Text style={st.btnGhostText}>Cancelar jornada</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // ══════════════════════════════════════════════════════════════════
  //  RENDER — ON_SITE
  // ══════════════════════════════════════════════════════════════════
  if (phase === 'on_site' && currentSeg) {
    const prevTravel = journey!.segments.find(
      (seg) => seg.seq === currentSeg.seq - 1 && seg.type === 'travel'
    )
    const isPropria = currentSeg.propertyTipo === 'propria'
    const displayName = currentSeg.propertyName ?? currentSeg.locationName ?? null

    return (
      <SafeAreaView style={st.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={st.content}>
            <View style={[st.phaseCard, { borderColor: C.primary, backgroundColor: C.primaryMuted }]}>
              <View style={st.phaseRow}>
                <Ionicons name="location" size={20} color={C.primaryDark} />
                <Text style={[st.phaseLabel, { color: C.primaryDark }]}>NO LOCAL</Text>
                <Text style={st.phaseSeg}>Parada #{Math.ceil(currentSeg.seq / 2)}</Text>
              </View>
              <Text style={st.propertyOnSite}>
                {displayName ?? 'Local nao informado'}
              </Text>
              {prevTravel && (
                <Text style={st.travelInfo}>
                  Deslocamento: {(prevTravel.distanceKm ?? 0).toFixed(1)} km  {formatDuration(prevTravel.durationMinutes ?? 0)}
                </Text>
              )}
              <Text style={[st.timer, { color: C.primaryDark }]}>{formatTimer(elapsedSec)}</Text>
              <Text style={st.timerLabel}>permanencia</Text>
            </View>

            {/* Property/location selector if not set */}
            {!currentSeg.propertyId && !currentSeg.locationName && (
              <>
                <View style={st.field}>
                  <Text style={st.label}>Selecione a propriedade</Text>
                  <TouchableOpacity
                    style={[st.input, st.selector]}
                    onPress={() => setShowDestList((v) => !v)}
                  >
                    <Text style={st.placeholder}>Selecionar...</Text>
                    <Ionicons name="chevron-down" size={16} color={C.subtle} />
                  </TouchableOpacity>
                  {showDestList && (
                    <View style={st.dropdown}>
                      {properties.map((p) => (
                        <TouchableOpacity key={p.id} style={st.dropdownItem}
                          onPress={() => {
                            store.updateCurrentSegment({
                              propertyId: p.id, propertyName: p.name, propertyTipo: p.tipo,
                            })
                            setShowDestList(false)
                          }}>
                          <Text style={st.dropdownText}>
                            {p.tipo === 'propria' ? '🏠 ' : '👤 '}{p.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                <View style={st.field}>
                  <Text style={st.label}>Ou digite o nome do local</Text>
                  <TextInput style={st.input}
                    placeholder="Nome do estabelecimento, propriedade..."
                    placeholderTextColor={C.subtle}
                    onEndEditing={(e) => {
                      if (e.nativeEvent.text.trim()) {
                        store.updateCurrentSegment({ locationName: e.nativeEvent.text.trim() })
                      }
                    }}
                  />
                </View>
              </>
            )}

            {currentSeg.propertyId && (
              <View style={[st.tipoBadge, isPropria ? st.badgePropria : st.badgeCliente]}>
                <Text style={[st.tipoText, isPropria ? st.tipoTextPropria : st.tipoTextCliente]}>
                  {isPropria ? '🏠 Fazenda Propria' : '👤 Cliente'}
                </Text>
              </View>
            )}

            <View style={st.field}>
              <Text style={st.label}>Observacoes</Text>
              <TextInput style={[st.input, st.textarea]} value={observations}
                onChangeText={setObservations} placeholder="Anotacoes sobre esta parada..."
                multiline numberOfLines={3} textAlignVertical="top" placeholderTextColor={C.subtle} />
            </View>

            {isPropria && (
              <View style={st.field}>
                <Text style={st.label}>Horas trabalhadas</Text>
                <TextInput style={st.input} value={workHours} onChangeText={setWorkHours}
                  placeholder="Ex: 8" keyboardType="numeric" placeholderTextColor={C.subtle} />
              </View>
            )}

            <PartialSummary km={totalKm()} stops={stopsCount()} travelMin={totalTravelMin()} stayMin={totalStayMin()} />

            <TouchableOpacity
              style={[st.btnPrimary, busy && st.btnDisabled]}
              onPress={handleLeave} disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="car" size={18} color="#fff" />
                  <Text style={st.btnPrimaryText}>Sair (proximo deslocamento)</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={[st.btnOutline, { marginTop: 8 }]}
              onPress={handleEndJourney} disabled={busy}>
              <Ionicons name="flag" size={16} color={C.primary} />
              <Text style={st.btnOutlineText}>Encerrar Jornada</Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.btnGhost} onPress={handleCancelJourney} disabled={busy}>
              <Text style={st.btnGhostText}>Cancelar jornada</Text>
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // ══════════════════════════════════════════════════════════════════
  //  RENDER — SUMMARY
  // ══════════════════════════════════════════════════════════════════
  if (phase === 'summary' && journey) {
    const segments = journey.segments.filter((seg) => seg.endedAt)
    const travelSegs = segments.filter((seg) => seg.type === 'travel')
    const staySegs = segments.filter((seg) => seg.type === 'stay')
    const totKm = travelSegs.reduce((a, seg) => a + (seg.distanceKm ?? 0), 0)
    const totTravelMin = travelSegs.reduce((a, seg) => a + (seg.durationMinutes ?? 0), 0)
    const totStayMin = staySegs.reduce((a, seg) => a + (seg.durationMinutes ?? 0), 0)
    const totMin = totTravelMin + totStayMin
    const avgSpeed = totTravelMin > 0 ? (totKm / (totTravelMin / 60)) : 0
    const fuelEst = journey.vehicle?.fuelPricePerLiter && avgSpeed > 0
      ? (totKm / 10) * journey.vehicle.fuelPricePerLiter : null // ~10 km/l estimate

    const originLabel = journey.originPropertyName
      ?? journey.originName
      ?? (journey.originCity ? `GPS — ${journey.originCity}` : 'GPS atual')

    return (
      <SafeAreaView style={st.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={st.content}>
            <View style={[st.phaseCard, { borderColor: C.primary, backgroundColor: C.primaryMuted }]}>
              <Ionicons name="checkmark-circle" size={32} color={C.primaryDark} />
              <Text style={[st.phaseLabel, { color: C.primaryDark, marginTop: 8 }]}>JORNADA ENCERRADA</Text>
              <Text style={st.summaryDate}>{formatDateBR(journey.startedAt)}</Text>
              {journey.objective && <Text style={st.objectiveBadge}>{journey.objective}</Text>}
            </View>

            {/* Origin + info */}
            <View style={st.infoCard}>
              <InfoRow label="Origem" value={originLabel} />
              {journey.clientName && <InfoRow label="Cliente" value={journey.clientName} />}
              {journey.invoiceNumber && <InfoRow label="Nota" value={`#${journey.invoiceNumber}`} />}
              {journey.invoiceValue && <InfoRow label="Valor" value={`R$ ${journey.invoiceValue.toFixed(2)}`} />}
              {journey.vehicle?.vehicleType && (
                <InfoRow label="Veiculo"
                  value={`${journey.vehicle.vehicleType}${journey.vehicle.vehiclePlate ? ` — ${journey.vehicle.vehiclePlate}` : ''}`} />
              )}
              {journey.vehicle?.fuelType && (
                <InfoRow label="Combustivel"
                  value={`${journey.vehicle.fuelType}${journey.vehicle.fuelPricePerLiter ? ` (R$ ${journey.vehicle.fuelPricePerLiter.toFixed(2)}/l)` : ''}`} />
              )}
            </View>

            {/* Segments */}
            {segments.map((seg) => (
              <View key={seg.id} style={st.segmentCard}>
                {seg.type === 'travel' ? (
                  <View style={st.segmentRow}>
                    <Ionicons name="car" size={16} color={C.blue} />
                    <Text style={st.segmentTitle}>Deslocamento</Text>
                    <Text style={st.segmentMeta}>
                      {(seg.distanceKm ?? 0).toFixed(1)} km  {formatDuration(seg.durationMinutes ?? 0)}
                    </Text>
                  </View>
                ) : (
                  <View>
                    <View style={st.segmentRow}>
                      <Ionicons name="location" size={16} color={C.primary} />
                      <Text style={st.segmentTitle}>
                        {seg.propertyName ?? seg.locationName ?? 'Local nao informado'}
                      </Text>
                    </View>
                    <Text style={st.segmentMeta}>
                      Permanencia: {formatDuration(seg.durationMinutes ?? 0)}
                      {seg.workHours ? `  |  ${seg.workHours}h trabalhadas` : ''}
                    </Text>
                    {seg.observations ? <Text style={st.segmentObs}>{seg.observations}</Text> : null}
                  </View>
                )}
              </View>
            ))}

            {/* Totals */}
            <View style={st.totalsCard}>
              <TotalRow icon="speedometer" label="Total KM" value={`${totKm.toFixed(1)} km`} />
              <TotalRow icon="car" label="Deslocamento" value={formatDuration(totTravelMin)} />
              <TotalRow icon="location" label="Permanencia" value={formatDuration(totStayMin)} />
              <TotalRow icon="time" label="Jornada total" value={formatDuration(totMin)} />
              <TotalRow icon="flag" label="Paradas" value={`${staySegs.length}`} />
              <TotalRow icon="flash" label="Vel. media" value={`${avgSpeed.toFixed(1)} km/h`} />
              {fuelEst != null && (
                <TotalRow icon="flame" label="Combustivel est." value={`R$ ${fuelEst.toFixed(2)}`} />
              )}
            </View>

            <View style={st.field}>
              <Text style={st.label}>KM odometro final (opcional)</Text>
              <TextInput style={st.input} value={kmOdometerEnd}
                onChangeText={(v) => { setKmOdometerEnd(v); if (v) store.setKmOdometerEnd(Number(v)) }}
                placeholder="Ex: 45312" keyboardType="numeric" placeholderTextColor={C.subtle} />
            </View>

            <TouchableOpacity style={[st.btnPrimary, busy && st.btnDisabled]}
              onPress={handleSaveJourney} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={st.btnPrimaryText}>Salvar Jornada</Text>
              )}
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

function TotalRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={st.totalRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={icon as any} size={16} color={C.muted} />
        <Text style={st.totalLabel}>{label}</Text>
      </View>
      <Text style={st.totalValue}>{value}</Text>
    </View>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.infoRow}>
      <Text style={st.infoLabel}>{label}</Text>
      <Text style={st.infoValue}>{value}</Text>
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

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20 },
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 4 },

  // Section
  sectionHeader: {
    marginTop: 8, marginBottom: 14,
    paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: C.subtle,
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  sectionToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, marginTop: 8,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  sectionToggleText: { fontSize: 14, fontWeight: '600', color: C.muted, flex: 1 },
  vehicleSection: { marginBottom: 8 },

  // Origin mode chips
  originModes: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  modeChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5, borderColor: C.border, backgroundColor: '#fff',
  },
  modeChipActive: { borderColor: C.primary, backgroundColor: C.primaryMuted },
  modeChipText: { fontSize: 13, color: C.muted, fontWeight: '500' },
  modeChipTextActive: { color: C.primaryDark },

  // Phase card
  phaseCard: {
    backgroundColor: C.blueMuted, borderRadius: 12, padding: 20,
    marginBottom: 20, alignItems: 'center', borderWidth: 1, borderColor: C.blue,
  },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phaseLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    color: C.blue, textTransform: 'uppercase',
  },
  phaseSeg: { fontSize: 11, color: C.subtle },
  phaseStarted: { fontSize: 13, color: C.muted, marginTop: 4 },
  objectiveBadge: {
    fontSize: 12, fontWeight: '600', color: C.blue,
    backgroundColor: '#fff', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4, marginTop: 8,
    overflow: 'hidden',
  },
  propertyOnSite: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 8 },
  travelInfo: { fontSize: 13, color: C.muted, marginTop: 4 },
  timer: {
    fontSize: 40, fontWeight: '700', color: C.blue,
    marginVertical: 8, fontVariant: ['tabular-nums'],
  },
  timerLabel: { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDate: { fontSize: 14, color: C.muted, marginTop: 4 },

  // Fields
  field: { marginBottom: 14 },
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
  row: { flexDirection: 'row', marginBottom: 14 },
  dropdown: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: C.border,
    borderRadius: 8, marginTop: 4, maxHeight: 280, overflow: 'hidden',
  },
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

  // Info card (summary)
  infoCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: C.border, marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4,
  },
  infoLabel: { fontSize: 13, color: C.muted },
  infoValue: { fontSize: 13, fontWeight: '600', color: C.text, flex: 1, textAlign: 'right' },

  // Partial summary
  partialSummary: {
    backgroundColor: '#fff', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: C.border, marginBottom: 16,
  },
  partialTitle: { fontSize: 10, fontWeight: '700', color: C.subtle, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  partialText: { fontSize: 13, color: C.muted, fontWeight: '500' },

  // Segment cards
  segmentCard: {
    backgroundColor: '#fff', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: C.border, marginBottom: 8,
  },
  segmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segmentTitle: { fontSize: 15, fontWeight: '600', color: C.text, flex: 1 },
  segmentMeta: { fontSize: 12, color: C.muted, marginTop: 4 },
  segmentObs: { fontSize: 12, color: C.subtle, marginTop: 4, fontStyle: 'italic' },

  // Totals
  totalsCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    borderWidth: 1.5, borderColor: C.primary, marginVertical: 16,
  },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6,
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
