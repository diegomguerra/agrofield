import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, TextInput, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { Alert } from 'react-native'
import { getDb, uuid } from '../../lib/db'
import { syncProperties, enqueue } from '../../lib/sync'
import { useAuthStore } from '../../store/auth'

const C = {
  primary: '#238821', primaryDark: '#1d6c1c', primaryMuted: '#dcf5db',
  soil: '#ca5b21', soilMuted: '#faecda',
  bg: '#f8f7f4', border: '#e5e2db', text: '#28231d', muted: '#6e6457', subtle: '#9a907e',
}

interface Property {
  id: string; name: string; tipo: string; city: string; area_hectares: number | null
}

export default function PropertiesScreen() {
  const navigation = useNavigation<any>()
  const logout = useAuthStore((s) => s.logout)
  const userName = useAuthStore((s) => s.user?.name)
  const [properties, setProperties] = useState<Property[]>([])
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    const data = await getDb().getAllAsync<Property>(
      'SELECT * FROM properties ORDER BY tipo DESC, name ASC'
    )
    setProperties(data)
  }

  async function handleRefresh() {
    setRefreshing(true)
    await syncProperties()
    await load()
    setRefreshing(false)
  }

  function handleDelete(item: Property) {
    Alert.alert(
      'Excluir propriedade',
      `Deseja excluir "${item.name}"? Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive',
          onPress: async () => {
            try {
              await getDb().runAsync('DELETE FROM properties WHERE id = ?', [item.id])
              await enqueue('properties', 'DELETE', { id: item.id }, uuid())
              await load()
            } catch (e: any) {
              Alert.alert('Erro', e?.message ?? String(e))
            }
          },
        },
      ]
    )
  }

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', load)
    load()
    return unsubscribe
  }, [navigation])

  const filtered = properties.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.city ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const proprias = filtered.filter(p => p.tipo === 'propria')
  const clientes = filtered.filter(p => p.tipo === 'cliente')

  function PropertyCard({ item }: { item: Property }) {
    const isPropria = item.tipo === 'propria'
    return (
      <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: isPropria ? C.primary : C.soil }]}>
        <View style={styles.cardRow}>
          <Text style={styles.cardName}>{item.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={[styles.badge, isPropria ? styles.badgePropria : styles.badgeCliente]}>
              <Text style={[styles.badgeText, isPropria ? styles.badgeTextPropria : styles.badgeTextCliente]}>
                {isPropria ? 'PRÓPRIA' : 'CLIENTE'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate('EditProperty', { propertyId: item.id })}
            >
              <Ionicons name="pencil" size={15} color={C.muted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleDelete(item)}
            >
              <Ionicons name="trash-outline" size={15} color="#dc2626" />
            </TouchableOpacity>
          </View>
        </View>
        {item.city ? <Text style={styles.cardSub}>{item.city}</Text> : null}
        {item.area_hectares ? (
          <Text style={styles.cardArea}>{item.area_hectares.toLocaleString('pt-BR')} ha</Text>
        ) : null}
        {isPropria && (
          <Text style={styles.cardFeatures}>✓ Checkpoint digital · Insumos · Horas</Text>
        )}
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Propriedades</Text>
          <Text style={styles.subtitle}>{proprias.length} proprias / {clientes.length} clientes</Text>
        </View>
        <TouchableOpacity
          onPress={() =>
            Alert.alert('Sair', `Deseja sair${userName ? ` (${userName})` : ''}?`, [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Sair', style: 'destructive', onPress: logout },
            ])
          }
          style={{ padding: 8 }}
        >
          <Ionicons name="log-out-outline" size={22} color={C.subtle} />
        </TouchableOpacity>
      </View>

      {/* Busca */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por nome ou cidade…"
          placeholderTextColor={C.subtle}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Nenhuma propriedade. Toque no + para criar.</Text>
        }
        renderItem={({ item }) => <PropertyCard item={item} />}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('NewProperty')}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.border },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 13, color: C.subtle, marginTop: 2 },
  searchWrap: { padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.border },
  search: {
    backgroundColor: C.bg, borderRadius: 8, padding: 10,
    fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.border,
  },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: C.border,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardName: { fontSize: 16, fontWeight: '600', color: C.text, flex: 1, marginRight: 8 },
  cardSub: { fontSize: 13, color: C.subtle, marginBottom: 4 },
  cardArea: { fontSize: 12, color: C.muted, marginTop: 4 },
  cardFeatures: { fontSize: 11, color: C.primary, marginTop: 6, fontWeight: '500' },
  badge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  badgePropria: { backgroundColor: C.primaryMuted },
  badgeCliente: { backgroundColor: C.soilMuted },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  badgeTextPropria: { color: C.primaryDark },
  badgeTextCliente: { color: '#a8451d' },
  empty: { textAlign: 'center', color: C.subtle, marginTop: 40, fontSize: 14 },
  actionBtn: { padding: 6, borderRadius: 6 },
  fab: {
    position: 'absolute', bottom: 28, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 },
})
