import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { getDb, uuid } from '../../lib/db'
import { enqueue } from '../../lib/sync'
import { useAuthStore } from '../../store/auth'

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

type Tipo = 'propria' | 'cliente'
type RouteParams = { propertyId: string }

export default function EditPropertyScreen() {
  const nav = useNavigation<any>()
  const route = useRoute<RouteProp<{ params: RouteParams }, 'params'>>()
  const user = useAuthStore((s) => s.user)
  const { propertyId } = route.params

  const [name, setName] = useState('')
  const [tipo, setTipo] = useState<Tipo>('propria')
  const [city, setCity] = useState('')
  const [area, setArea] = useState('')
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const row = await getDb().getFirstAsync<{
        name: string; tipo: string; city: string | null
        area_hectares: number | null; latitude: number | null; longitude: number | null
      }>('SELECT name, tipo, city, area_hectares, latitude, longitude FROM properties WHERE id = ?', [propertyId])
      if (row) {
        setName(row.name)
        setTipo(row.tipo as Tipo)
        setCity(row.city ?? '')
        setArea(row.area_hectares != null ? String(row.area_hectares) : '')
        if (row.latitude != null && row.longitude != null) {
          setCoords({ latitude: row.latitude, longitude: row.longitude })
        }
      }
      setLoading(false)
    }
    load()
  }, [propertyId])

  async function captureLocation() {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permissão negada', 'Não foi possível acessar o GPS.')
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
    } catch (e: any) {
      Alert.alert('Erro no GPS', e?.message ?? String(e))
    } finally {
      setLocating(false)
    }
  }

  async function handleSave() {
    if (!name.trim()) return Alert.alert('Atenção', 'Nome da propriedade é obrigatório.')
    if (!user) return Alert.alert('Erro', 'Usuário não autenticado.')

    setSaving(true)
    try {
      const areaNum = area ? Number(area.replace(',', '.')) : null
      await getDb().runAsync(
        `UPDATE properties
           SET name = ?, tipo = ?, city = ?, area_hectares = ?, latitude = ?, longitude = ?, synced_at = NULL
         WHERE id = ?`,
        [name.trim(), tipo, city.trim() || null, areaNum, coords?.latitude ?? null, coords?.longitude ?? null, propertyId]
      )
      await enqueue('properties', 'UPDATE', {
        id: propertyId,
        name: name.trim(),
        tipo,
        city: city.trim() || null,
        area_hectares: areaNum,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        tenant_id: user.tenant_id,
      }, uuid())
      Alert.alert('✓ Propriedade atualizada', 'Salva localmente. Sincronize quando houver conexão.', [
        { text: 'OK', onPress: () => nav.goBack() },
      ])
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.primary} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Informações</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Nome *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="ex: Fazenda Santa Rita"
            placeholderTextColor={C.subtle}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Tipo *</Text>
          <View style={styles.tipoRow}>
            <TouchableOpacity
              style={[styles.tipoBtn, tipo === 'propria' && styles.tipoBtnActivePropria]}
              onPress={() => setTipo('propria')}
            >
              <Ionicons name="home" size={16} color={tipo === 'propria' ? C.primaryDark : C.subtle} />
              <Text style={[styles.tipoBtnText, tipo === 'propria' && { color: C.primaryDark }]}>
                Própria
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tipoBtn, tipo === 'cliente' && styles.tipoBtnActiveCliente]}
              onPress={() => setTipo('cliente')}
            >
              <Ionicons name="person" size={16} color={tipo === 'cliente' ? '#a8451d' : C.subtle} />
              <Text style={[styles.tipoBtnText, tipo === 'cliente' && { color: '#a8451d' }]}>
                Cliente
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Cidade</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="ex: Lagoa da Prata"
            placeholderTextColor={C.subtle}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Área (hectares)</Text>
          <TextInput
            style={styles.input}
            value={area}
            onChangeText={setArea}
            placeholder="ex: 250"
            keyboardType="decimal-pad"
            placeholderTextColor={C.subtle}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Localização</Text>
        </View>

        <TouchableOpacity
          style={[styles.captureBtn, coords && styles.captureBtnDone]}
          onPress={captureLocation}
          disabled={locating}
        >
          {locating ? (
            <ActivityIndicator color={C.primary} />
          ) : (
            <>
              <Ionicons
                name={coords ? 'checkmark-circle' : 'location'}
                size={18}
                color={coords ? C.primaryDark : C.primary}
              />
              <Text style={[styles.captureBtnText, coords && { color: C.primaryDark }]}>
                {coords ? 'GPS capturado' : 'Capturar GPS atual'}
              </Text>
            </>
          )}
        </TouchableOpacity>
        {coords && (
          <Text style={styles.coordsText}>
            📍 {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>✓ Salvar alterações</Text>
          )}
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
    marginTop: 8, marginBottom: 16, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: C.subtle,
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  field: { marginBottom: 14 },
  label: {
    fontSize: 12, fontWeight: '600', color: C.muted,
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3,
  },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.border,
    borderRadius: 8, padding: 12, fontSize: 15, color: C.text,
  },
  tipoRow: { flexDirection: 'row', gap: 10 },
  tipoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.border,
    borderRadius: 8, padding: 12,
  },
  tipoBtnActivePropria: { backgroundColor: C.primaryMuted, borderColor: C.primary },
  tipoBtnActiveCliente: { backgroundColor: C.soilMuted, borderColor: C.soil },
  tipoBtnText: { fontSize: 14, fontWeight: '600', color: C.muted },
  captureBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.border,
    borderRadius: 8, padding: 12, marginBottom: 10,
  },
  captureBtnDone: { backgroundColor: C.primaryMuted, borderColor: C.primary },
  captureBtnText: { color: C.primary, fontWeight: '600', fontSize: 13 },
  coordsText: { fontSize: 12, color: C.muted, marginBottom: 10, textAlign: 'center' },
  saveBtn: {
    backgroundColor: C.primary, borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: 16,
  },
  saveBtnDisabled: { backgroundColor: '#c8c2b5' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
