# TUMI

Monorepo para verificar afirmaciones electorales. Angular 22 habla con una API NestJS 12. LangGraph corre dentro de esa API. El veredicto lo clasifica la Decisions API de OpenAI (`gpt-6-luna`, el análogo de Jev). El modelo generativo solo redacta la explicación.

Sin `OPENAI_API_KEY` el stack arranca igual. La consulta queda en modo demostración, con veredicto `no_verificable` y sin probabilidades inventadas. Los candidatos salen de la base `goberlab` de tumi2 (rama qas), esquema `tumi`.

## Piezas

- `apps/web` — chat, fuentes, candidatos e historial
- `apps/api` — grafo de cinco agentes, SSE y Decisions API
- `apps/worker` — cola BullMQ. No escribe el padrón.
- `packages/contracts` — tipos compartidos y umbral del veredicto
- `packages/database` — cliente Prisma sobre el esquema `tumi`

Infraestructura del Compose: Redis 8 y Qdrant 1.20.0. Postgres no va en el Compose: `DATABASE_URL` apunta a la base de QAS.

## Local, con hot reload

Hace falta Docker y Node 22.22 o superior. La imagen de producción usa Node 24.22.

```bash
docker network create dokploy-network
copy .env.example .env
docker compose up redis qdrant -d
pnpm install
pnpm dev
```

La web queda en `http://localhost:4200` y proxyea `/api` hacia el puerto 3000.

## Stack completo

```bash
docker network create dokploy-network
docker compose up --build
```

Abre `http://localhost:8080`. El API no se publica: nginx en `web` proxea `/api` y deja pasar el streaming.

## Dokploy

1. Crea un servicio Compose y apunta el Compose Path a `./docker-compose.yml`.
2. Pega las variables de `.env.example` en Environment. `DATABASE_URL` es la misma de tumi2 en qas. También van `OPENAI_API_KEY`, `TAVILY_API_KEY` y, si aplica, `JNE_API_BASE_URL`.
3. En Domains, publica solo el servicio `web` en el puerto 80.
4. No definas `container_name`. Dokploy ya tiene la red `dokploy-network`.

## Variables

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Postgres `goberlab` de tumi2, esquema `tumi` |
| `OPENAI_API_KEY` | Decisions, extracción, explicación y embeddings |
| `OPENAI_DECISION_MODEL` | Por defecto `gpt-6-luna` |
| `OPENAI_MODEL` / `OPENAI_MODEL_MINI` | Explicación y extracción |
| `DECISION_MIN_CONFIDENCE` | Bajo 0.55 el choice pasa a `no_verificable` |
| `TAVILY_API_KEY` | Búsqueda web. Si falta, se omite |
| `JNE_API_BASE_URL` | Adaptador HTTP opcional. Si falta, se usa Postgres |
| `AUTH_ENABLED` | `false` deja el acceso ciudadano abierto |
