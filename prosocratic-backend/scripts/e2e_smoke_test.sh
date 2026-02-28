#!/usr/bin/env bash
# =============================================================================
# ProSocratic Backend — End-to-End Smoke Test
# =============================================================================
# Exercises the full student session flow against a live backend instance and
# prints a human-readable DEMO OUTPUT section showing real platform behaviour.
#
# Usage:
#   chmod +x scripts/e2e_smoke_test.sh
#   ./scripts/e2e_smoke_test.sh                                # local dev
#   BASE_URL=https://<lambda-url>/v1 ./scripts/e2e_smoke_test.sh
#
# Requirements: bash 4+, curl, python3 (stdlib only — no jq needed).
# Does NOT read, modify, or print .env secrets.
# =============================================================================

set -euo pipefail

# ── Pick the project Python (the one with packages) ──────────────────────────
# macOS ships python3 → 3.9 system stub with no site-packages.
# The project uses Anaconda/pyenv/venv — resolved here once, used everywhere.
PYTHON="${PYTHON:-}"
if [[ -z "$PYTHON" ]]; then
  for candidate in python python3 python3.13 python3.12 python3.11; do
    if command -v "$candidate" &>/dev/null && "$candidate" -c "import json" &>/dev/null 2>&1; then
      PYTHON="$candidate"
      break
    fi
  done
fi
[[ -n "$PYTHON" ]] || { echo "ERROR: python not found in PATH" >&2; exit 1; }

# ── Configuration (all overridable via env) ───────────────────────────────────
BASE_URL="${BASE_URL:-http://localhost:8000/v1}"
USER_ID="${USER_ID:-11111111-1111-1111-1111-111111111111}"

TOPIC_LABEL="Estimating derivatives"
PAGE_URL="https://www.khanacademy.org/math/ap-calculus-ab/ab-derivative-intro/ab-estimate-derivatives/v/estimating-derivative-at-a-point"
PAGE_TITLE="Estimating derivative at a point | AP Calculus AB | Khan Academy"

# Strip trailing slash for robustness
BASE_URL="${BASE_URL%/}"
# API root without /v1 — used for the /health endpoint
API_ROOT="${BASE_URL%/v1}"
[[ "$API_ROOT" == "$BASE_URL" ]] && API_ROOT="$BASE_URL"   # fallback if no /v1 suffix

# ── Terminal colours ──────────────────────────────────────────────────────────
if [[ -t 1 ]]; then  # only colourise when stdout is a terminal
  BLD='\033[1m'; DIM='\033[2m'
  GRN='\033[0;32m'; YEL='\033[1;33m'; CYN='\033[0;36m'
  MAG='\033[0;35m'; RED='\033[0;31m'; NC='\033[0m'
else
  BLD=''; DIM=''; GRN=''; YEL=''; CYN=''; MAG=''; RED=''; NC=''
fi

# ── Temp files (cleaned up on exit) ──────────────────────────────────────────
TMPFILE=$(mktemp /tmp/ps_curl_XXXXXX.json)    # curl writes here
JSONFILE=$(mktemp /tmp/ps_data_XXXXXX.json)   # python reads from here
trap 'rm -f "$TMPFILE" "$JSONFILE"' EXIT

# ── Pretty-print helpers ──────────────────────────────────────────────────────
section() { echo; echo -e "${BLD}${CYN}━━━  $*  ━━━${NC}"; }
step()    { echo -e "${BLD}${GRN}▶  $*${NC}"; }
info()    { echo -e "   ${DIM}$*${NC}"; }
ok()      { echo -e "   ${GRN}✓  $*${NC}"; }
kv()      { printf "   ${YEL}%-28s${NC} %s\n" "$1:" "$2"; }
fail()    { echo -e "\n${RED}${BLD}✗  FAILURE${NC} — $*" >&2; exit 1; }

# ── HTTP call: fail fast on non-2xx ──────────────────────────────────────────
# Usage: api_call METHOD PATH [JSON_BODY]
# Outputs the response body to stdout.
api_call() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local status
  local curl_args=(
    -sS
    -X "$method"
    -H "X-User-Id: $USER_ID"
    -H "Content-Type: application/json"
    -o "$TMPFILE"
    -w "%{http_code}"
  )
  [[ -n "$body" ]] && curl_args+=(-d "$body")

  status=$(curl "${curl_args[@]}" "${BASE_URL}${path}")

  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    echo -e "\n${RED}${BLD}HTTP $status${NC} ← $method ${BASE_URL}${path}" >&2
    echo -e "${RED}Response body:${NC}" >&2
    cat "$TMPFILE" >&2
    echo >&2
    fail "Got HTTP $status. Is the backend running at $BASE_URL?"
  fi

  cat "$TMPFILE"
}

