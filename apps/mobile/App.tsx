import { useEffect, useState } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { View, ActivityIndicator } from 'react-native'
import { initDb } from './src/lib/db'
import { useAuthStore } from './src/store/auth'
import LoginScreen from './src/screens/auth/LoginScreen'
import VisitsScreen from './src/screens/visits/VisitsScreen'
import NewVisitScreen from './src/screens/visits/NewVisitScreen'
import PropertiesScreen from './src/screens/properties/PropertiesScreen'
import NewPropertyScreen from './src/screens/properties/NewPropertyScreen'
import JourneyScreen from './src/screens/journey/JourneyScreen'
import { Ionicons } from '@expo/vector-icons'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

const COLORS = {
  primary: '#238821',
  bg: '#f8f7f4',
  text: '#28231d',
  subtle: '#9a907e',
  border: '#e5e2db',
}

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.subtle,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: COLORS.border,
          height: 60,
          paddingBottom: 8,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, string> = {
            Jornada: focused ? 'navigate' : 'navigate-outline',
            Visitas: focused ? 'calendar' : 'calendar-outline',
            Propriedades: focused ? 'map' : 'map-outline',
          }
          return <Ionicons name={icons[route.name] as any} size={size} color={color} />
        },
      })}
    >
      <Tab.Screen name="Jornada" component={JourneyScreen} />
      <Tab.Screen name="Visitas" component={VisitsScreen} />
      <Tab.Screen name="Propriedades" component={PropertiesScreen} />
    </Tab.Navigator>
  )
}

export default function App() {
  const [dbReady, setDbReady] = useState(false)
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    initDb().then(() => setDbReady(true))
  }, [])

  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    )
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!token ? (
            <Stack.Screen name="Login" component={LoginScreen} />
          ) : (
            <>
              <Stack.Screen name="Main" component={TabNavigator} />
              <Stack.Screen
                name="NewVisit"
                component={NewVisitScreen}
                options={{
                  headerShown: true,
                  headerTitle: 'Nova Visita',
                  headerTintColor: COLORS.primary,
                  headerStyle: { backgroundColor: '#fff' },
                  presentation: 'modal',
                }}
              />
              <Stack.Screen
                name="NewProperty"
                component={NewPropertyScreen}
                options={{
                  headerShown: true,
                  headerTitle: 'Nova Propriedade',
                  headerTintColor: COLORS.primary,
                  headerStyle: { backgroundColor: '#fff' },
                  presentation: 'modal',
                }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}

import { registerRootComponent } from 'expo'
registerRootComponent(App)
