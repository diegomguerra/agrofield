import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { createVisitOffline } from '../../hooks/useVisits'
import { useLocation } from '../../hooks/useLocation'
import { getDb } from '../../lib/db'

const C = {
  primary: '#238821',
  primaryDark: '#1d6c1c',
  primaryMuted: '#dcf5db',
  soil: '#ca5b21',
  soilMuted: '#faecda',
  bg: '#f8f7f4',
  border: '#e5e2db',
  text: '#28231d',
  muted: '#6e6457',
  subtle: '#9a907e',
}

interface Property { id: string; nome: string; tipo: string; cidade: string }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  )
}

export default function NewVisitScreen() {
  const nav = useNavigation()
  const { coords, loading: gpsLoading, error: gpsError, requestLocation } = useLocation()
  const [properties, setProperties] = useState<Property[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [selectedProp, setSelectedProp] = useState<Property | null>(null)
  const [showPropList, setShowPropList] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [kmStart, setKmStart] = useState('')
  const [kmEnd, setKmEnd] = useState('')
  const [observations, setObservations] = useState('')
  const [workHours, setWorkHours] = useState('')
  const [saving, setSaving] = useState(false)

  // Captura GPS ao abrir a tela
  useEffect(() => { requestLocation() }, [])

  const isPropria = selectedProp?.tipo === 'propria'
  const km = kmStart && kmEnd && Number(kmEnd) > Number(kmStart)
    ? Number(kmEnd) - Number(kmStart) : null

  useEffect(() => {
    getDb().getAllAsync<Property>(
      'SELECT id, nome, tipo, cidade FROM properties ORDER BY tipo DESC, nome ASC'
    ).then(setProperties)
  }, [])

  async function handleSave() {
    if (!propertyId) return Alert.alert('Atenção', 'Selecione uma propriedade.')
    setSaving(true)
    try {
      // Captura GPS fresco no momento do salvamento
      const gps = await requestLocation()

      await createVisitOffline({
        property_id: propertyId,
        property_tipo: selectedProp!.tipo as 'propria' | 'cliente',
        date,
        km_start: kmStart ? Number(kmStart) : undefined,
        km_end: kmEnd ? Number(kmEnd) : undefined,
        latitude: gps?.latitude ?? coords?.latitude,
        longitude: gps?.longitude ?? coords?.longitude,
        gps_accuracy: gps?.accuracy ?? coords?.accuracy,
        observations: observations || undefined,
        work_hours: workHours ? Number(workHours) : undefined,
      })
      Alert.alert('✓ Visita salva', 'Registrada localmente. Sincronize quando houver conexão.', [
        { text: 'OK', onPress: () => nav.goBack() }
      ])
    } catch (e: any) {
      Alert.alert('Erro', e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* Propriedade */}
        <SectionHeader title="Informações gerais" />

        <Field label="Propriedade *">
          <TouchableOpacity
            style={[styles.input, styles.selector]}
            onPress={() => setShowPropList(!showPropList)}
          >
            <Text style={selectedProp ? styles.inputText : styles.placeholder}>
              {selectedProp ? selectedProp.nome : 'Selecione…'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={C.subtle} />
          </TouchableOpacity>

          {showPropList && (
            <View style={styles.dropdown}>
              {/* Próprias */}
              {properties.filter(p => p.tipo === 'propria').length > 0 && (
                <Text style={styles.dropdownGroup}>FAZENDAS PRÓPRIAS</Text>
              )}
              {properties.filter(p => p.tipo === 'propria').map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.dropdownItem}
                  onPress={() => { setPropertyId(p.id); setSelectedProp(p); setShowPropList(false) }}
                >
                  <Text style={styles.dropdownText}>{p.nome}</Text>
                  {p.cidade ? <Text style={styles.dropdownSub}>{p.cidade}</Text> : null}
                </TouchableOpacity>
              ))}
              {/* Clientes */}
              {properties.filter(p => p.tipo === 'cliente').length > 0 && (
                <Text style={styles.dropdownGroup}>CLIENTES</Text>
              )}
              {properties.filter(p => p.tipo === 'cliente').map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.dropdownItem}
                  onPress={() => { setPropertyId(p.id); setSelectedProp(p); setShowPropList(false) }}
                >
                  <Text style={styles.dropdownText}>{p.nome}</Text>
                  {p.cidade ? <Text style={styles.dropdownSub}>{p.cidade}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Field>

        {selectedProp && (
          <View style={[styles.tipoBadge, isPropria ? styles.badgePropria : styles.badgeCliente]}>
            <Text style={[styles.tipoText, isPropria ? styles.tipoTextPropria : styles.tipoTextCliente]}>
              {isPropria ? '🏠 Fazenda Própria — checkpoints, insumos e horas' : '👤 Cliente — serviços e vendas'}
            </Text>
          </View>
        )}

        <Field label="Data *">
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="AAAA-MM-DD"
            keyboardType="numeric"
          />
        </Field>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="KM inicial">
              <TextInput
                style={styles.input}
                value={kmStart}
                onChangeText={setKmStart}
                placeholder="0"
                keyboardType="numeric"
              />
            </Field>
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Field label="KM final">
              <TextInput
                style={styles.input}
                value={kmEnd}
                onChangeText={setKmEnd}
                placeholder="0"
                keyboardType="numeric"
              />
            </Field>
          </View>
        </View>

        {km !== null && (
          <View style={styles.kmBadge}>
            <Text style={styles.kmBadgeText}>✓ {km.toLocaleString('pt-BR')} km nesta visita</Text>
          </View>
        )}

        {/* Indicador GPS */}
        <View style={styles.gpsRow}>
          <Ionicons
            name={coords ? 'location' : gpsError ? 'location-outline' : 'locate-outline'}
            size={18}
            color={coords ? C.primary : gpsError ? '#e74c3c' : C.subtle}
          />
          {gpsLoading ? (
            <ActivityIndicator size="small" color={C.primary} style={{ marginLeft: 8 }} />
          ) : (
            <Text style={[styles.gpsText, coords ? styles.gpsOk : gpsError ? styles.gpsErr : null]}>
              {coords
                ? `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}${coords.accuracy ? ` (~${Math.round(coords.accuracy)}m)` : ''}`
                : gpsError ?? 'Obtendo localização...'}
            </Text>
          )}
          {!gpsLoading && !coords && (
            <TouchableOpacity onPress={requestLocation} style={{ marginLeft: 8 }}>
              <Text style={{ color: C.primary, fontWeight: '600', fontSize: 13 }}>Tentar novamente</Text>
            </TouchableOpacity>
          )}
        </View>

        <Field label="Observações">
          <TextInput
            style={[styles.input, styles.textarea]}
            value={observations}
            onChangeText={setObservations}
            placeholder="Anotações sobre a visita…"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </Field>

        {/* Fazenda própria */}
        {isPropria && (
          <>
            <SectionHeader title="Fazenda Própria" />
            <Field label="Horas trabalhadas">
              <TextInput
                style={styles.input}
                value={workHours}
                onChangeText={setWorkHours}
                placeholder="ex: 8"
                keyboardType="numeric"
              />
            </Field>
          </>
        )}

        {/* Botão salvar */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving || !propertyId}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>💾 Salvar visita offline</Text>}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20 },
  sectionHeader: {
    marginTop: 8, marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: C.subtle,
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  field: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.border,
    borderRadius: 8, padding: 12, fontSize: 15, color: C.text, fontFamily: 'System',
  },
  inputText: { fontSize: 15, color: C.text },
  placeholder: { fontSize: 15, color: C.subtle },
  textarea: { minHeight: 80 },
  selector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdown: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: C.border,
    borderRadius: 8, marginTop: 4, maxHeight: 280, overflow: 'hidden',
  },
  dropdownGroup: {
    fontSize: 10, fontWeight: '700', color: C.subtle, letterSpacing: 0.5,
    padding: 10, paddingBottom: 4, backgroundColor: C.bg,
  },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  dropdownText: { fontSize: 15, color: C.text, fontWeight: '500' },
  dropdownSub: { fontSize: 12, color: C.subtle, marginTop: 2 },
  row: { flexDirection: 'row' },
  tipoBadge: { borderRadius: 8, padding: 10, marginBottom: 14 },
  badgePropria: { backgroundColor: C.primaryMuted },
  badgeCliente: { backgroundColor: C.soilMuted },
  tipoText: { fontSize: 13, fontWeight: '500' },
  tipoTextPropria: { color: C.primaryDark },
  tipoTextCliente: { color: '#a8451d' },
  kmBadge: { backgroundColor: C.primaryMuted, borderRadius: 6, padding: 8, marginBottom: 14 },
  kmBadgeText: { color: C.primaryDark, fontSize: 13, fontWeight: '600' },
  gpsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.border,
    borderRadius: 8, padding: 12, marginBottom: 14,
  },
  gpsText: { marginLeft: 8, fontSize: 13, color: C.subtle, flex: 1 },
  gpsOk: { color: C.primaryDark, fontWeight: '500' },
  gpsErr: { color: '#e74c3c' },
  saveBtn: {
    backgroundColor: C.primary, borderRadius: 10,
    padding: 16, alignItems: 'center', marginTop: 8,
  },
  saveBtnDisabled: { backgroundColor: '#c8c2b5' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
