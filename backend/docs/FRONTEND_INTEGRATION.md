# ProSocratic Frontend Integration Guide

---

## Overview

| Client | Role | Calls |
|--------|------|-------|
| **Chrome extension** (Client A) | Real-time sensing, local ML, Ori overlay | session lifecycle, session/update, questions, techniques, microassess |
| **Web dashboard** (Client B) | Read-only analytics view | dashboard/*, profiles/* |

---

## Authentication

Generate a UUID v4 on first install and persist it in `chrome.storage.local`:

```javascript
// background.js (service worker)
async function getUserId() {
  const { userId } = await chrome.storage.local.get('userId');
  if (userId) return userId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ userId: id });
  return id;
}
```

Include it in **every request**:

```javascript
const USER_ID = await getUserId();
const headers = {
  'X-User-Id':     USER_ID,
  'Content-Type':  'application/json',
};
```

The dashboard reads the same UUID:

```javascript
// Option A: extension sends it to the page via content-script message
// Option B: store in localStorage as a fallback when extension is absent
const userId = localStorage.getItem('prosocratic_user_id') ?? await getUserId();
```

---

## Extension: Session Lifecycle

### 1. Open a session

Call `POST /v1/session/start` when the user navigates to a study page.

```javascript
const BASE = 'http://localhost:8000';  // or Lambda Function URL

async function startSession(url, title, topicLabel) {
  const r = await fetch(`${BASE}/v1/session/start`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url, title, topic_label: topicLabel }),
  });
  const { session_id } = await r.json();
  await chrome.storage.session.set({ sessionId: session_id });
  return session_id;
}
```

### 2. Send state updates (hot path)

Call `POST /v1/session/update` every 30 s **or** on every classifier state transition, whichever comes first.

```javascript
async function sendUpdate(sessionId, stateLabel, confidence, featureSummary, url, title) {
  const r = await fetch(`${BASE}/v1/session/update`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      session_id:      sessionId,
      state_label:     stateLabel,      // e.g. "CONFUSION"
      confidence,
      feature_summary: featureSummary,  // only allowlisted numeric keys
      url,
      title,
    }),
  });

  if (r.status === 429) {
    const retry = r.headers.get('Retry-After') ?? '10';
    console.warn(`Rate limited; retrying in ${retry}s`);
    return;
  }

  const policy = await r.json();
  // policy = { ori_state, suggestion, transparency_card, session_flags }

  renderOri(policy.ori_state);
  if (policy.suggestion.type !== 'NONE') {
    showSuggestion(policy.suggestion, policy.transparency_card);
  }
  if (policy.session_flags.asleep_flag) {
    stopNudging();  // Ori is sleeping for the rest of the session
  }
}
```

#### Feature summary — what to send

Send only keys that have actual measured values. Omit anything not observed in the current window:

```javascript
const featureSummary = {};

if (keyMetrics.speed != null)         featureSummary.keystroke_speed       = keyMetrics.speed;
if (keyMetrics.pauses != null)        featureSummary.pause_count            = keyMetrics.pauses;
if (keyMetrics.backspace != null)     featureSummary.backspace_burst_count  = keyMetrics.backspace;
if (scrollMetrics.velocity != null)   featureSummary.scroll_velocity        = scrollMetrics.velocity;
if (scrollMetrics.revisits != null)   featureSummary.section_revisit_count  = scrollMetrics.revisits;
if (idleGapSeconds != null)           featureSummary.idle_gap_s             = idleGapSeconds;
if (modalityDwell != null)            featureSummary.modality_dwell_s       = modalityDwell;
if (confusionScore != null)           featureSummary.confusion_confidence   = confusionScore;
if (fatigueScore != null)             featureSummary.fatigue_score          = fatigueScore;
// ... etc
```

**Do not send:** keystroke content, page HTML, screenshots, camera/mic data, or any string value.
Unknown keys return a **422** error.

#### State labels
| Label | Typical triggers |
|---|---|
| `FLOW` | Steady keystroke rhythm, forward scroll, no revisits |
| `MIND_WANDER` | Long idle, slow scroll, keystroke drops |
| `CONFUSION` | Section revisits, abandoned keystrokes, long idle |
| `FRUSTRATION` | Explicit signal from student OR rushing + errors |
| `OVERLOAD` | High backspace rate, frequent topic switches, rapid scroll |
| `BOREDOM` | Slow keystroke speed, low engagement over extended period |
| `INSIGHT` | Sudden keystroke acceleration on a key concept |

### 3. Close a session

```javascript
async function endSession(sessionId) {
  await fetch(`${BASE}/v1/session/end`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ session_id: sessionId }),
  });
  await chrome.storage.session.remove('sessionId');
}
```

Trigger on tab close, navigation away from a study page, or user logout.

---

## Extension: Page Context Rules

`page_context` is sent to only **two** endpoints:
- `POST /v1/questions/answer` — to ground the LLM answer in the current page
- `POST /v1/unasked-question` — to generate a Socratic question from the page
- `POST /v1/microassess/generate` — to generate probes from the page

### How to extract clean text

Use [Readability.js](https://github.com/mozilla/readability) in the content script:

```javascript
import { Readability } from '@mozilla/readability';

function extractPageContext() {
  const doc = document.cloneNode(true);
  const reader = new Readability(doc);
  const article = reader.parse();

  const snippet = (article?.textContent ?? document.body.innerText)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2500);          // HARD CAP — server rejects > 2500 chars

  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .map(el => el.textContent.trim())
    .filter(Boolean)
    .slice(0, 10);

  return { headings, cleaned_text_snippet: snippet };
}
```

### Privacy rules for page_context

| Rule | Implementation |
|------|----------------|
| Max 2500 chars per snippet | Enforced by `.slice(0, 2500)` **and** server-side validation |
| Never stored | Server uses it only inside the MiniMax prompt, then discards |
| Never logged | `PrivacyFilter` in server logging scrubs `page_context` and `cleaned_text_snippet` |
| Never cached | Do not store the snippet in `chrome.storage` or `localStorage` |
| Send fresh each call | Re-extract from DOM on every invocation |

---

## Extension: Suggestion Handling

```javascript
function handleSuggestion(suggestion, transparency) {
  switch (suggestion.type) {
    case 'TECHNIQUE':
      showTechniqueCard({
        title:    suggestion.title,
        cta:      suggestion.cta,
        why:      transparency.why_this,
        signals:  transparency.signals,
      });
      break;

    case 'MICRO_ASSESS':
      triggerMicroAssessment();
      break;

    case 'BREAK':
      showBreakPrompt(suggestion.payload?.duration_minutes ?? 5);
      break;

    case 'UNASKED_QUESTION':
      showUnaskedQuestion(suggestion.payload?.probe);
      break;

    case 'NONE':
      // No action; Ori stays idle or in current state
      break;
  }
}
```

### Ignore counter

When the student dismisses a suggestion, increment ignore_count on the **existing** session flags endpoint:

```javascript
// Existing session/update endpoint reads ignore_count from the stored session.
// The extension should call set_session_flags when a suggestion is ignored:
async function recordIgnore(sessionId, currentCount) {
  await fetch(`${BASE}/v1/sessions/${sessionId}/flags`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ ignore_count: currentCount + 1, asleep_flag: false }),
  });
}
```

After 3 ignores, the next `session/update` call will return `session_flags.asleep_flag = true` and `suggestion.type = NONE`. Stop showing Ori nudges for the rest of the session.

---

## Extension: Micro-Assessment Flow

```javascript
async function runMicroAssessment(sessionId, topicLabel) {
  // 1. Generate probes from current page context
  const ctx = extractPageContext();
  const genRes = await fetch(`${BASE}/v1/microassess/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      session_id:   sessionId,
      topic_label:  topicLabel,
      page_context: ctx,
      difficulty:   'med',
    }),
  }).then(r => r.json());

  const { probe_set_id, recall_probe } = genRes;

  // 2. Show recall probe — student types answer locally
  const answer = await showProbeUI(recall_probe);
  // answer is typed by the student; it STAYS in the browser, never sent to any analytics

  // 3. Submit answer for scoring
  const scoreRes = await fetch(`${BASE}/v1/microassess/submit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      probe_set_id,
      probe_type:  'recall',
      answer_text: answer,      // ephemeral — server scores and discards
    }),
  }).then(r => r.json());

  // 4. Show feedback
  showFeedback({
    score:         scoreRes.score_0_1,
    feedback:      scoreRes.feedback,
    nextReviewAt:  scoreRes.next_probe_time,
  });
  // answer_text is now out of scope — do NOT store it anywhere
}
```

---

## Dashboard: Read-only Integration

```javascript
const userId = getUserId();

// Summary page
const summary = await fetch(
  `${BASE}/v1/dashboard/summary?user_id=${userId}`, { headers }
).then(r => r.json());

// Sessions list
const sessions = await fetch(
  `${BASE}/v1/dashboard/sessions?user_id=${userId}&limit=20`, { headers }
).then(r => r.json());

// Session detail
const detail = await fetch(
  `${BASE}/v1/dashboard/session/${sessionId}?user_id=${userId}`, { headers }
).then(r => r.json());

// Export all data
const blob = await fetch(
  `${BASE}/v1/profiles/${userId}/export`, { headers }
).then(r => r.blob());
// → Triggers download of prosocratic-profile-<id>.json

// Delete all data (right to erasure)
await fetch(`${BASE}/v1/profiles/${userId}`, { method: 'DELETE', headers });
```

---

## Error Handling Reference

```javascript
async function apiCall(url, options) {
  const r = await fetch(url, { ...options, headers });

  if (r.status === 429) {
    const retryAfter = parseInt(r.headers.get('Retry-After') ?? '10', 10);
    scheduleRetry(url, options, retryAfter * 1000);
    return null;
  }

  if (r.status === 502) {
    showToast('AI service temporarily unavailable — please retry.');
    return null;
  }

  if (!r.ok) {
    const err = await r.json();
    console.error('API error', err.error?.code, err.error?.message);
    logRequestId(r.headers.get('X-Request-Id'));
    return null;
  }

  return r.json();
}
```

| Code | Meaning | Action |
|------|---------|--------|
| `HTTP_401` | Missing or invalid X-User-Id | Fix UUID format |
| `HTTP_403` | Accessing another user's data | Bug in client |
| `HTTP_404` | Session / ProbeSet not found | Recreate if needed |
| `HTTP_422` | Bad request body (unknown feature key, etc.) | Fix payload |
| `HTTP_429` | Rate limited | Back off per Retry-After header |
| `HTTP_502` | MiniMax upstream error | Toast + retry |
| `INTERNAL_ERROR` | Unhandled server error | Log X-Request-Id, report |

---

## Local Development Setup

```bash
# 1. Start the backend
cd prosocratic-backend
cp .env.example .env   # fill in MINIMAX_API_KEY
make run               # → http://localhost:8000

# 2. Extension: set BASE_URL constant to local server
const BASE = 'http://localhost:8000';

# 3. Dashboard: configure env variable
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Swagger UI: `http://localhost:8000/docs`
ReDoc:       `http://localhost:8000/redoc`

---

## Privacy Summary

| Data | Sent to server? | Stored by server? | In response? | In logs? |
|------|-----------------|-------------------|--------------|---------|
| `page_context` / `cleaned_text_snippet` | Yes (ephemeral) | **Never** | Never | Never |
| `answer_text` | Yes (ephemeral) | **Never** | Never | Never |
| `feature_summary` values (numeric) | Yes | Yes (in SessionEvent) | Meta only | Never |
| `keystroke content` | **Never accepted** | Never | Never | Never |
| `score_0_1`, `error_type` | No (derived) | Yes (AttemptMeta) | Yes | Yes |
| `user_id` | Header | Yes | Yes | Yes (no PII) |
| Page HTML | **Never accepted** | Never | Never | Never |
