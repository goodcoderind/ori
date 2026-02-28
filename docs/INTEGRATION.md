# ProSocratic Integration Guide

This document summarises how the three projects in the monorepo are wired together and confirms that all demo / mock data has been removed.

## API Base URL Configuration

| Project | Env variable | Default fallback |
|---------|-------------|-----------------|
| Backend (FastAPI) | `DASHBOARD_ORIGIN` (CORS only) | — |
| Overlay (Chrome ext) | `VITE_BACKEND_URL` | `http://localhost:8000` |
| Frontend (Dashboard) | `VITE_API_BASE_URL` | `http://localhost:8000` |

Both clients fall back to the same default (`DEFAULT_API_BASE_URL` in `shared/apiConfig.ts`). In production, set the appropriate env var to point at the deployed backend origin.

## User ID Handling

A single anonymous UUID (v4) identifies the learner across overlay and dashboard.

**Overlay**: generated via `crypto.randomUUID()` and persisted in `chrome.storage.local` under the key `prosocratic_user_id`. On every backend request the UUID is sent as the `X-User-Id` header.

**Dashboard**: the overlay mirrors the UUID into `localStorage['prosocratic_user_id']` so the dashboard (which runs as a normal web page) can read it. If the dashboard loads without the extension, it generates its own UUID the same way.

The header name is centralised in `shared/apiConfig.ts` as `USER_ID_HEADER`.

## Shared Module (`shared/`)

Located at the monorepo root, `shared/` contains two files imported by both projects via the `@shared` path alias:

- `apiConfig.ts` — `DEFAULT_API_BASE_URL`, `USER_ID_HEADER`, and an `API` object with every backend route path.
- `apiTypes.ts` — TypeScript interfaces for every request and response payload, matching the backend Pydantic models exactly.

Both `vite.config.ts` and `tsconfig.json` in the overlay and frontend resolve `@shared/*` to `../shared/*`.

## Files Modified

### New files
- `shared/apiConfig.ts`
- `shared/apiTypes.ts`
- `docs/INTEGRATION.md`

### Overlay (`prosocratic-overlay/`)
- `vite.config.ts` — added `@shared` alias
- `tsconfig.json` — added `@shared` path + include
- `.env.example` — corrected URL from `localhost:3001/api` to `localhost:8000`
- `src/background/index.ts` — imports from `@shared`; uses `API.*` route constants and `USER_ID_HEADER`; removed `getFallbackResponse` (hardcoded demo replies); added `MICROASSESS_GENERATE`, `MICROASSESS_SUBMIT`, `UNASKED_QUESTION` message handlers; added `MICRO_ASSESS` suggestion forwarding to content script
- `src/shared/types.ts` — added new `ChromeMessage` variants for microassess and unasked-question flows
- `src/telemetry/integration.ts` — removed commented-out direct-fetch block with wrong URL
- `src/overlay/hooks/useBehavioralSensors.ts` — rewritten to gate telemetry start/stop behind `sessionActive`
- `src/overlay/store/overlayStore.ts` — added `sessionActive` flag, `beginSession()`, `stopSession()` actions; gated all data flow behind session
- `src/overlay/components/ChatPanel.tsx` — added `SessionStartScreen` ("Start Studying" button), `SessionControls` ("End session"), conditional rendering
- `src/overlay/hooks/useOriState.ts` — ignores backend messages when session is not active
- `src/content/index.tsx` — removed auto `extractAndSendPageContext()` on page load

### Frontend (`frontend/`)
- `vite.config.ts` — added `@shared` alias + path import
- `tsconfig.json` — added `@shared` path + include
- `src/api/client.ts` — imports `DEFAULT_API_BASE_URL` and `USER_ID_HEADER` from shared
- `src/api/dashboard.ts` — uses `API.*` route constants and imports types from `@shared/apiTypes`
- `src/api/profiles.ts` — uses `API.*` route constants and imports types from `@shared/apiTypes`
- `src/types/api.ts` — now re-exports from `@shared/apiTypes` (thin wrapper)
- `src/types/states.ts` — now re-exports from `@shared/apiTypes` (thin wrapper)

### Backend (`prosocratic-backend/`)
No changes. The backend is the source of truth.

## Demo / Mock Data Removal Confirmation