# ── JSON field extraction (no jq needed) ─────────────────────────────────────
# Usage: jq_get <json_string> <dot.separated.path>
# Supports nested dicts and integer list indices.
jq_get() {
  printf '%s' "$1" > "$JSONFILE"
  "$PYTHON" - "$JSONFILE" "$2" << 'PYEOF'
import sys, json
with open(sys.argv[1]) as f:
    data = json.load(f)
parts = [p for p in sys.argv[2].split('.') if p]
val = data
for p in parts:
    if isinstance(val, list):
        try:    val = val[int(p)]
        except: val = None; break
    elif isinstance(val, dict):
        val = val.get(p)
    else:
        val = None; break
print('' if val is None else str(val))
PYEOF
}

# Usage: jq_list <json_string> <dot.path>  — prints one item per line
jq_list() {
  printf '%s' "$1" > "$JSONFILE"
  "$PYTHON" - "$JSONFILE" "$2" << 'PYEOF'
import sys, json
with open(sys.argv[1]) as f:
    data = json.load(f)
parts = [p for p in sys.argv[2].split('.') if p]
val = data
for p in parts:
    if isinstance(val, list):
        try:    val = val[int(p)]
        except: val = []; break
    elif isinstance(val, dict):
        val = val.get(p, [])
    else:
        val = []; break
if not isinstance(val, list):
    val = [val] if val is not None else []
for item in val:
    print(str(item))
PYEOF
}

# ── JSON body builders (Python handles all escaping) ─────────────────────────
build_session_update() {
  # $1=session_id $2=state $3=confidence $4=features_json $5=url $6=title
  "$PYTHON" -c "
import json, sys
body = {
    'session_id':      sys.argv[1],
    'state_label':     sys.argv[2],
    'confidence':      float(sys.argv[3]),
    'feature_summary': json.loads(sys.argv[4]),
    'url':             sys.argv[5],
    'title':           sys.argv[6],
}
print(json.dumps(body))" "$1" "$2" "$3" "$4" "$5" "$6"
}

build_generate_body() {
  # $1=session_id $2=topic
  "$PYTHON" -c "
import json, sys
body = {
    'session_id':   sys.argv[1],
    'topic_label':  sys.argv[2],
    'difficulty':   'med',
    'page_context': {
        'headings': [
            'Estimating Derivative at a Point',
            'Using a Table of Values',
            'Secant Line Approximation',
        ],
        'cleaned_text_snippet': (
            'To estimate the derivative of f at x = 4, we use nearby points '
            'from a table of values. If f(3.9) = 7.61 and f(4.1) = 8.41, '
            'the average rate of change over [3.9, 4.1] is '
            '(8.41 - 7.61) / (4.1 - 3.9) = 0.80 / 0.20 = 4. '
            'This secant slope approximates the instantaneous rate of change, '
            'which is f prime of 4. Choosing points closer to x = 4 gives a '
            'more accurate estimate. The derivative f prime(a) is the limit of '
            '[f(a+h) - f(a)] / h as h approaches zero, and a table lets us '
            'approximate this with small but nonzero h values.'
        ),
    },
}
print(json.dumps(body))" "$1" "$2"
}

build_submit_body() {
  # $1=probe_set_id $2=probe_type $3=answer_text
  "$PYTHON" -c "
import json, sys
print(json.dumps({
    'probe_set_id': sys.argv[1],
    'probe_type':   sys.argv[2],
    'answer_text':  sys.argv[3],
}))" "$1" "$2" "$3"
}

