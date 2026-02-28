.PHONY: install run test lint format check clean tables smoke

# ── Install ──────────────────────────────────────────────────────────────────
install:
	pip install -e ".[dev]"

# ── Dev server ───────────────────────────────────────────────────────────────
run:
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# ── Tests ─────────────────────────────────────────────────────────────────────
test:
	pytest -v --cov=app --cov-report=term-missing

test-fast:
	pytest -v -x

# ── Linting & formatting ──────────────────────────────────────────────────────
lint:
	ruff check app tests

format:
	black app tests
	ruff check --fix app tests

# CI: lint + format-check without modifying files
check:
	black --check app tests
	ruff check app tests

# ── DynamoDB setup (run once before first use) ────────────────────────────────
tables:
	bash scripts/create_tables.sh

# ── End-to-end smoke test ─────────────────────────────────────────────────────
smoke:
	bash scripts/e2e_smoke_test.sh

# ── Cleanup ───────────────────────────────────────────────────────────────────
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache"   -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete
	rm -rf .coverage htmlcov dist build *.egg-info
