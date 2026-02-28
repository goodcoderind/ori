# Ori

> **It's not about what you learn. It's about how you learn.**

Five undergrads flew from the UAE to Hong Kong to build this. We felt this problem ourselves. We knew we had something real.

---

## The Problem

You've been there. It's 2am. You've read the same page four times. You've highlighted half the textbook. You asked ChatGPT, got an answer, nodded, moved on, and still blanked on exam day.

This isn't a laziness problem. It's a design problem.

Every study tool ever built operates on the same broken assumption: the student knows what they need to ask. They arrive with a question, the tool answers it, transaction complete. But the most important gaps in understanding are never the things students ask about. They're the things students don't even know to ask. The prerequisite they skipped three chapters ago. The edge case that shows up on every exam and never appears in their notes.

No existing tool goes looking for those gaps. **Ori does.**

There's a second failure too: every tool treats every student identically. The visual thinker gets walls of text. The student three minutes from a genuine insight gets interrupted with an explanation they didn't need. Learning tools aren't personalised. They're just fast.

---

## The Solution

**Ori** is a browser extension paired with a personal analytics dashboard that understands *how* you study, not just *what*.

At the heart of it is a small companion that lives quietly in the corner of whatever you're reading: Wikipedia, YouTube, PDFs, anything. Ori's default state is asleep. He doesn't blink at you, doesn't interrupt, doesn't demand attention. He wakes up only when he has something genuinely worth saying, because a tool that knows when to stay quiet is just as powerful as one that speaks.

Behind Ori, the system does something no other tool does: it reads the signals already present in *how* you interact with a page. Scroll speed. Section revisits. Typing rhythm. Pause duration. From these behavioural proxies — no camera, no microphone, no biometrics, ever — Ori classifies your cognitive state in real time and surfaces the right intervention at the right moment.

When confusion is detected, Ori wakes and suggests the Feynman Technique. When you've been stuck in text for four minutes, he offers a diagram instead. When you're in flow, he stays asleep and lets you cook.

Over time, Ori builds a living portrait of you as a learner: which techniques work for you, which subjects drain you, what you've genuinely understood versus what you've only memorised. This portrait lives in your personal dashboard, updating after every session.

The goal isn't to need Ori forever. It's to become the kind of learner who doesn't.

---

## Who It's For

- **Students** who work hard but don't know *how* they learn best
- **Self-learners** grinding through dense material without a teacher in the room
- **Anyone** who has ever re-read a chapter three times and still failed the test

---

## How it works

```
Chrome Extension (extension-overlay)
  │  behavioural telemetry every 30 s (scroll velocity, keystroke rate, idle gaps)
  │  chat messages, micro-assessment answers
  │  POST /v1/session/*, /v1/questions/*, /v1/microassess/*
  ▼
FastAPI Backend (backend)
  │  policy engine → MiniMax LLM → DynamoDB
  │  returns: ori_state, technique suggestion, Socratic answer, score
  ▼
React Dashboard (frontend)
     GET /v1/dashboard/*, /v1/profiles/*
     reads the same backend; user identified by a shared UUID in X-User-Id header
```

The extension collects **behavioural signals only**: numeric aggregates sent every 30 seconds. No content, no raw keystrokes, no screenshots.

These signals feed a local classifier that outputs a cognitive state (`FLOW`, `CONFUSION`, `FRUSTRATION`, `MIND_WANDER`, `OVERLOAD`, `BOREDOM`, `INSIGHT`) with a confidence score. The backend Policy Engine takes that state and deterministically scores 9 study techniques (Feynman, Active Recall, Modality Switching, Elaborative Interrogation, Pomodoro, Analogy Generation, Error Analysis, Chunking, Interleaving) against a composite function of cluster affinity for the current state, personal historical success rate, context fit, and fatigue adjustment.

When a technique is selected, MiniMax generates the Socratic question or micro-assessment probe grounded in the current page content, which is sent ephemerally and never stored.

