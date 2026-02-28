# ProSocratic API Contract

**Base URL (local)**   `http://localhost:8000`
**Base URL (Lambda)**  `https://<id>.lambda-url.<region>.on.aws`

---

## Authentication

Every endpoint (except `/health`) requires:

```
X-User-Id: <UUID v4>
```

The UUID is generated once by the Chrome extension on first install and stored in `chrome.storage.local`. The web dashboard reads it from localStorage or via a message to the extension content script.

Every response includes:
```
X-Request-Id: <UUID>
```
Include this in bug reports for server-side log correlation.

---

## Error Envelope

All errors (4xx / 5xx) return:
```json
{
  "error": {
    "code":       "HTTP_404",
    "message":    "Session 'abc' not found",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```
Rate-limited responses (429) also include a `Retry-After` header.

---

## 1. System

### `GET /health`
No auth required.

**Response 200**
```json
{ "status": "ok", "version": "v1", "environment": "production" }
```

---

## 2. Session Lifecycle  (Chrome extension → server)

### `POST /v1/session/start`
Open a new study session.

**Request**
```json
{
  "url":         "https://en.wikipedia.org/wiki/Adenosine_triphosphate",
  "title":       "Adenosine triphosphate - Wikipedia",
  "topic_label": "Biology/ATP"
}
```
`topic_label` is optional.

**Response 201**
```json
{ "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
```

---

### `POST /v1/session/update`
Ingest one behavioural state snapshot. Runs the policy engine synchronously.

Called every ~30 s or on every classifier state transition.

**Request**
```json
{
  "session_id":    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "state_label":   "CONFUSION",
  "confidence":    0.91,
  "feature_summary": {
    "keystroke_speed":       0.8,
    "idle_gap_s":            130.0,
    "section_revisit_count": 2.0,
    "confusion_confidence":  0.91,
    "fatigue_score":         0.2
  },
  "url":   "https://en.wikipedia.org/wiki/Adenosine_triphosphate",
  "title": "Adenosine triphosphate - Wikipedia"
}
```

`state_label` values: `FLOW` | `MIND_WANDER` | `CONFUSION` | `FRUSTRATION` | `OVERLOAD` | `BOREDOM` | `INSIGHT`

`feature_summary` allowlisted keys (all optional, all numeric):
`keystroke_speed`, `pause_count`, `backspace_burst_count`, `scroll_velocity`,
`section_revisit_count`, `idle_gap_s`, `modality_dwell_s`, `click_density`,
`session_duration_s`, `confusion_confidence`, `fatigue_score`, `rushing_score`,
`typing_acceleration`, `forward_nav_rate`, `peak_focus_windows`, `abandonment_rate`

Unknown keys → **422 Validation Error**.

**Response 200**
```json
{
  "ori_state": "HAS_SOMETHING",
  "suggestion": {
    "type":         "TECHNIQUE",
    "technique_id": "feynman",
    "title":        "Feynman Technique",
    "cta":          "Explain it from scratch",
    "payload": {
      "description":            "Explain the concept in your own words...",
      "time_estimate_minutes":  10
    }
  },
  "transparency_card": {
    "why_detected":       "You appear to be stuck on this material — re-read same section 2 times",
    "signals":            ["CONFUSION (confidence 91%)", "idle_gap_s: 130s", "section_revisit_count: 2×"],
    "why_this":           "Feynman Technique has the highest composite score for your current state and has worked for you 72% of the time.",
    "user_success_rate":  0.72
  },
  "session_flags": {
    "ignore_count": 1,
    "asleep_flag":  false
  }
}
```

`ori_state` values: `IDLE` | `NOTICING` | `HAS_SOMETHING` | `INSIGHT` | `FATIGUE` | `FRUSTRATED`

`suggestion.type` values: `NONE` | `TECHNIQUE` | `MICRO_ASSESS` | `BREAK` | `UNASKED_QUESTION`

When `suggestion.type` is `NONE`, the suggestion object only contains `{ "type": "NONE" }`.

**Rate limit:** 120 requests / minute per user. Exceeding returns 429 with `Retry-After`.

---

### `POST /v1/session/end`
Close the session.

**Request**
```json
{ "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
```

**Response 200**
```json
{ "ok": true }
```

---

## 3. Questions

### `POST /v1/questions/answer`
Generate a direct answer + Socratic follow-up. `page_context` is ephemeral.

**Request**
```json
{
  "page_context": "ATP (adenosine triphosphate) stores energy in phosphate bonds...",
  "question":     "What exactly is ATP?",
  "topic_label":  "Biology/ATP",
  "session_id":   "a1b2c3d4-..."
}
```
`page_context` max 2000 characters. **Never stored or logged.**

**Response 200**
```json
{
  "direct_answer": "ATP is the primary energy currency of cells...",
  "follow_up": {
    "question": "If ATP is the energy currency, what happens to it after a cell 'spends' it?",
    "type":     "socratic"
  }
}
```

---

