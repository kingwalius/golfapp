# Golf App ⛳️

Offline-first Golf-Scoring-PWA für Stroke Play, Matchplay, Skins und Ligen.
Läuft auf Vercel mit Turso (libSQL) als Datenbank.

## Stack

- **Frontend**: React 19 + Vite + TailwindCSS 4 + react-router-dom 7
- **Offline**: `vite-plugin-pwa` (Workbox) + IndexedDB via `idb`
- **Backend**: Express 5, deployed als Vercel Serverless Function (`api/index.js`)
- **DB**: Turso / libSQL (HTTP-Transport)
- **Auth**: JWT (`jsonwebtoken`) + bcrypt password hashing

## Lokale Entwicklung

```bash
# 1. Dependencies
npm install

# 2. .env aus .env.example anlegen und Werte eintragen
cp .env.example .env

# 3. Backend starten (Port 3000)
node server/index.js

# 4. In zweitem Terminal: Frontend (Port 5173, proxy zu :3000)
npm run dev
```

App läuft dann auf http://localhost:5173.

## Tests

```bash
npm test          # vitest
npm run lint      # eslint
npm run build     # production build (vite + workbox)
```

## Deployment (Vercel)

Push auf `main` triggert automatisch einen Production-Deploy.
Andere Branches kriegen Preview-Deploys.

### Erforderliche Environment Variables

| Variable | Pflicht | Wert |
|---|---|---|
| `TURSO_DATABASE_URL` | ja | `libsql://<dein-db>.turso.io` |
| `TURSO_AUTH_TOKEN` | ja | Turso Auth Token |
| `JWT_SECRET` | ja | Random 48+ bytes (`openssl rand -base64 48`) |
| `ADMIN_TOKEN` | optional | Random Token für Admin-Endpoints (init/fix-db/reset-password/nuke-db) |

Siehe [.env.example](.env.example) für die Vorlage.

## Architektur

```
api/index.js              # Vercel function entry, re-exports server/index.js
server/
  ├── index.js            # Express app + alle Routes
  └── db.js               # libSQL client + initDB schema
src/
  ├── App.jsx             # React-Router-Setup
  ├── lib/
  │   ├── db.js           # IndexedDB-Schema (idb)
  │   └── store.jsx       # UserContext, sync logic, authFetch
  ├── components/         # Generic UI (Layout, Toast, Modals)
  └── features/
      ├── auth/           # Welcome (login/register)
      ├── home/           # Dashboard + Activity feed
      ├── scoring/        # Solo round + scorecard
      ├── matchplay/      # 1v1 match
      ├── skins/          # Skins game
      ├── league/         # League dashboard, brackets, standings
      ├── courses/        # Course CRUD
      └── profile/        # User profile, friends
```

## Offline-Modell

- Alle Daten werden zuerst in IndexedDB gespeichert mit `synced: false`.
- Wenn online: `sync()` (in `src/lib/store.jsx`) lädt unsynced Records hoch
  und zieht den aktuellen Server-Stand zurück.
- Trigger für Auto-Sync: Reconnect-Event, Tab-Focus, alle 3 Minuten,
  beim App-Start.
- Service-Worker cached statische Assets + read-only API-Responses
  (NetworkFirst, 30 Tage). POST-Calls bleiben Network-only.

## Admin-Endpoints (ADMIN_TOKEN required)

Header: `x-admin-token: <token>`

- `POST /api/nuke-db` — alle Daten löschen
- `GET /api/init` — Schema explizit initialisieren
- `GET /api/fix-db` — Schema-Migrationen forcieren
- `POST /auth/reset-password` — `{username, newPassword}` für vergessene Passwörter
- `GET /api/debug-sql`, `/api/debug/users`, `/api/debug/matches` — Diagnose
