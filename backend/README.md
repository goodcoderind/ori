# ProSocratic Backend

Privacy-first AI study companion backend.
**FastAPI · pydantic v2 · MiniMax API · DynamoDB · AWS Lambda (SAM) · Mangum**

---

## End-to-end smoke test

```bash
# Against local dev server (make run must be running):
./scripts/e2e_smoke_test.sh

# Against a deployed Lambda:
BASE_URL=https://<function-url>/v1 ./scripts/e2e_smoke_test.sh

# Fresh user each run:
USER_ID=$(python3 -c 'import uuid; print(uuid.uuid4())') ./scripts/e2e_smoke_test.sh
```

Requires `bash`, `curl`, `python3` — no `jq`. Reads no secrets from `.env`.

---

## Quick links

| | |
|---|---|
| API docs (Swagger) | `http://localhost:8000/docs` |
| API contract | `docs/API_CONTRACT.md` |
| Frontend guide | `docs/FRONTEND_INTEGRATION.md` |
| Postman collection | `docs/postman_collection.json` |
| SAM template | `template.yaml` |

---

## Local development

### 1. Prerequisites

- Python 3.11+
- `pip` (or `uv`)

### 2. Install

```bash
cd prosocratic-backend
pip install -e ".[dev]"
```

### 3. Configure

```bash
cp .env.example .env
# Set at minimum:
#   MINIMAX_API_KEY=sk-...
#   AWS_ACCESS_KEY_ID=...      (or use aws configure)
#   AWS_SECRET_ACCESS_KEY=...
```

### 4. Run

```bash
make run
# → http://localhost:8000
# → http://localhost:8000/docs   Swagger UI
# → http://localhost:8000/redoc  ReDoc
```

### 5. Test

```bash
make test          # full suite with coverage
make test-fast     # stop on first failure
make lint          # ruff check
make format        # black + ruff --fix
make check         # CI gate (no file changes)
```

---

## Quick curl examples

Replace `$UID` with your UUID (generate one at `python3 -c "import uuid; print(uuid.uuid4())"`)
and `$BASE` with the API base URL.

```bash
export BASE=http://localhost:8000
export UID=550e8400-e29b-41d4-a716-446655440000
```

### Health check (no auth)

```bash
curl -s $BASE/health | jq
```

### Full session flow

```bash
# 1. Start a session
SESSION=$(curl -s -X POST $BASE/v1/session/start \
  -H "X-User-Id: $UID" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://en.wikipedia.org/wiki/ATP","title":"ATP","topic_label":"Biology/ATP"}' \
  | jq -r '.session_id')
echo "Session: $SESSION"

# 2. Send a state update (CONFUSION)
curl -s -X POST $BASE/v1/session/update \
  -H "X-User-Id: $UID" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$SESSION\",
    \"state_label\": \"CONFUSION\",
    \"confidence\": 0.91,
    \"feature_summary\": {\"idle_gap_s\": 130, \"confusion_confidence\": 0.91},
    \"url\": \"https://en.wikipedia.org/wiki/ATP\",
    \"title\": \"ATP\"
  }" | jq '{ori_state, suggestion_type: .suggestion.type}'

# 3. End the session
curl -s -X POST $BASE/v1/session/end \
  -H "X-User-Id: $UID" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"$SESSION\"}" | jq
```

### Generate an unasked Socratic question

```bash
curl -s -X POST $BASE/v1/unasked-question \
  -H "X-User-Id: $UID" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$SESSION\",
    \"topic_label\": \"Biology/ATP\",
    \"page_context\": {
      \"headings\": [\"ATP Structure\", \"Energy Release\"],
      \"cleaned_text_snippet\": \"ATP stores chemical energy in phosphate bonds.\"
    }
  }" | jq '{unasked_question, is_meta}'
```

### Run a micro-assessment

```bash
# Generate probes
PROBE=$(curl -s -X POST $BASE/v1/microassess/generate \
  -H "X-User-Id: $UID" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$SESSION\",
    \"topic_label\": \"Biology/ATP\",
    \"page_context\": {
      \"headings\": [\"ATP\"],
      \"cleaned_text_snippet\": \"ATP stores energy in phosphate bonds.\"
    },
    \"difficulty\": \"med\"
  }")
echo "Recall probe: $(echo $PROBE | jq -r .recall_probe)"
PROBE_ID=$(echo $PROBE | jq -r .probe_set_id)

# Submit an answer
curl -s -X POST $BASE/v1/microassess/submit \
  -H "X-User-Id: $UID" \
  -H "Content-Type: application/json" \
  -d "{
    \"probe_set_id\": \"$PROBE_ID\",
    \"probe_type\": \"recall\",
    \"answer_text\": \"ATP is the energy currency of the cell.\"
  }" | jq '{score_0_1, error_type, feedback}'
```

### Dashboard

```bash
# Summary
curl -s "$BASE/v1/dashboard/summary?user_id=$UID" \
  -H "X-User-Id: $UID" | jq '{upcoming_reviews, focus_state_distribution}'

# Sessions list
curl -s "$BASE/v1/dashboard/sessions?user_id=$UID&limit=5" \
  -H "X-User-Id: $UID" | jq '.[].topic_label'
```

---

## AWS deployment

### Prerequisites

- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- AWS CLI configured (`aws configure`)
- Docker (for `--use-container` build; ensures Python 3.11 compatibility)

### First-time deploy (interactive)