The `shared/` module is imported by both the extension and dashboard via the `@shared` Vite/TypeScript path alias and is the single source of truth for API route paths and TypeScript payload types.

---

## Repository structure

```
ori/
├── backend/              # FastAPI backend — LLM services, session logic, DynamoDB
├── extension-overlay/    # Chrome Extension (Manifest V3) — Ori overlay, behavioural sensing
├── frontend/             # React dashboard — analytics, weekly review, learner DNA
├── shared/               # Shared TypeScript types and API route constants
└── docs/                 # Monorepo integration guide
```

---

## Tech stack

### Backend (`backend/`)

| Layer | Technology |
|-------|-----------|
| Framework | **FastAPI 0.115** + **Uvicorn** |
| Data validation | **Pydantic v2** + **pydantic-settings** |
| HTTP client | **httpx** (async, shared connection pool, exponential-backoff retries on 429/5xx) |
| LLM | **MiniMax API** (`MiniMax-M2.5-highspeed`) |
| Policy Engine | Pure Python deterministic scorer — no LLM on the hot path |
| Database | **AWS DynamoDB** via **boto3** — 3 tables: Users, Sessions, Assessments |
| Serverless adapter | **Mangum** — wraps FastAPI as an AWS Lambda handler |
| Testing | **pytest** + **pytest-asyncio**, 361 tests |
| Linting / formatting | **ruff**, **black** |

**How MiniMax is used specifically:**
- `question_engine.py` — Socratic answer + follow-up question; adjacent-concept probe generation
- `assessment_scorer.py` — rubric-based free-text scoring; raw answer is discarded after scoring, never stored
- `socratic_engine.py` — grounded Socratic question generation from page headings and text snippets
- `policy_engine.py` — pure-Python decision tree (state → intervention); zero LLM latency

### Chrome Extension (`extension-overlay/`)

| Layer | Technology |
|-------|-----------|
| Build | **Vite 6** + **CRXJS Vite plugin** (Manifest V3, hot reload in dev) |
| UI | **React 18** + **TypeScript** |
| Styling | **Tailwind CSS v3** |
| Animations | **Framer Motion** (spring physics) |
| State | **Zustand v5** |
| Local storage | **Dexie.js v4** (IndexedDB — learner profile, session cache) |
| Mascot animations | **lottie-react** |
| Style isolation | **Shadow DOM** — overlay never touches host-page styles |

- `background/index.ts` — Service Worker: routes Chrome messages, batches and sends telemetry
- `content/index.tsx` — injected into every tab; mounts the overlay inside Shadow DOM, extracts page context
- `overlay/store/overlayStore.ts` — all data flow gated behind `sessionActive`; no backend traffic until the user clicks "Start Studying"
- `overlay/hooks/useBehavioralSensors.ts` — scroll velocity, keystroke rate, idle-gap detection; emits every 30 s

### Dashboard (`frontend/`)

| Layer | Technology |
|-------|-----------|
| Build | **Vite 6** + **@vitejs/plugin-react-swc** |
| UI | **React 18** + **TypeScript** |
| Routing | **React Router v6** |
| Styling | **Tailwind CSS v3** |
| Charts | **Recharts v2** (focus rhythm, calendar heatmap, topic grid) |
| Animations | **Framer Motion** |
| HTTP | **Axios** |

Pages: Dashboard · Session Detail · Topic Detail · Techniques · Weekly Review · Learner DNA · Onboarding

### Shared module (`shared/`)

| File | Purpose |
|------|---------|
| `apiConfig.ts` | `DEFAULT_API_BASE_URL`, `USER_ID_HEADER`, `API` object with every backend route path |
| `apiTypes.ts` | TypeScript interfaces for every request/response payload, matching the backend Pydantic models |

---

## Privacy

Ori was designed privacy-first, not privacy-bolted-on.