### `POST /v1/questions/unasked`
Identify the highest-value adjacent concept not yet covered.

**Request**
```json
{
  "accepted_concept": "ATP",
  "topic_label":      "Biology/ATP"
}
```

**Response 200**
```json
{
  "concept":     "ADP",
  "probe":       "What do you think happens to ATP after it releases its energy?",
  "entry_point": "Here's something interesting — when ATP 'runs out'..."
}
```

---

## 4. Socratic Engine

### `POST /v1/unasked-question`
Surface the unasked Socratic question grounded in the student's current page.

**Request**
```json
{
  "session_id":   "a1b2c3d4-...",
  "topic_label":  "Biology/ATP",
  "page_context": {
    "headings":              ["ATP Structure", "Energy Release"],
    "cleaned_text_snippet":  "ATP stores chemical energy in high-energy phosphate bonds..."
  }
}
```
`cleaned_text_snippet` max 2500 characters. **Never stored or logged.**

**Response 200**
```json
{
  "unasked_question": "Why does breaking a phosphate bond release energy rather than absorb it?",
  "followups": [
    "Think about what holds the bond in a high-energy state.",
    "What changes in the electron arrangement when the bond breaks?"
  ],
  "rationale": "This is the key mechanistic insight students consistently skip.",
  "is_meta":   false
}
```
When page content is insufficient, `is_meta=true` and `unasked_question` is a generic prompt.

---

## 5. Techniques

### `POST /v1/techniques/select`
Score all 9 study techniques against the current state and return the winner.
No LLM call — pure deterministic scoring.

**Request**
```json
{
  "state_label":   "CONFUSION",
  "confidence":    0.91,
  "feature_summary": {
    "idle_gap_s":           130.0,
    "confusion_confidence":  0.91,
    "fatigue_score":         0.2
  },
  "session_id":  "a1b2c3d4-...",
  "topic_label": "Biology/ATP"
}
```

**Response 200**
```json
{
  "selected": {
    "technique_id":   "feynman",
    "technique_name": "Feynman Technique",
    "description":    "Explain the concept in your own words...",
    "score":          0.7500,
    "transparency": {
      "trigger_signals":         ["confusion_confidence:0.91", "idle_gap_s:130s"],
      "why_chosen":              "Cluster affinity for CONFUSION: 85%. Personal success rate: 72%.",
      "historical_success_rate": 0.72,
      "time_estimate_minutes":   10,
      "score_breakdown": {
        "cosine_sim":   0.85,
        "success_rate": 0.72,
        "context_fit":  0.85,
        "fatigue_adj":  0.00
      }
    }
  },
  "alternatives": [
    { "technique_id": "chunking", "technique_name": "Chunking", "score": 0.3600, "..." }
  ]
}
```

Technique IDs: `feynman` | `modality_switching` | `elaborative_interrogation` |
`pomodoro` | `active_recall` | `analogy_generation` | `error_analysis` |
`chunking` | `interleaving`

---

## 6. Micro-Assessment

### `POST /v1/microassess/generate`
Generate a recall + transfer probe pair grounded in the page content.

**Request**
```json
{
  "session_id":   "a1b2c3d4-...",
  "topic_label":  "Biology/ATP",
  "page_context": {
    "headings":             ["ATP Structure"],
    "cleaned_text_snippet": "ATP stores chemical energy in high-energy phosphate bonds..."
  },
  "difficulty": "med"
}
```
`difficulty`: `easy` | `med` | `hard`
`cleaned_text_snippet` max 2500 chars. **Ephemeral — never stored.**

**Response 201**
```json
{
  "probe_set_id":  "ps-uuid-...",
  "recall_probe":  "In your own words, what is ATP and what role does it play in the cell?",
  "transfer_probe":"A muscle cell doubles its workload. How does ATP production respond?",
  "rubric": {
    "key_points":      ["ATP stores energy in phosphate bonds", "Hydrolysis releases energy"],
    "common_mistakes": ["Confusing ATP with glucose"],
    "difficulty_tag":  "med"
  }
}
```

---

### `POST /v1/microassess/submit`
Score a student answer. `answer_text` is ephemeral — never stored.

**Request**
```json
{
  "probe_set_id": "ps-uuid-...",
  "probe_type":   "recall",
  "answer_text":  "ATP is like a battery — it stores and releases energy."
}
```
`probe_type`: `recall` | `transfer`
`answer_text` max 3000 chars. **Ephemeral — never stored.**

**Response 200**
```json
{
  "score_0_1":       0.6,
  "error_type":      "vague",
  "feedback":        "Good analogy — now name the specific bond that breaks.",
  "next_probe_time": "2024-03-16T10:00:00+00:00"
}
```
`error_type`: `correct` | `missing_core_idea` | `misapplied_rule` | `vague` | `misconception` | `other`

`next_probe_time` scheduling:
- score_0_1 < 0.4 → ~20 min
- 0.4–0.7 → 1 day
- > 0.7 → 3–7 days (interpolated by mastery level)

