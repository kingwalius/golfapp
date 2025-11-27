# Golf App ⛳️

Eine Offline-First Golf App für Scoring, Matchplay und Ligen mit Online-Funktionen.

## Projektstandort
Der Code befindet sich in:
`/Users/marioritter/.gemini/antigravity/scratch/golf_app`

## Starten der App

Da `npm` auf deinem System nicht global verfügbar war, habe ich eine **Conda-Umgebung** namens `golf-env` erstellt.

### 1. Backend Starten (Server)
Das Backend wird benötigt für Login, Sync und Online-Matchplay.

```bash
cd /Users/marioritter/.gemini/antigravity/scratch/golf_app
conda run -n golf-env node server/index.js
```
Der Server läuft auf `http://localhost:3000`.

### 2. Frontend Starten (App)
In einem **neuen Terminal**:

```bash
cd /Users/marioritter/.gemini/antigravity/scratch/golf_app
conda run -n golf-env npm run dev
```

Die App läuft dann unter `http://localhost:5173`.
