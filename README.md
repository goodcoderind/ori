# Ori — study companion and learning analytics

Ori is a team-built learning prototype with a Chrome extension, a React analytics dashboard, and a FastAPI backend. It explores how interaction signals such as scrolling, typing cadence, and pauses can inform study prompts and session summaries.

Built at **HackTheEast 2026** in Hong Kong.

[Watch the demo](https://youtu.be/-s9hL-cPHy0) · [Original team repository](https://github.com/coderjs-lab/ori) · [API contract](backend/docs/API_CONTRACT.md)

## My contribution

I was the **Frontend Lead**: I built the React/TypeScript analytics dashboard, designed learner metrics and insight visualizations, and worked on the frontend–backend data contracts. This repository is a fork of our team project; the full team is credited below.

The dashboard includes session timelines, topic summaries, technique history, focus charts, onboarding, and a weekly review. Its API client handles user identifiers, request IDs, loading states, and backend errors.

## Explore the dashboard

The dashboard starts with illustrative local data, so you can inspect the interface without AWS credentials or an API key.

```bash
git clone https://github.com/goodcoderind/ori.git
cd ori/frontend
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

```bash
npm run build
npm run preview
```

**Demo data:** `VITE_USE_MOCK` defaults to `true`. The displayed study histories and learning metrics are examples, not evaluation results or records from a user study.

## What is in the repository

| Component | Implementation |
| --- | --- |
| [`frontend/`](frontend/) | React, TypeScript, Vite, Recharts, Tailwind CSS, and Axios; dashboard pages and API clients |
| [`extension-overlay/`](extension-overlay/) | Manifest V3 Chrome extension with a React overlay, local interaction telemetry, study cards, and a demo sequence |
| [`backend/`](backend/) | FastAPI/Pydantic API, Python policy rules, MiniMax question generation and answer scoring, DynamoDB storage, and pytest tests |
| [`shared/`](shared/) | Shared TypeScript API definitions and route constants |
| [`docs/`](docs/) | Integration notes and architecture documentation |

The backend selects study interventions with Python rules. MiniMax generates Socratic questions, short assessments, and scoring feedback. The extension's state labels are heuristic interpretations of interaction signals; their names do not establish validated cognitive-state detection or learning outcomes.

## Backend development

The backend requires Python 3.11+, AWS access for DynamoDB, and a MiniMax API key for model-backed endpoints.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"
cp .env.example .env
```

Configure `.env` with your MiniMax key and AWS region. Use your local AWS credential configuration or the documented environment variables. Set `DASHBOARD_ORIGIN=http://localhost:5173` if the dashboard uses Vite's default port.

```bash
# Creates the project's DynamoDB tables in the configured AWS account.
make tables

# Starts the API at http://localhost:8000.
make run
```

Interactive API documentation is available at `http://localhost:8000/docs`.

To connect the dashboard to this backend, create `frontend/.env.local`:

```dotenv
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:8000
```

Restart Vite after changing environment variables. The dashboard sends a locally generated UUID in the `X-User-Id` header. See the [backend guide](backend/README.md) for API usage and deployment configuration.

## Extension development

```bash
cd extension-overlay
npm install
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension-overlay/dist/`.

The extension can be inspected as a local UI/telemetry prototype. Its current background worker and chat path still use legacy `/chat` and `/signals` endpoints, which differ from the included FastAPI `/v1` API. Connecting the complete extension-to-dashboard flow requires further integration work; changing the backend URL alone does not resolve those route differences.

## Tests and checks

The backend includes tests for sessions, storage, dashboard endpoints, policy selection, Socratic questions, micro-assessments, and MiniMax JSON extraction.

```bash
cd backend
make test
make check
```

These commands are provided for reproduction; the README does not report a current passing-test count. The dashboard and extension each provide `npm run build` in their own directories.

## Prototype limits and data handling

- Dashboard preview mode uses mock data by default. End-to-end extension integration remains incomplete in this snapshot.
- `X-User-Id` is a client-supplied identifier, not a verified login system. Production authentication would require additional work.
- The extension collects interaction aggregates and accesses page context. Backend model endpoints can send page snippets or answer text to MiniMax, while profiles and session summaries use DynamoDB. This is not an entirely local application.
- Backend configuration rejects enabling raw-answer and page-context persistence. Those controls do not establish a provider retention policy or a measured privacy guarantee.
- Study-state labels, recommendations, and mastery summaries are experimental. This repository does not establish clinically validated inference or measured improvements in learning.

## Team

Five undergraduate students at **Mohamed bin Zayed University of Artificial Intelligence (MBZUAI)**, Abu Dhabi, UAE.

| Contributor | Role and contribution |
| --- | --- |
| **Harmanjot Singh** | Tech Lead — backend architecture, FastAPI, DynamoDB, AWS Lambda, policy engine, technique scoring, and MiniMax integration |
| **Abhra Dubey** | Frontend Lead — React/TypeScript analytics dashboard, learner metrics, insight visualizations, and frontend–backend data contracts |
| **Atharv Teg Rattan** | Extension Lead — Chrome extension, behavioral signal collection, and local state-classification implementation |
| **Anagha Rohit** | Research Lead and QA Engineer — academic research, learning-method literature, and end-to-end testing |
| **Ananthicha Vimalkumar** | Product and Design Lead — product concept, UX, Ori avatar, pitch materials, and user-facing testing |

The repository includes [supporting research and product documents](backend/docs/). Claims from those references should be distinguished from results measured on Ori itself.