- **No camera. No microphone. No biometrics. Ever.**
- Only behavioural timing signals are collected: numeric aggregates, never content
- All learner profile processing runs locally in the browser
- Page content sent to the LLM is ephemeral: never stored, never logged (server raises `ValueError` at startup if either privacy flag is set to `true`)
- Optional anonymised sharing uses differential privacy (Laplace mechanism, ε = 0.1)
- Built on the PP-EDUVec framework: 36.7% reduction in learner data leakage vs. standard approaches

Your learning patterns are yours. Period.

---

## Local setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- AWS account with credentials configured (`aws configure`) — DynamoDB is used even locally
- A MiniMax API key
- Chrome

---

### 1. Backend

```bash
cd backend

pip install -e ".[dev]"

cp .env.example .env
```

Open `.env` and set at minimum:

```
MINIMAX_API_KEY=your-key-here
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=me-central-1
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

Other `make` targets:

```bash
make test        # full pytest suite with coverage (361 tests)
make test-fast   # stop on first failure
make lint        # ruff check
make format      # black + ruff --fix
make smoke       # end-to-end smoke test against localhost:8000
```

---

### 2. Extension

```bash
cd extension-overlay

npm install

cp .env.example .env
# Set: VITE_BACKEND_URL=http://localhost:8000

npm run build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `extension-overlay/dist/`

For hot reload during development: `npm run dev`

---

### 3. Dashboard

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
| POST | `/v1/session/update` | Send behavioural snapshot, receive `ori_state` + suggestion |
| POST | `/v1/session/end` | Close session and persist summary |
| GET | `/v1/dashboard/summary` | Aggregated learning analytics |
| GET | `/v1/dashboard/sessions` | Session list |
| GET | `/v1/dashboard/session/{id}` | Single session detail |
| POST | `/v1/questions/answer` | Socratic answer + follow-up |
| POST | `/v1/unasked-question` | Adjacent-concept probe question |
| POST | `/v1/techniques/select` | Technique recommendation from behavioural signals |
| POST | `/v1/microassess/generate` | Generate recall/application probes |
| POST | `/v1/microassess/submit` | Score a free-text answer (raw text discarded after scoring) |
| GET/PUT/DELETE | `/v1/profiles/{user_id}` | Learner profile CRUD |
| GET | `/v1/profiles/{user_id}/export` | Full data export |

Full API contract: [`backend/docs/API_CONTRACT.md`](backend/docs/API_CONTRACT.md)
Postman collection: [`backend/docs/postman_collection.json`](backend/docs/postman_collection.json)
Integration guide: [`docs/INTEGRATION.md`](docs/INTEGRATION.md)

---

## Team

Five undergrads from Mohammed bin Zayed University of Artificial Intelligence (MBZUAI), Abu Dhabi, UAE.

| | Name | Role |
|---|---|---|
| 🧠 | **Harmanjot Singh** | Tech Lead. Architected and built the entire backend (FastAPI, DynamoDB, AWS Lambda). Designed the Policy Engine and the technique scoring system. Integrated MiniMax LLM for Socratic question generation and micro-assessment grading. |
| 📊 | **Abhra Dubey** | Frontend Lead. Built the analytics dashboard (React, TypeScript). Designed the learner metrics, insight visualisations, and the data contracts between frontend and backend. |
| 🔌 | **Atharva Teg Ratan** | Extension Lead. Built the Chrome extension from the ground up. Implemented the behavioural signal collection pipeline and engineered the local cognitive state classifier. |
| 🔬 | **Anagha Rohit** | Research Lead and QA Engineer. Led the academic research grounding the project including the PP-EDUVec framework (City University of Macau, Feb 2026). Validated the cognitive state detection approach against published literature and owned end-to-end testing across the extension and backend. |
| 🎨 | **Ananthicha** | Product and Design Lead. Drove product ideation and the overall UX vision. Designed the Ori avatar and interaction model. Built the pitch deck and presentation materials. Ran user-facing testing sessions to validate how real students respond to Ori's nudges. |

---

## Demo

📹 [Watch the 2-minute demo](#) *(link coming soon)*

---

*Built at HackTheEast 2026, Hong Kong by five undergrads from the UAE who care way too much about how people learn.*
