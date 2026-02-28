# ProSocratic

A privacy-first AI study companion. A Chrome extension observes how you study and surfaces a Socratic coaching overlay ("Ori"), a FastAPI backend drives LLM logic and stores session data in DynamoDB, and a React dashboard surfaces learning analytics — all connected through a shared TypeScript contract.

---

## Repository structure

```
hte_v1/
├── backend/              # FastAPI backend — LLM services, session logic, DynamoDB
├── extension-overlay/    # Chrome Extension (Manifest V3) — Ori overlay, behavioral sensing
├── frontend/             # React dashboard — analytics, weekly review, learner DNA
├── shared/               # Shared TypeScript types and API route constants
└── docs/                 # Monorepo integration guide
```

---

## How the three pieces fit together

```
Chrome Extension (extension-overlay)
  │  behavioral telemetry every 30 s (scroll, keystrokes, idle gaps)
  │  chat messages, micro-assessment answers
  │  POST /v1/session/*, /v1/questions/*, /v1/microassess/*
  ▼
FastAPI Backend (backend)
  │  policy engine → MiniMax LLM → DynamoDB
  │  returns: ori_state, technique suggestion, Socratic answer, score
  ▼
React Dashboard (frontend)
     GET /v1/dashboard/*, /v1/profiles/*
     reads the same backend; user identified by shared UUID in X-User-Id header
```

The `shared/` module is imported by both the extension and dashboard via the `@shared` Vite/TypeScript path alias and is the single source of truth for API route paths and TypeScript payload types.

---

## Tech stack

### Backend (`backend/`)

| Layer | Technology |
|-------|-----------|
| Framework | **FastAPI 0.115** + **Uvicorn** |
| Data validation | **Pydantic v2** + **pydantic-settings** |
| HTTP client | **httpx** (async, shared connection pool, exponential-backoff retries on 429/5xx) |
| LLM | **MiniMax API** (`MiniMax-M2.5-highspeed`) |
| Database | **AWS DynamoDB** via **boto3** — 3 tables: `ProsocraticUsers`, `ProsocraticSessions`, `ProsocraticAssessments` |
| Serverless adapter | **Mangum** — wraps FastAPI as an AWS Lambda handler |
| Testing | **pytest** + **pytest-asyncio**, 361 tests |
| Linting / formatting | **ruff**, **black** |

**How MiniMax is used:**

- `question_engine.py` — given a page context snippet and a student question, calls MiniMax to produce a direct Socratic answer + a follow-up question; also identifies adjacent concepts not yet covered and generates probe questions for them
- `assessment_scorer.py` — rubric-based scoring of free-text answers; raw answer text is passed to MiniMax for scoring then discarded and never stored
- `socratic_engine.py` — grounded Socratic question generation from page headings and text snippets
- `technique_scorer.py` — composite scoring across 9 learning techniques (Pomodoro, Feynman, Active Recall, Spaced Repetition, Strategic Rest, etc.)
- `policy_engine.py` — pure-Python decision tree mapping cognitive state → intervention suggestion (~0 ms, no LLM call)

**Privacy invariants enforced at startup (server raises `ValueError` if violated):**
- `STORE_RAW_ANSWERS=false` — answers are scored then discarded
- `STORE_PAGE_CONTEXT=false` — page content is used only inside LLM prompts, never persisted
- `PrivacyFilter` strips sensitive fields from all log records before output

### Chrome Extension (`extension-overlay/`)

| Layer | Technology |
|-------|-----------|
| Build | **Vite 6** + **CRXJS Vite plugin** (Manifest V3, hot reload in dev) |
| UI | **React 18** + **TypeScript** |
| Styling | **Tailwind CSS v3** |
| Animations | **Framer Motion** (spring physics — stiffness 400, damping 30) |
| State | **Zustand v5** |
| Local storage | **Dexie.js v4** (IndexedDB — learner profile, session cache) |
| Mascot animations | **lottie-react** |
| Style isolation | **Shadow DOM** — overlay never touches host-page styles |

**Architecture:**
- `background/index.ts` — Service Worker: routes Chrome messages between content script and backend, batches and sends telemetry
- `content/index.tsx` — injected into every tab; mounts the overlay inside a Shadow DOM root, extracts page context
- `overlay/store/overlayStore.ts` — Zustand store; all data flow is gated behind a `sessionActive` boolean (no backend traffic until the user clicks "Start Studying")
- `overlay/hooks/useBehavioralSensors.ts` — detects scroll velocity, keystroke rate, and idle gaps; emits a `TELEMETRY_WINDOW` message every 30 s

### Frontend Dashboard (`frontend/`)

| Layer | Technology |
|-------|-----------|
| Build | **Vite 6** + **@vitejs/plugin-react-swc** |
| UI | **React 18** + **TypeScript** |
| Routing | **React Router v6** |
| Styling | **Tailwind CSS v3** |
| Charts | **Recharts v2** (focus rhythm line chart, calendar heatmap, topic grid) |
| Animations | **Framer Motion** |
| HTTP | **Axios** |

**Pages:** Dashboard · Session Detail · Topic Detail · Techniques · Weekly Review · Learner DNA · Onboarding

### Shared module (`shared/`)

| File | Purpose |
|------|---------|
| `apiConfig.ts` | `DEFAULT_API_BASE_URL`, `USER_ID_HEADER`, `API` object with every backend route path |
| `apiTypes.ts` | TypeScript interfaces for every request/response payload, matching the backend Pydantic models |