The following demo artefacts were removed:

1. **`getFallbackResponse()`** in `overlay/src/background/index.ts` — hardcoded pattern-matched Socratic replies used when the backend was unreachable. Replaced with honest error messages ("Unable to reach the backend…" / "Session is still starting…").

2. **Commented-out direct fetch** in `overlay/src/telemetry/integration.ts` — referenced `localhost:3001/api` with a wrong payload shape. Replaced with a comment noting that all telemetry routes through the background service worker.

3. **"demo" comment** in `overlay/src/overlay/hooks/useBehavioralSensors.ts` — the `startBehavioralTimer()` call was annotated "for backwards compat during demo". Comment updated to reflect actual purpose (local activity tracking).

4. **`.env.example` URL mismatch** — pointed to `localhost:3001/api` instead of the backend's actual `localhost:8000`. Corrected.

All overlay behaviour is now driven exclusively by real backend responses.

## Session Gating

The overlay enforces an **explicit session start** — no telemetry, no nudges, and no backend communication until the user clicks "Start Studying".

**How it works:**

The Zustand store exposes a `sessionActive` boolean (default `false`) with two actions:

- `beginSession()` — sends `PAGE_CONTEXT` to the background worker (which calls `POST /v1/session/start`), then sets `sessionActive: true`. This triggers the `useBehavioralSensors` hook to start the telemetry engine and the 30-second emitter.
- `stopSession()` — syncs any pending data via `SESSION_SYNC`, then sets `sessionActive: false`. The sensors hook detects this and tears down telemetry.

**What is gated:**

All of the following are no-ops when `sessionActive === false`:

- `surfaceNudge()` — nudge cards will not appear
- `handleTelemetrySnapshot()` — telemetry data will not be processed
- `handleSignalResponse()` — backend signal responses are ignored
- `sendMessage()` — chat input is disabled
- `syncSessionToStorage()` — no writes to `chrome.storage`
- `useOriState` message handler — backend messages are ignored
- `useBehavioralSensors` — telemetry engine is not running

**UI flow:**

1. Overlay opens → shows `SessionStartScreen` with a "Start Studying" button
2. User clicks → `beginSession()` fires → telemetry starts → full UI appears (topic bar, chat, nudge area)
3. User clicks "End session" → `stopSession()` fires → telemetry stops → back to start screen

No data is collected or transmitted until the user explicitly starts a session.

## End-to-End Session Lifecycle

```
 Overlay UI                    Content Script / Hooks       Background SW              Backend API
 ──────────                    ──────────────────────       ──────────────              ───────────
 [Start Studying] ──────────> beginSession()
                               ↓ sets sessionActive=true
                               PAGE_CONTEXT ───────────> startBackendSession() ───> POST /v1/session/start
                                                            ↓ stores session_id

                               useBehavioralSensors
                               starts telemetry engine
                               ↓ (every 30s)
                               TELEMETRY_WINDOW ────────> sendTelemetryUpdate() ──> POST /v1/session/update
                                                            ↓ receives policy result
                               ORI_STATE_CHANGE  <──────── ori_state
                               STATE_CLASSIFIED  <──────── state_label + confidence
                               NUDGE_READY       <──────── suggestion (type=TECHNIQUE)
                               MICROASSESS_SUGGESTED <──── suggestion (type=MICRO_ASSESS)

 [User asks question] ──────> CHAT_REQUEST ─────────────> handleChatRequest() ────> POST /v1/questions/answer
                               CHAT_RESPONSE <────────────── direct_answer + follow_up

                               MICROASSESS_GENERATE ────> backendPost() ──────────> POST /v1/microassess/generate
                               MICROASSESS_SUBMIT ──────> backendPost() ──────────> POST /v1/microassess/submit

                               UNASKED_QUESTION ────────> backendPost() ──────────> POST /v1/unasked-question

 [End session] ─────────────> stopSession()
                               ↓ sets sessionActive=false
                               SESSION_SYNC ────────────> endBackendSession() ───> POST /v1/session/end
```

Dashboard reads from the same backend via GET endpoints (`/v1/dashboard/summary`, `/v1/dashboard/sessions`, `/v1/dashboard/session/{id}`, `/v1/profiles/{id}`, etc.), all authenticated with the same `X-User-Id` header.
