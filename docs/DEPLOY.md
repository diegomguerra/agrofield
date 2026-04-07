# Deploy — AgroField API

## Railway (recomendado)

### 1. Criar projeto no Railway

1. Acesse [railway.app](https://railway.app) e faça login com GitHub
2. **New Project → Deploy from GitHub repo → diegomguerra/agrofield**
3. Railway detecta o `railway.toml` automaticamente

### 2. Variáveis de ambiente no Railway

No painel do serviço, vá em **Variables** e adicione:

```
SUPABASE_URL=https://fuypijdvmranrmapstnb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<sua service role key>
JWT_SECRET=<string aleatória segura — min 32 chars>
PORT=3001
LOG_LEVEL=info
CORS_ORIGIN=https://seu-dominio-web.vercel.app
```

> A **Service Role Key** está em: Supabase → Project Settings → API → `service_role`  
> O **JWT_SECRET** pode ser o mesmo JWT secret do Supabase (Project Settings → API → JWT Settings)

### 3. Deploy automático via GitHub Actions

1. No Railway: **Settings → Tokens → Create Token**
2. No GitHub: **Settings → Secrets → Actions → New secret**
   - Nome: `RAILWAY_TOKEN`
   - Valor: token copiado do Railway

A partir daí, todo push na `main` dispara build + deploy automaticamente.

### 4. Verificar deploy

```bash
curl https://sua-api.up.railway.app/health
# → { "status": "ok", "ts": "2024-..." }
```

---

## Painel Web (Vercel)

1. [vercel.com](https://vercel.com) → **New Project → Import diegomguerra/agrofield**
2. **Root Directory**: `apps/web`
3. **Variável de ambiente**:
   ```
   NEXT_PUBLIC_API_URL=https://sua-api.up.railway.app
   ```
4. Deploy → URL gerada automaticamente

---

## URLs finais esperadas

| Serviço | URL |
|---|---|
| API | `https://agrofield-api.up.railway.app` |
| Web | `https://agrofield.vercel.app` |
| Supabase | `https://fuypijdvmranrmapstnb.supabase.co` |
