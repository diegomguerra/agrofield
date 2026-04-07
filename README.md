# AgroField

Sistema de gestão agropecuária para a Inseminas / Inovação Agropecuária.

## Estrutura

```
agrofield/
├── apps/
│   ├── api/          # API REST — Node.js + Fastify + TypeScript
│   └── web/          # Painel web — Next.js (em breve)
├── packages/
│   └── shared/       # Tipos e utilitários compartilhados
└── docs/             # Documentação técnica
```

## Tech Stack

| Camada | Tecnologia |
|--------|-----------|
| API | Node.js + Fastify + TypeScript |
| Web | Next.js |
| Mobile | React Native (offline-first) |
| Banco | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth + JWT |

## Conceito central

Propriedades têm dois tipos:

- **`tipo = 'propria'`** (Faz. Raposo, Faz. Urubu): Fluxo completo com checkpoint digital, horas de trabalho e controle de insumos.
- **`tipo = 'cliente'`**: Fluxo simplificado de visita com serviços prestados e vendas.

## Desenvolvimento

```bash
# Instalar dependências
npm install

# Copiar e configurar variáveis de ambiente
cp apps/api/.env.example apps/api/.env

# Rodar a API em modo dev
cd apps/api && npm run dev
```

## Supabase

- Projeto: `agrofield`
- ID: `fuypijdvmranrmapstnb`
- Região: `sa-east-1` (São Paulo)
- 16 tabelas com RLS ativo
- 5 views analíticas
