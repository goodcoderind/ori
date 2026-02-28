#!/usr/bin/env bash
# ProSocratic Backend — AWS SAM deployment script
#
# Usage:
#   ./scripts/deploy.sh                         # deploy to production
#   ./scripts/deploy.sh staging                 # deploy to staging
#   ./scripts/deploy.sh production my-profile   # use a named AWS CLI profile
#
# Prerequisites:
#   - AWS SAM CLI  (brew install aws-sam-cli  /  pip install aws-sam-cli)
#   - AWS CLI configured (aws configure  or  AWS_* env vars)
#   - Docker running (required for sam build --use-container)
#   - MINIMAX_API_KEY set in environment
#   - python 3.11 available
#
# First-time deploy:  run interactively to let SAM create the S3 artifact bucket.
#   sam deploy --guided
#   (follow prompts; SAM writes samconfig.toml)
#
# Subsequent deploys:  this script reads samconfig.toml if present.

set -euo pipefail

# ── Args ──────────────────────────────────────────────────────────────────────
ENVIRONMENT="${1:-production}"
AWS_PROFILE="${2:-default}"
AWS_REGION="${AWS_REGION:-me-central-1}"
STACK_NAME="prosocratic-${ENVIRONMENT}"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Checks ────────────────────────────────────────────────────────────────────
info "Checking prerequisites..."

command -v sam  >/dev/null 2>&1 || error "aws-sam-cli not found. Install: brew install aws-sam-cli"
command -v aws  >/dev/null 2>&1 || error "aws-cli not found. Install: brew install awscli"
command -v docker >/dev/null 2>&1 || warn "Docker not found — using native build instead of container"

if [[ -z "${MINIMAX_API_KEY:-}" ]]; then
    error "MINIMAX_API_KEY is not set. Export it before running:\n  export MINIMAX_API_KEY=your-key"
fi

DASHBOARD_ORIGIN="${DASHBOARD_ORIGIN:-https://prosocratic.ai}"

info "Deploying to environment: ${ENVIRONMENT}"
info "Stack name:               ${STACK_NAME}"
info "AWS region:               ${AWS_REGION}"
info "AWS profile:              ${AWS_PROFILE}"
info "Dashboard origin:         ${DASHBOARD_ORIGIN}"
echo

# ── Build ─────────────────────────────────────────────────────────────────────
info "Building Lambda package..."

# Use --use-container for reproducible builds that match Lambda's Python 3.11.
# Fall back to native build if Docker is unavailable.
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    sam build --use-container --parallel
else
    warn "Docker not running — using native build (ensure Python 3.11 matches Lambda)"
    sam build --parallel
fi

info "Build complete."
echo

# ── Deploy ────────────────────────────────────────────────────────────────────
info "Deploying to AWS..."

# If samconfig.toml exists from a previous guided deploy, SAM uses it automatically.
# The --parameter-overrides flags below override only what we set explicitly.
sam deploy \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --profile "${AWS_PROFILE}" \
    --capabilities CAPABILITY_IAM \
    --resolve-s3 \
    --parameter-overrides \
        "Environment=${ENVIRONMENT}" \
        "MiniMaxApiKey=${MINIMAX_API_KEY}" \
        "DashboardOrigin=${DASHBOARD_ORIGIN}" \
        "ExtensionDevMode=${EXTENSION_DEV_MODE:-false}" \
        "SessionTtlDays=${SESSION_TTL_DAYS:-30}" \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset

info "Deploy complete."
echo

# ── Show outputs ──────────────────────────────────────────────────────────────
info "Stack outputs:"
aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --profile "${AWS_PROFILE}" \
    --query "Stacks[0].Outputs[*].{Key:OutputKey,Value:OutputValue}" \
    --output table

echo
API_URL=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --profile "${AWS_PROFILE}" \
    --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" \
    --output text)

info "API base URL: ${API_URL}"
info "Health check: curl ${API_URL}health"
echo
info "Done! 🎉"
