# Brief: LoL SoloQ Leaderboard — MVP

Proyecto personal: una web tipo ranking de SoloQ entre un grupo de amigos, con look inspirado en los leaderboards de "LAS Streamers".

---

## 🎯 Alcance del MVP

- Fetch a la Riot API, ordenamiento por tier/rank/LP, render de tabla.
- **Sin base de datos, sin cron, sin histórico.**
- Lista de amigos hardcodeada en un archivo de config.
- Cache nativo de Next.js (5 min) para no quemar rate limit.
- Deploy local primero, Vercel opcional después.

### Fuera de scope (fases posteriores)
- DB / persistencia
- Delta de posición (`+2 / -1 / -3`)
- Badge "En Vivo" (Spectator API)
- Champion icon / rol / maestría
- Cron automático
- Gráficos de evolución de LP

---

## 🧰 Stack

| Capa | Elección |
|------|----------|
| Framework | **Next.js 15** (App Router) |
| Lenguaje | **TypeScript** |
| Estilos | **Tailwind CSS** + **shadcn/ui** |
| Cache | `fetch` nativo de Next con `revalidate: 300` |
| DB | — (no aplica al MVP) |
| Deploy | Vercel (opcional, fase posterior) |

### Requisitos de entorno
- Node.js **18+** (idealmente 20)
- npm / pnpm
- Editor: VS Code recomendado

---

## 👥 Jugadores (servidor LAS)

```
sbaa#7510
Onore#LAS
Grandpa Corki#LAS
LKS#AKD
Любовь#8652
ChoiWee#LAS
```

> Nota técnica: `Любовь` (cirílico) y `Grandpa Corki` (con espacio) se manejan automáticamente con `encodeURIComponent()` al armar las URLs.

**Decisión de UI:** se muestra solo el Riot ID, sin columna separada de apodo.

---

## 🔌 Endpoints de la Riot API

### 1. ACCOUNT-V1 — obtener `puuid`
- **Host:** `americas.api.riotgames.com`
- **Endpoint:** `GET /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}`
- **Devuelve:** `{ puuid, gameName, tagLine }`

### 2. LEAGUE-V4 — obtener entries de ranked
- **Host:** `la1.api.riotgames.com` (LAS)
- **Endpoint:** `GET /lol/league/v4/entries/by-puuid/{encryptedPUUID}`
- **Devuelve:** array de `LeagueEntryDTO`. Filtrar la que tenga `queueType: "RANKED_SOLO_5x5"`.
- **Campos relevantes:** `tier`, `rank`, `leaguePoints`, `wins`, `losses`

### Header de autenticación (en ambas)
```
X-Riot-Token: <RIOT_API_KEY>
```

---

## 🔄 Flujo por jugador

```
Riot ID (gameName#tagLine)
   ↓ ACCOUNT-V1 (americas)
puuid
   ↓ LEAGUE-V4 (la1)
{ tier, rank, leaguePoints, wins, losses }
```

Se ejecuta en paralelo para los 6 jugadores con `Promise.allSettled` (para que si uno falla los demás se rendericen igual).

---

## 📊 Lógica de ordenamiento

**Prioridad:** Tier → Rank (división) → LP

**Orden de tiers (mayor a menor):**
```
CHALLENGER > GRANDMASTER > MASTER >
DIAMOND > EMERALD > PLATINUM > GOLD >
SILVER > BRONZE > IRON
```

**Orden de divisiones dentro del tier:** `I > II > III > IV`
(MASTER, GRANDMASTER y CHALLENGER solo tienen una división — se comparan directamente por LP).

**Truco:** mapear cada combinación a un score numérico y ordenar por ese score:
```
score = tierWeight * 10000 + (5 - divisionWeight) * 1000 + LP
```

**Unranked:** jugadores sin entry de `RANKED_SOLO_5x5` van al fondo como "Unranked".

---

## 📁 Estructura del proyecto

```
lol-leaderboard/
├── app/
│   ├── page.tsx              # server component, hace el fetch y renderiza
│   ├── layout.tsx
│   └── globals.css
├── components/
│   └── leaderboard-table.tsx # presentacional, recibe data ya ordenada
├── lib/
│   ├── riot.ts               # cliente de Riot API
│   ├── ranking.ts            # compareRank() y helpers
│   └── types.ts              # Player, RankedInfo, Tier, etc.
├── config/
│   └── friends.ts            # lista hardcoded de jugadores
├── .env.local                # RIOT_API_KEY
└── package.json
```

---

## 🔐 Variables de entorno

`.env.local`:
```
RIOT_API_KEY=RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

> ⚠️ La development key expira cada 24h. Cuando se venza, regenerar en developer.riotgames.com y reemplazar el valor.

---

## 🖼 Columnas que muestra la tabla (MVP)

| # | Riot ID | Tier | División | LP | W / L | Winrate |
|---|---------|------|----------|----|----|---------|

- **Winrate**: `wins / (wins + losses) * 100`, redondeado a 2 decimales.
- Estilos sugeridos:
  - Winrate ≥ 50% en verde, < 50% en rojo (como la imagen de referencia).
  - Badge de tier con color asociado (Master/GM/Challenger en violeta/rojo, etc.).

---

## 📝 Primer mensaje sugerido para el code phase

> "Vamos a armar el proyecto LoL Leaderboard según este brief. Empezamos creando el proyecto Next.js, configurando Tailwind y shadcn, y armando los tipos en `lib/types.ts`."

Pegá este markdown completo al comienzo de la conversación de code y arrancamos desde ahí.