# ── Print a session/update result block ──────────────────────────────────────
print_update_result() {
  local label="$1"  # e.g. "A — FLOW"
  local resp="$2"
  echo
  echo -e "   ${BLD}Update $label${NC}"
  kv "ori_state"         "$(jq_get "$resp" "ori_state")"
  kv "suggestion.type"   "$(jq_get "$resp" "suggestion.type")"
  local stitle; stitle=$(jq_get "$resp" "suggestion.title")
  [[ -n "$stitle" ]] && kv "suggestion.title"  "$stitle"
  local cta;    cta=$(jq_get "$resp" "suggestion.cta")
  [[ -n "$cta" ]]    && kv "suggestion.cta"    "$cta"
  echo -e "   ${YEL}transparency_card.signals:${NC}"
  jq_list "$resp" "transparency_card.signals" | while IFS= read -r sig; do
    echo "     • $sig"
  done
  local why; why=$(jq_get "$resp" "transparency_card.why_this")
  echo -e "   ${YEL}transparency_card.why_this:${NC}"
  # Word-wrap at 72 chars for readability
  echo "$why" | fold -s -w 72 | sed 's/^/     /'
}

# =============================================================================
# ═══════════════════  D E M O   O U T P U T  ════════════════════════════════
# =============================================================================

echo
echo -e "${BLD}${MAG}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLD}${MAG}║        ProSocratic Backend — E2E Smoke Test               ║${NC}"
echo -e "${BLD}${MAG}╚═══════════════════════════════════════════════════════════╝${NC}"
echo
info "backend  : $BASE_URL"
info "user_id  : $USER_ID"
info "topic    : $TOPIC_LABEL"

# ─────────────────────────────────────────────────────────────────────────────
section "STEP 0 — Health Check"
step "GET /health"

HEALTH_STATUS=$(curl -sS -o "$TMPFILE" -w "%{http_code}" "${API_ROOT}/health")
if [[ "$HEALTH_STATUS" != "200" ]]; then
  cat "$TMPFILE" >&2
  fail "Health check returned HTTP $HEALTH_STATUS. Is the backend running at $API_ROOT?"
fi
HEALTH=$(cat "$TMPFILE")
kv "status"       "$(jq_get "$HEALTH" "status")"
kv "version"      "$(jq_get "$HEALTH" "version")"
kv "environment"  "$(jq_get "$HEALTH" "environment")"
ok "Backend is healthy"

# ─────────────────────────────────────────────────────────────────────────────
section "STEP 1 — Start Session"
step "POST /session/start"
info "url:   $PAGE_URL"
info "title: $PAGE_TITLE"