---

## 7. Assessments (lower-level)

### `POST /v1/assessments/probe-sets`
Create a probe set from pre-crafted rubric key points (no LLM page context needed).

**Request**
```json
{
  "session_id":      "a1b2c3d4-...",
  "topic_label":     "Biology/ATP",
  "key_points":      ["ATP stores energy in phosphate bonds"],
  "common_mistakes": ["Confusing ATP with glucose"],
  "difficulty_tag":  "intermediate"
}
```

**Response 201**
```json
{
  "probe_set_id":   "ps-uuid-...",
  "recall_probe":   "What is ATP?",
  "transfer_probe": "Apply ATP to a new context."
}
```

---

### `POST /v1/assessments/score`
Score an answer (lower-level; prefer `/v1/microassess/submit` which also updates mastery).

**Request / Response:** same shape as `/v1/microassess/submit` minus `next_probe_time`.

---

## 8. Dashboard  (web app)

All dashboard endpoints require `?user_id=<uuid>` query parameter matching the `X-User-Id` header. Mismatch → **403**.

### `GET /v1/dashboard/summary?user_id=`

**Response 200**
```json
{
  "user_id": "550e8400-...",
  "focus_state_distribution": {
    "FLOW":       0.52,
    "CONFUSION":  0.28,
    "BOREDOM":    0.10,
    "MIND_WANDER":0.10
  },
  "focus_heatmap": {
    "morning":   0.45,
    "afternoon": 0.30,
    "evening":   0.20,
    "night":     0.05
  },
  "technique_success_rates": [
    { "technique_id": "feynman", "shown_count": 12, "acceptance_rate": 0.833, "success_rate": 0.75 }
  ],
  "mastery_by_topic": {
    "Biology/ATP": { "p_mastery": 0.72, "last_probe_at": "...", "next_probe_at": "..." }
  },
  "upcoming_reviews": [
    { "topic_label": "Biology/ATP", "p_mastery": 0.72, "next_probe_at": "2024-03-16T14:00:00+00:00", "overdue": false }
  ]
}
```

---

### `GET /v1/dashboard/sessions?user_id=&limit=20`

**Response 200** — array:
```json
[
  {
    "session_id":          "a1b2c3d4-...",
    "started_at":          "2024-03-15T14:22:00+00:00",
    "ended_at":            "2024-03-15T15:10:00+00:00",
    "duration_seconds":    2880,
    "topic_label":         "Biology/ATP",
    "n_nudges":            4,
    "avg_confidence":      0.82,
    "avg_microassess_score": 0.7
  }
]
```
`avg_confidence` and `avg_microassess_score` may be `null` if not yet computed.

---

### `GET /v1/dashboard/session/{session_id}?user_id=`

**Response 200**
```json
{
  "session_id":         "a1b2c3d4-...",
  "user_id":            "550e8400-...",
  "started_at":         "2024-03-15T14:22:00+00:00",
  "ended_at":           "2024-03-15T15:10:00+00:00",
  "duration_seconds":   2880,
  "topic_label":        "Biology/ATP",
  "n_nudges":           4,
  "avg_confidence":     0.82,
  "avg_microassess_score": 0.7,
  "event_timeline": [
    {
      "ts":              "2024-03-15T14:35:00+00:00",
      "state_label":     "CONFUSION",
      "confidence":      0.91,
      "ori_state":       "HAS_SOMETHING",
      "suggestion_type": "TECHNIQUE",
      "suggestion_id":   "feynman"
    }
  ],
  "assessments": [
    {
      "probe_set_id":   "ps-uuid-...",
      "topic_label":    "Biology/ATP",
      "recall_probe":   "What is ATP?",
      "transfer_probe": "Apply ATP to a new context.",
      "attempts": [
        { "ts": "...", "probe_type": "recall", "score_0_1": 0.6, "error_type": "vague" }
      ]
    }
  ],
  "rolled_up_summary": {
    "total_events":      0,
    "by_state":          {},
    "suggestions_shown": 0
  }
}
```

**404** if session not found.

---

## 9. Profiles

### `GET /v1/profiles/{user_id}`
Dashboard summary (alias to storage aggregates).

### `PUT /v1/profiles/{user_id}`
```json
{ "modality_pref": "visual" }
```
**Response 204**

### `DELETE /v1/profiles/{user_id}`
Wipes all data across all three tables. **204**

### `GET /v1/profiles/{user_id}/export`
Downloads full profile as JSON.
`Content-Disposition: attachment; filename="prosocratic-profile-<id>.json"`

---

## Rate Limits

| Endpoint            | Limit        |
|---------------------|--------------|
| `POST /v1/session/start` | 10 / min |
| `POST /v1/session/update`| 120 / min |
| `POST /v1/session/end`   | 10 / min |
| All others               | ∞ (no limiter; DynamoDB/MiniMax are the bottleneck) |

429 response includes `Retry-After: <seconds>` header.