---

## Local setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- An AWS account with credentials configured (`aws configure`) — DynamoDB is used even locally
- A [MiniMax API key](https://www.minimax.io)
- Chrome (to load the extension)

---

### 1. Backend

```bash
cd backend

# Install Python dependencies (editable install, includes dev tools)
pip install -e ".[dev]"

# Copy and fill in the environment file
cp .env.example .env
```

Open `.env` and set at minimum:

```
MINIMAX_API_KEY=your-key-here
AWS_ACCESS_KEY_ID=...        # or use: aws configure
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=me-central-1      # or your preferred region
```

```bash
# Create the three DynamoDB tables (run once; idempotent)
make tables

# Start the dev server
make run
# → http://localhost:8000
# → http://localhost:8000/docs   Swagger UI
# → http://localhost:8000/redoc  ReDoc
```

Other useful `make` targets:

```bash
make test        # run full pytest suite with coverage
make test-fast   # stop on first failure
make lint        # ruff check
make format      # black + ruff --fix
make smoke       # end-to-end smoke test against localhost:8000
```

---

### 2. Chrome Extension

```bash
cd extension-overlay

npm install

cp .env.example .env
# Set VITE_BACKEND_URL=http://localhost:8000
```

**Development (hot reload):**

```bash
npm run dev
```

**Load into Chrome:**

```bash
npm run build
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension-overlay/dist/` folder
4. The ProSocratic icon will appear in your toolbar

---

### 3. Frontend Dashboard

```bash
cd frontend

npm install

npm run dev
# → http://localhost:5173
```

The dashboard reads the same `X-User-Id` UUID that the extension writes to `localStorage['prosocratic_user_id']`. If the extension is not installed, the dashboard generates its own UUID on first load.

---

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Readiness check |
| POST | `/v1/session/start` | Start a study session |
| POST | `/v1/session/update` | Send behavioral state snapshot, receive `ori_state` + suggestion |
| POST | `/v1/session/end` | Close session and persist summary |
| GET | `/v1/dashboard/summary` | Aggregated learning analytics |
| GET | `/v1/dashboard/sessions` | Session list |
| GET | `/v1/dashboard/session/{id}` | Single session detail |
| POST | `/v1/questions/answer` | Socratic answer + follow-up question |
| POST | `/v1/unasked-question` | Adjacent-concept probe question |
| POST | `/v1/techniques/select` | Technique recommendation from behavioral signals |
| POST | `/v1/microassess/generate` | Generate recall/application probe questions |
| POST | `/v1/microassess/submit` | Score a free-text answer (raw text discarded after scoring) |
| GET/PUT/DELETE | `/v1/profiles/{user_id}` | Learner profile CRUD |
| GET | `/v1/profiles/{user_id}/export` | Full data export |

Full API contract: [`backend/docs/API_CONTRACT.md`](backend/docs/API_CONTRACT.md)
Postman collection: [`backend/docs/postman_collection.json`](backend/docs/postman_collection.json)
Frontend integration notes: [`backend/docs/FRONTEND_INTEGRATION.md`](backend/docs/FRONTEND_INTEGRATION.md)
Monorepo wiring: [`docs/INTEGRATION.md`](docs/INTEGRATION.md)

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `MINIMAX_API_KEY` | — | MiniMax API key (required) |
| `MINIMAX_MODEL` | `MiniMax-M2.5` | Model ID |
| `MINIMAX_TEMPERATURE` | `0.4` | Generation temperature |
| `MINIMAX_MAX_TOKENS` | `1024` | Max tokens per completion |
| `MINIMAX_TIMEOUT_SECONDS` | `20` | Request timeout |
| `AWS_REGION` | `me-central-1` | DynamoDB region |
| `AWS_ACCESS_KEY_ID` | — | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | — | AWS credentials |
| `TABLE_USERS` | `ProsocraticUsers` | DynamoDB table name |
| `TABLE_SESSIONS` | `ProsocraticSessions` | DynamoDB table name |
| `TABLE_ASSESSMENTS` | `ProsocraticAssessments` | DynamoDB table name |
| `STORE_RAW_ANSWERS` | `false` | Must stay `false` — server raises on startup if `true` |
| `STORE_PAGE_CONTEXT` | `false` | Must stay `false` — server raises on startup if `true` |
| `DASHBOARD_ORIGIN` | `http://localhost:3000` | CORS allowed origin for the dashboard |
| `EXTENSION_DEV_MODE` | `true` | Allows any `chrome-extension://` origin in dev |
| `LOG_LEVEL` | `info` | Logging level |

### Extension (`extension-overlay/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_BACKEND_URL` | `http://localhost:8000` | Backend base URL |

### Dashboard (`frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend base URL |

---

## User identity

A single anonymous UUID (v4) identifies the learner across all three surfaces:

- **Extension** — generated via `crypto.randomUUID()`, persisted in `chrome.storage.local` under `prosocratic_user_id`, and mirrored to `localStorage` so the dashboard can read it
- **Dashboard** — reads from `localStorage`; generates its own UUID on first load if the extension is absent
- **Backend** — validates the UUID from the `X-User-Id` request header on every authenticated endpoint

No name, email, or personally identifiable information is required or stored anywhere.