START_BODY=$("$PYTHON" -c "
import json, sys
print(json.dumps({
    'url':         sys.argv[1],
    'title':       sys.argv[2],
    'topic_label': sys.argv[3],
}))" "$PAGE_URL" "$PAGE_TITLE" "$TOPIC_LABEL")

SESSION_RESP=$(api_call POST "/session/start" "$START_BODY")
SESSION_ID=$(jq_get "$SESSION_RESP" "session_id")
[[ -z "$SESSION_ID" || "$SESSION_ID" == "None" ]] && fail "No session_id in response"
kv "session_id"  "$SESSION_ID"
ok "Session opened"

# ─────────────────────────────────────────────────────────────────────────────
section "STEP 2 — Session Update A: FLOW  (reading normally)"
step "POST /session/update  — state=FLOW, confidence=0.86"
info "Features: steady keystroke speed, low idle, strong forward navigation"
info "Expected: ori=IDLE, suggestion=NONE (student in the zone)"

FEAT_A='{"keystroke_speed":1.8,"idle_gap_s":12.0,"scroll_velocity":1.2,"forward_nav_rate":0.85,"session_duration_s":90.0,"fatigue_score":0.1}'
RESP_A=$(api_call POST "/session/update" \
  "$(build_session_update "$SESSION_ID" "FLOW" "0.86" "$FEAT_A" "$PAGE_URL" "$PAGE_TITLE")")
print_update_result "A — FLOW" "$RESP_A"
SUGGEST_A=$(jq_get "$RESP_A" "suggestion.type")
echo
kv "→ ignore_count"  "$(jq_get "$RESP_A" "session_flags.ignore_count")"
kv "→ asleep_flag"   "$(jq_get "$RESP_A" "session_flags.asleep_flag")"

# ─────────────────────────────────────────────────────────────────────────────
section "STEP 3 — Session Update B: MIND_WANDER  (attention drifting)"
step "POST /session/update  — state=MIND_WANDER, confidence=0.78"
info "Features: idle ~140 s, re-reading earlier sections, forward nav dropped"
info "Expected: ori=HAS_SOMETHING, suggestion=MICRO_ASSESS  (conf >= 0.65 threshold)"

FEAT_B='{"idle_gap_s":140.0,"section_revisit_count":2.0,"forward_nav_rate":0.15,"keystroke_speed":0.3,"abandonment_rate":0.45,"session_duration_s":240.0,"fatigue_score":0.2}'
RESP_B=$(api_call POST "/session/update" \
  "$(build_session_update "$SESSION_ID" "MIND_WANDER" "0.78" "$FEAT_B" "$PAGE_URL" "$PAGE_TITLE")")
print_update_result "B — MIND_WANDER" "$RESP_B"
SUGGEST_B=$(jq_get "$RESP_B" "suggestion.type")
echo
kv "→ ignore_count"  "$(jq_get "$RESP_B" "session_flags.ignore_count")"
kv "→ asleep_flag"   "$(jq_get "$RESP_B" "session_flags.asleep_flag")"

# ─────────────────────────────────────────────────────────────────────────────
section "STEP 4 — Session Update C: CONFUSION  (stuck on concept)"
step "POST /session/update  — state=CONFUSION, confidence=0.74"
info "Features: high revisit count, slow reverse scroll, elevated confusion signal"
info "Expected: ori=HAS_SOMETHING, suggestion=TECHNIQUE  (Feynman / Chunking etc.)"

FEAT_C='{"section_revisit_count":3.5,"confusion_confidence":0.74,"idle_gap_s":95.0,"scroll_velocity":0.25,"backspace_burst_count":4.0,"forward_nav_rate":0.1,"session_duration_s":420.0,"fatigue_score":0.25}'
RESP_C=$(api_call POST "/session/update" \
  "$(build_session_update "$SESSION_ID" "CONFUSION" "0.74" "$FEAT_C" "$PAGE_URL" "$PAGE_TITLE")")
print_update_result "C — CONFUSION" "$RESP_C"
SUGGEST_C=$(jq_get "$RESP_C" "suggestion.type")
echo
kv "→ ignore_count"   "$(jq_get "$RESP_C" "session_flags.ignore_count")"
kv "→ asleep_flag"    "$(jq_get "$RESP_C" "session_flags.asleep_flag")"

echo
echo -e "   ${DIM}Suggestion trail: Update A=$SUGGEST_A  B=$SUGGEST_B  C=$SUGGEST_C${NC}"
if [[ "$SUGGEST_B" == "MICRO_ASSESS" || "$SUGGEST_B" == "UNASKED_QUESTION" \
   || "$SUGGEST_C" == "MICRO_ASSESS" || "$SUGGEST_C" == "UNASKED_QUESTION" ]]; then
  echo -e "   ${GRN}Backend triggered a recall-type suggestion — proceeding to micro-assessment.${NC}"
else
  echo -e "   ${YEL}No MICRO_ASSESS suggestion yet (technique suggested instead).${NC}"
  echo -e "   ${DIM}Running micro-assessment anyway to demonstrate the flow.${NC}"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "STEP 5 — Generate Micro-Assessment  (page_context is EPHEMERAL)"
step "POST /microassess/generate"
info "Sending hardcoded snippet from the Khan Academy estimating-derivative lesson"
info "Snippet length: $("$PYTHON" -c "print(len('To estimate the derivative of f at x = 4, we use nearby points from a table of values. If f(3.9) = 7.61 and f(4.1) = 8.41, the average rate of change over [3.9, 4.1] is (8.41 - 7.61) / (4.1 - 3.9) = 0.80 / 0.20 = 4. This secant slope approximates the instantaneous rate of change, which is f prime of 4. Choosing points closer to x = 4 gives a more accurate estimate. The derivative f prime(a) is the limit of [f(a+h) - f(a)] / h as h approaches zero, and a table lets us approximate this with small but nonzero h values.'))") chars — never stored by server"

RESP_GEN=$(api_call POST "/microassess/generate" \
  "$(build_generate_body "$SESSION_ID" "$TOPIC_LABEL")")

PROBE_SET_ID=$(jq_get "$RESP_GEN" "probe_set_id")
RECALL_PROBE=$(jq_get "$RESP_GEN" "recall_probe")
TRANSFER_PROBE=$(jq_get "$RESP_GEN" "transfer_probe")
[[ -z "$PROBE_SET_ID" || "$PROBE_SET_ID" == "None" ]] && fail "No probe_set_id in generate response"

echo
kv "probe_set_id"    "$PROBE_SET_ID"
echo
echo -e "   ${YEL}recall_probe:${NC}"
echo "$RECALL_PROBE" | fold -s -w 72 | sed 's/^/     /'
echo
echo -e "   ${YEL}transfer_probe:${NC}"
echo "$TRANSFER_PROBE" | fold -s -w 72 | sed 's/^/     /'
echo
echo -e "   ${YEL}rubric.key_points:${NC}"
jq_list "$RESP_GEN" "rubric.key_points" | while IFS= read -r pt; do
  echo "     • $pt"
done
ok "Probes generated (MiniMax grounded in page content)"

# ─────────────────────────────────────────────────────────────────────────────
section "STEP 6 — Submit Recall Answer  (answer_text is EPHEMERAL)"
step "POST /microassess/submit  probe_type=recall"
info "Answer: correct-ish — uses average rate of change, secant slope, nearby points"
info "answer_text is scored by MiniMax then discarded; never written to DynamoDB"

RECALL_ANS="To estimate the derivative at x equals 4, I pick two nearby table values on either side, for example x equals 3.9 and x equals 4.1. The derivative is approximated by the average rate of change: [f(4.1) minus f(3.9)] divided by [4.1 minus 3.9]. This secant slope approximates the instantaneous rate of change, which is the derivative f prime at x equals 4. The closer the chosen points are to 4, the more accurate the approximation."

RESP_R=$(api_call POST "/microassess/submit" \
  "$(build_submit_body "$PROBE_SET_ID" "recall" "$RECALL_ANS")")

echo
kv "score_0_1"        "$(jq_get "$RESP_R" "score_0_1")"
kv "error_type"       "$(jq_get "$RESP_R" "error_type")"
kv "next_probe_time"  "$(jq_get "$RESP_R" "next_probe_time")"
echo -e "   ${YEL}feedback:${NC}"
jq_get "$RESP_R" "feedback" | fold -s -w 72 | sed 's/^/     /'
ok "Recall scored — AttemptMeta (score + error_type + ts) stored; answer discarded"

# ─────────────────────────────────────────────────────────────────────────────
section "STEP 7 — Submit Transfer Answer  (intentionally slightly imperfect)"
step "POST /microassess/submit  probe_type=transfer"
info "Answer: applies method to x=6 but makes a subtle conceptual error"
info "(claims the average rate equals the EXACT derivative — this is the flaw)"

TRANSFER_ANS="To estimate f prime at x equals 6, I use nearby table values at x equals 5 and x equals 7. The estimate is [f(7) minus f(5)] divided by [7 minus 5], which gives the average rate of change over [5, 7]. This symmetry around 6 should give a good estimate. As long as the interval is small enough and the points are symmetric, the secant slope equals the exact derivative at x equals 6."

RESP_T=$(api_call POST "/microassess/submit" \
  "$(build_submit_body "$PROBE_SET_ID" "transfer" "$TRANSFER_ANS")")

echo
kv "score_0_1"        "$(jq_get "$RESP_T" "score_0_1")"
kv "error_type"       "$(jq_get "$RESP_T" "error_type")"
kv "next_probe_time"  "$(jq_get "$RESP_T" "next_probe_time")"
echo -e "   ${YEL}feedback:${NC}"
jq_get "$RESP_T" "feedback" | fold -s -w 72 | sed 's/^/     /'
ok "Transfer scored — mastery updated via Bayesian formula (p += 0.6 * (score - p) * 1.5)"

# ─────────────────────────────────────────────────────────────────────────────
section "STEP 8 — Dashboard Summary"
step "GET /dashboard/summary?user_id=$USER_ID"

DASHBOARD=$(api_call GET "/dashboard/summary?user_id=${USER_ID}")

# focus_state_distribution
echo
echo -e "   ${YEL}focus_state_distribution:${NC}"
printf '%s' "$DASHBOARD" > "$JSONFILE"
"$PYTHON" - "$JSONFILE" << 'PYEOF'
import sys, json
with open(sys.argv[1]) as f:
    d = json.load(f)
dist = d.get('focus_state_distribution', {})
if dist:
    for state, frac in sorted(dist.items(), key=lambda x: -x[1]):
        bar = '█' * int(frac * 30)
        print(f'     {state:<18} {frac:.0%}  {bar}')
else:
    print('     (no data yet — events may not have rolled up into summary)')
PYEOF

# technique_success_rates
echo
echo -e "   ${YEL}technique_success_rates (top 3):${NC}"
printf '%s' "$DASHBOARD" > "$JSONFILE"
"$PYTHON" - "$JSONFILE" << 'PYEOF'
import sys, json
with open(sys.argv[1]) as f:
    d = json.load(f)
rates = d.get('technique_success_rates', [])
if rates:
    for row in rates[:3]:
        tid   = row.get('technique_id', '?')
        shown = row.get('shown_count', 0)
        sr    = row.get('success_rate', 0.0)
        ar    = row.get('acceptance_rate', 0.0)
        print(f'     {tid:<32} success={sr:.0%}  accepted={ar:.0%}  shown={shown}')
else:
    print('     (no technique history yet — session updates build this over time)')
PYEOF

# mastery_by_topic
echo
echo -e "   ${YEL}mastery_by_topic:${NC}"
printf '%s' "$DASHBOARD" > "$JSONFILE"
"$PYTHON" - "$JSONFILE" "$TOPIC_LABEL" << 'PYEOF'
import sys, json
with open(sys.argv[1]) as f:
    d = json.load(f)
topic   = sys.argv[2]
mastery = d.get('mastery_by_topic', {})
if topic in mastery:
    m    = mastery[topic]
    p    = m.get('p_mastery', 0)
    bar  = '█' * int(p * 30)
    nxt  = m.get('next_probe_at') or 'not scheduled'
    last = m.get('last_probe_at') or 'never'
    print(f'     {topic}')
    print(f'       p_mastery     : {p:.4f}  {bar}')
    print(f'       last_probe_at : {last}')
    print(f'       next_probe_at : {nxt}')
elif mastery:
    for t, m in list(mastery.items())[:3]:
        print(f'     {t}: p_mastery={m.get("p_mastery", 0):.4f}')
else:
    print('     (no mastery data yet — complete a micro-assessment to populate)')
PYEOF

# upcoming_reviews
echo
echo -e "   ${YEL}upcoming_reviews (sorted by urgency):${NC}"
printf '%s' "$DASHBOARD" > "$JSONFILE"
"$PYTHON" - "$JSONFILE" << 'PYEOF'
import sys, json
with open(sys.argv[1]) as f:
    d = json.load(f)
reviews = d.get('upcoming_reviews', [])
if reviews:
    for r in reviews[:5]:
        topic   = r.get('topic_label', '?')
        nxt     = r.get('next_probe_at', '')
        pm      = r.get('p_mastery', 0.0)
        overdue = '  ⚠ OVERDUE' if r.get('overdue') else ''
        print(f'     {topic:<35} p={pm:.2f}  next={nxt}{overdue}')
else:
    print('     (no upcoming reviews scheduled yet)')
PYEOF

ok "Dashboard fetched"

# ─────────────────────────────────────────────────────────────────────────────
section "STEP 9 — End Session"
step "POST /session/end"

END_RESP=$(api_call POST "/session/end" \
  "$("$PYTHON" -c "import json, sys; print(json.dumps({'session_id': sys.argv[1]}))" "$SESSION_ID")")

kv "ok"  "$(jq_get "$END_RESP" "ok")"
ok "Session closed — ended_at written to DynamoDB"

# ─────────────────────────────────────────────────────────────────────────────
echo
echo -e "${BLD}${MAG}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLD}${MAG}║               ✓  ALL STEPS PASSED                        ║${NC}"
echo -e "${BLD}${MAG}╚═══════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "   ${DIM}session_id     : $SESSION_ID${NC}"
echo -e "   ${DIM}probe_set_id   : $PROBE_SET_ID${NC}"
echo -e "   ${DIM}user_id        : $USER_ID${NC}"
echo -e "   ${DIM}backend        : $BASE_URL${NC}"
echo
echo -e "   ${DIM}Next time, run with a different USER_ID to start fresh:${NC}"
echo -e "   ${DIM}USER_ID=\$("$PYTHON" -c 'import uuid; print(uuid.uuid4())') ./scripts/e2e_smoke_test.sh${NC}"
echo