```bash
export MINIMAX_API_KEY=sk-...
sam build --use-container
sam deploy --guided
```

SAM will prompt for stack name, region, and other parameters, then write `samconfig.toml`.

### Subsequent deploys (automated)

```bash
export MINIMAX_API_KEY=sk-...
./scripts/deploy.sh production
```

Or per-environment:
```bash
./scripts/deploy.sh staging   default          # uses 'default' AWS profile
./scripts/deploy.sh production my-aws-profile  # uses named profile
```

### Deployment parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `Environment` | `production` | Stack suffix; also tags DynamoDB tables |
| `MiniMaxApiKey` | *(required)* | Your MiniMax API key |
| `MiniMaxModel` | `MiniMax-M2.5-highspeed` | Model ID |
| `DashboardOrigin` | `https://prosocratic.ai` | CORS allowed origin for the dashboard |
| `ExtensionDevMode` | `false` | Set `true` in dev to allow any `chrome-extension://` origin |
| `SessionTtlDays` | `30` | DynamoDB TTL for sessions and assessments |
| `LambdaMemoryMB` | `1024` | Lambda memory (higher = faster cold start) |

### Get the API URL after deploy

```bash
aws cloudformation describe-stacks \
  --stack-name prosocratic-production \
  --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" \
  --output text
```

---

## Architecture

```
Extension (Client A)               Web Dashboard (Client B)
     │                                      │
     │  POST /v1/session/*                  │  GET /v1/dashboard/*
     │  POST /v1/microassess/*              │  GET /v1/profiles/*
     │  POST /v1/unasked-question           │
     ▼                                      ▼
┌─────────────────────────────────────────────────────┐
│           Lambda Function URL (HTTPS)               │
│  Mangum → FastAPI → Routes → Services               │
│                                                     │
│  Policy Engine (pure Python, ~0 ms)                 │
│  MiniMax Client (httpx, pooled, retried)            │
│  Storage Layer (boto3 DynamoDB)                     │
└──────────────┬──────────────────────────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
 Users     Sessions  Assessments
 Table      Table      Table
(DynamoDB) (DynamoDB) (DynamoDB)
```

### Cold-start safety

- `get_settings()` — `lru_cache`; loaded once at module import time
- `_SHARED_HTTP_CLIENT` (MiniMax httpx) — module-level singleton, lazy on first request
- DynamoDB `boto3.resource` — lazy singleton in `DynamoStorage.__init__`
- `PrivacyFilter`, `RequestIdFilter` — attached to the root logger at startup

Lambda warm invocations reuse all these objects, avoiding per-request initialization overhead.

---

## Privacy invariants

The server **raises a `ValueError` at startup** if either privacy flag is `true`:

| Env var | Required | Reason |
|---------|----------|--------|
| `STORE_RAW_ANSWERS` | `false` | Raw answer text must never be persisted |
| `STORE_PAGE_CONTEXT` | `false` | Page HTML/text is ephemeral (LLM prompt only) |

Additional server-side enforcement:
- `PrivacyFilter` scrubs `page_context`, `answer_text`, `cleaned_text_snippet`, `page_html`, `raw_html` from all log records before formatting
- `FeatureSummary` rejects unknown keys via `extra="forbid"` (prevents clients from accidentally submitting content fields)
- `ProbeSet` model uses `extra="forbid"` (structurally forbids `answer_text` and `page_context`)

---

## Project structure

```
app/
├── main.py                     # FastAPI app + Mangum Lambda handler
├── config.py                   # pydantic-settings (all env vars, privacy validators)
├── models.py                   # Domain models + enums
├── core/
│   ├── logging.py              # JSON logger, RequestIdMiddleware, PrivacyFilter
│   ├── cors.py                 # CORS (dashboard + extension origins)
│   ├── errors.py               # Uniform { "error": { code, message, request_id } }
│   └── security.py             # X-User-Id header dependency (UUID validation)
├── routes/
│   ├── sessions.py             # POST /v1/session/{start,update,end}
│   ├── questions.py            # POST /v1/questions/{answer,unasked}
│   ├── socratic.py             # POST /v1/unasked-question
│   ├── techniques.py           # POST /v1/techniques/select
│   ├── assessments.py          # POST /v1/assessments/{probe-sets,score}
│   ├── microassess.py          # POST /v1/microassess/{generate,submit}
│   ├── dashboard.py            # GET  /v1/dashboard/{summary,sessions,session/{id}}
│   └── profiles.py             # GET/PUT/DELETE /v1/profiles/{user_id}[/export]
├── services/
│   ├── minimax_client.py       # httpx async client, retries, JSON extraction
│   ├── policy_engine.py        # Pure-Python decision engine (state→suggestion)
│   ├── technique_scorer.py     # Composite scoring for 9 techniques
│   ├── question_engine.py      # Answer generation + unasked concept engine
│   ├── assessment_scorer.py    # MiniMax-based rubric scoring
│   ├── socratic_engine.py      # Grounded Socratic question generation
│   ├── microassess_service.py  # Micro-assessment lifecycle + mastery update
│   └── dashboard_service.py    # Aggregation over stored data
└── storage/
    ├── __init__.py             # get_storage() singleton
    └── dynamo.py               # DynamoStorage: all DynamoDB CRUD

tests/                          # 361 tests, all passing
docs/
├── API_CONTRACT.md
├── FRONTEND_INTEGRATION.md
└── postman_collection.json
template.yaml                   # AWS SAM
scripts/deploy.sh               # Deployment automation
```
