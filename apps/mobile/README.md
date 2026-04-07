# AgroField Mobile

App React Native (Expo) com suporte offline-first para uso no campo.

## Tecnologias

- **Expo** + **Expo Router** — navegação baseada em arquivos
- **expo-sqlite** — banco local SQLite no dispositivo
- **Zustand** + **AsyncStorage** — auth persistida
- **Sync queue** — visitas criadas offline são enfileiradas e enviadas à API quando há conexão

## Setup

```bash
cd apps/mobile
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar EXPO_PUBLIC_API_URL com o endereço da API

# Rodar no Android
npm run android

# Rodar no iOS
npm run ios
```

## Arquitetura offline-first

```
Usuário cria visita no campo (sem internet)
         ↓
createVisitOffline()
         ↓
Salva em SQLite local + enfileira na sync_queue
         ↓
App detecta conexão disponível
         ↓
syncPendingItems() → POST /sync com lote de operações
         ↓
API processa e marca synced_at na fila
```

## Indicadores visuais

- 🟡 Ponto amarelo no card = visita pendente de sincronização
- Botão "Sincronizar (N)" mostra quantos itens aguardam

## Fluxo por tipo de propriedade

**Fazenda própria** (`tipo = 'propria'`):
- Checkpoints digitais
- Horas trabalhadas
- Insumos utilizados (produto, quantidade, unidade)

**Cliente** (`tipo = 'cliente'`):
- Serviços prestados (tipo, quantidade, valor)
- Vendas (produto, quantidade, valor)
