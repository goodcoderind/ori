# ProSocratic Overlay — Setup & Architecture

## Quick Start

```bash
cd prosocratic-overlay
npm install
cp .env.example .env

# Dev mode (hot reload)
npm run dev

# Build for Chrome extension
npm run build
# Then load dist/ as unpacked extension in chrome://extensions
```

## Project Structure

```
prosocratic-overlay/
├── manifest.json                 ← Chrome Extension Manifest V3
├── vite.config.ts                ← Vite + CRXJS plugin
├── index.html                    ← Dev mode host page
├── src/
│   ├── background/
│   │   └── index.ts              ← Service worker: message routing, signal batching
│   ├── content/
│   │   └── index.tsx             ← Injected into every tab: Shadow DOM mount + page context
│   ├── overlay/
│   │   ├── App.tsx               ← Root overlay component (fixed bottom-right)
│   │   ├── components/
│   │   │   ├── OriAvatar.tsx     ← Floating pill with animated Ori states
│   │   │   ├── ChatPanel.tsx     ← Expanded panel container
│   │   │   ├── PanelHeader.tsx   ← Status dot + close button
│   │   │   ├── MessageList.tsx   ← Chat history with auto-scroll
│   │   │   ├── NudgeCard.tsx     ← Technique suggestion card (opt-in)
│   │   │   ├── TransparencyCard.tsx ← "Why did Ori wake up?" expandable
│   │   │   ├── InputBar.tsx      ← Message input with animated send
│   │   │   └── StatusPill.tsx    ← Mini floating status (panel closed)
│   │   ├── store/
│   │   │   └── overlayStore.ts   ← Zustand: all state + actions
│   │   ├── hooks/
│   │   │   ├── useBehavioralSensor.ts  ← Scroll, keystroke, idle detection
│   │   │   └── useOriState.ts    ← Chrome message listener + demo mode
│   │   └── overlay.css           ← Tailwind + custom animations
│   └── shared/
│       ├── types.ts              ← All TypeScript types
│       └── db.ts                 ← Dexie.js IndexedDB (learner profile)
└── public/
    └── lottie/                   ← Drop Ori Lottie JSONs here
```

## Integration Points

### With Harmanjot's Backend
- **Chat API**: `POST /api/chat` — sends message + session + page context, gets Ori response
- **Signals API**: `POST /api/signals` — sends behavioral signal batch, gets cognitive state + nudge
- Set `VITE_BACKEND_URL` in `.env`

### With Abhra's Dashboard
- Writes to `chrome.storage.local` key: `prosocratic_sessions` (array of SessionData)
- Writes to `chrome.storage.local` key: `prosocratic_current_session` (live session)
- Dashboard reads these on load — no direct API dependency

## Key Design Decisions

1. **Shadow DOM** — Complete style isolation from host pages
2. **Spring physics** — All animations use Framer Motion springs (stiffness: 400, damping: 30)
3. **Amber (#F59E0B) only accent** — Used only when Ori is active
4. **pointer-events: none** wrapper — Overlay never blocks the host page
5. **Fallback responses** — Chat works offline for dev (remove before ship)
6. **3-dismiss limit** — Ori sleeps for session after 3 consecutive dismissals
7. **Demo nudge** — Auto-triggers after 15s in dev mode (remove before ship)

## Replacing SVG Placeholders with Lottie

1. Create Lottie JSONs for each Ori state
2. Place in `public/lottie/`
3. In `OriAvatar.tsx`, import `Lottie` from `lottie-react`
4. Replace `<OriIcon>` SVGs with `<Lottie animationData={...} />`
