#!/usr/bin/env bash
# =============================================================================
# Create ProSocratic DynamoDB tables in your AWS account.
#
# Run this ONCE before starting the local dev server or the smoke test.
# It is fully idempotent — tables that already exist are left untouched.
#
# Usage:
#   ./scripts/create_tables.sh
#   # or via make:
#   make tables
#
# Reads:  .env  (AWS_REGION, AWS credentials, TABLE_* names)
# Needs:  python3 + boto3  (already installed via  pip install -e ".[dev]")
# =============================================================================

set -euo pipefail

# ── Pick the Python that has boto3 ────────────────────────────────────────────
# On macOS, `python3` may be the Apple system stub (3.9, no packages).
# `python` (Anaconda / pyenv / venv) is usually the project interpreter.
PYTHON="${PYTHON:-}"
if [[ -z "$PYTHON" ]]; then
  for candidate in python python3 python3.13 python3.12 python3.11; do
    if command -v "$candidate" &>/dev/null && "$candidate" -c "import boto3" &>/dev/null 2>&1; then
      PYTHON="$candidate"
      break
    fi
  done
fi
[[ -n "$PYTHON" ]] || { echo "ERROR: cannot find a Python with boto3. Run: pip install -e '.[dev]'" >&2; exit 1; }

# ── colours ──────────────────────────────────────────────────────────────────
GRN='\033[0;32m'; YEL='\033[1;33m'; CYN='\033[0;36m'
RED='\033[0;31m'; DIM='\033[2m'; BLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GRN}✓${NC}  $*"; }
info() { echo -e "  ${DIM}$*${NC}"; }
step() { echo -e "${BLD}${CYN}▶  $*${NC}"; }
fail() { echo -e "${RED}${BLD}✗  $*${NC}" >&2; exit 1; }

[[ -f .env ]] || fail ".env not found. Run from the prosocratic-backend directory."

echo
echo -e "${BLD}${CYN}ProSocratic — Create DynamoDB Tables${NC}"
echo

# ── delegate to Python (boto3 handles retry / waiters cleanly) ───────────────
"$PYTHON" - << 'PYEOF'
import sys, os, time

# ── 1. Parse .env ─────────────────────────────────────────────────────────────
env = {}
with open(".env") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()

region     = env.get("AWS_REGION", os.environ.get("AWS_REGION", "us-east-1"))
key_id     = env.get("AWS_ACCESS_KEY_ID",     os.environ.get("AWS_ACCESS_KEY_ID",     ""))
secret     = env.get("AWS_SECRET_ACCESS_KEY", os.environ.get("AWS_SECRET_ACCESS_KEY", ""))
t_users    = env.get("TABLE_USERS",       "ProsocraticUsers")
t_sessions = env.get("TABLE_SESSIONS",    "ProsocraticSessions")
t_assess   = env.get("TABLE_ASSESSMENTS", "ProsocraticAssessments")

print(f"  Region : {region}")
print(f"  Tables : {t_users}, {t_sessions}, {t_assess}")
print()

# ── 2. Build boto3 client ──────────────────────────────────────────────────────
try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    print("ERROR: boto3 not installed. Run:  pip install -e '.[dev]'", file=sys.stderr)
    sys.exit(1)

kwargs = {"region_name": region}
if key_id:
    kwargs["aws_access_key_id"]     = key_id
    kwargs["aws_secret_access_key"] = secret

ddb = boto3.client("dynamodb", **kwargs)

# ── 3. Helper: create one table; skip if it already exists ────────────────────
def create_table(name, attrs, keys, ttl_attr=None):
    print(f"  Creating  {name} ...", end="", flush=True)
    try:
        ddb.create_table(
            TableName=name,
            AttributeDefinitions=attrs,
            KeySchema=keys,
            BillingMode="PAY_PER_REQUEST",
        )
        # Wait until active (usually < 5 s on pay-per-request)
        waiter = ddb.get_waiter("table_exists")
        waiter.wait(TableName=name, WaiterConfig={"Delay": 2, "MaxAttempts": 15})
        print("  created ✓")
    except ClientError as e:
        if e.response["Error"]["Code"] in ("ResourceInUseException", "TableAlreadyExistsException"):
            print("  already exists ✓")
        else:
            print(f"  FAILED — {e}", file=sys.stderr)
            sys.exit(1)

    # Enable TTL if requested
    if ttl_attr:
        try:
            ddb.update_time_to_live(
                TableName=name,
                TimeToLiveSpecification={"Enabled": True, "AttributeName": ttl_attr},
            )
            print(f"  TTL on '{ttl_attr}' enabled ✓")
        except ClientError as e:
            code = e.response["Error"]["Code"]
            # Already enabled is fine
            if "ValidationException" in code or "already" in str(e).lower():
                print(f"  TTL on '{ttl_attr}' already set ✓")
            else:
                print(f"  TTL warning: {e}")

# ── 4. Users table — PK: user_id ──────────────────────────────────────────────
create_table(
    name=t_users,
    attrs=[{"AttributeName": "user_id", "AttributeType": "S"}],
    keys=[{"AttributeName": "user_id", "KeyType": "HASH"}],
)

# ── 5. Sessions table — PK: user_id  SK: session_id  TTL: expires_at ─────────
create_table(
    name=t_sessions,
    attrs=[
        {"AttributeName": "user_id",    "AttributeType": "S"},
        {"AttributeName": "session_id", "AttributeType": "S"},
    ],
    keys=[
        {"AttributeName": "user_id",    "KeyType": "HASH"},
        {"AttributeName": "session_id", "KeyType": "RANGE"},
    ],
    ttl_attr="expires_at",
)

# ── 6. Assessments table — PK: user_id  SK: probe_set_id  TTL: expires_at ────
create_table(
    name=t_assess,
    attrs=[
        {"AttributeName": "user_id",      "AttributeType": "S"},
        {"AttributeName": "probe_set_id", "AttributeType": "S"},
    ],
    keys=[
        {"AttributeName": "user_id",      "KeyType": "HASH"},
        {"AttributeName": "probe_set_id", "KeyType": "RANGE"},
    ],
    ttl_attr="expires_at",
)

print()
print("  All tables ready.")
print()
PYEOF

echo -e "${GRN}${BLD}Done.${NC}  You can now run  make run  and  ./scripts/e2e_smoke_test.sh"
echo
