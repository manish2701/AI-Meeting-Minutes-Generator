# AI Meeting Minutes Generator — Frontend

A standalone static frontend for the AI Meeting Minutes Generator project.
Built with vanilla HTML, CSS, and JavaScript — no build step, no npm, no
dependencies.

## What the frontend does

- **Dashboard**: welcome overview, meeting statistics, recent meetings,
  quick-start instructions, and model/processing information.
- **New Meeting**: paste a transcript or upload a `.txt`/`.md` file, enter
  meeting metadata (title, date, participants, context), and configure the
  summarization method.
- **Results**: structured meeting minutes with Meeting Overview, Executive
  Summary (when supplied by a backend), Key Discussion Points, Decisions,
  Action Items, Dates/Deadlines, and Full Minutes. Includes copy, TXT/Markdown
  download, print, and local save.
- **Meeting History**: search, filter by date, open, rename, export, and
  delete locally saved meetings.
- **Settings**: backend URL configuration, connection test, theme toggle,
  local data management (export/import/clear).

## Local testing

The frontend is pure static files. Serve `frontend/` with any static server:

```bash
cd frontend
python3 -m http.server 8080
# then open http://localhost:8080/
```

Or open `frontend/index.html` directly in a browser (all assets use relative
paths, so file:// works too, though localStorage may be limited on some
browsers for file:// origins).

## GitHub Pages deployment

The repository deploys `frontend/` to GitHub Pages via a GitHub Actions
workflow (`.github/workflows/deploy-frontend.yml`).

**Required one-time repository setting change:**

1. Go to the repository **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
   (not "Deploy from a branch").
3. On the next push to `main` (or via **Actions → Deploy Frontend to
   GitHub Pages → Run workflow**), the workflow uploads `frontend/` as the
   Pages artifact and deploys it.

The site is published at:

**https://manish2701.github.io/AI-Meeting-Minutes-Generator/**

The workflow only publishes `frontend/` — model files (`.pt`), notebooks,
datasets, and other repository artifacts are never included in the Pages
artifact.

### Troubleshooting 404s

- Confirm the Pages source is set to **GitHub Actions** in Settings → Pages.
- Check the Actions tab for a successful "Deploy Frontend to GitHub Pages"
  run.
- The URL must include the repository name:
  `https://manish2701.github.io/AI-Meeting-Minutes-Generator/` (not
  `https://manish2701.github.io/`).
- All asset paths in the frontend are relative (`./assets/...`), so no
  `/`-rooted paths break under the project subpath.

## Backend integration

The frontend works fully **without** a backend (local-only mode, see below).
To enable AI summarization, deploy the Python backend separately and point
the frontend at it.

### Configuration

Edit `frontend/assets/js/config.js`:

```js
window.APP_CONFIG = {
    API_BASE_URL: "https://your-backend.example.com", // "" = local-only mode
    API_TIMEOUT_MS: 60000,
    // ...
};
```

An empty `API_BASE_URL` means no backend is configured. The same URL can also
be set at runtime in **Settings → Backend API URL** (stored in localStorage).

**Do not put API keys or secrets in `config.js` or localStorage.** If the
backend requires authentication, use a short-lived token obtained out-of-band
and attach it server-side, or proxy through an authenticated gateway.

### API contract

The frontend expects a JSON REST API:

#### `GET /health`

Response `200`:

```json
{ "status": "ok", "models": ["bart", "flan-t5"] }
```

Used by the backend connection status indicator and the Settings test button.

#### `POST /api/summarize`

Request body:

```json
{
  "title": "Weekly Team Sync",
  "transcript": "[0.0s - 2.5s] Alice: ...",
  "method": "bart",
  "max_output": 128
}
```

- `transcript` (string, required): raw transcript text.
- `method` (string, optional): `"bart"` or `"flan-t5"`.
- `max_output` (number, optional): max summary tokens.

Response `200`:

```json
{
  "method": "bart",
  "key_points": ["..."],
  "decisions": ["..."],
  "action_items": ["Alice — task description"],
  "dates": ["next week — Alice: prepare report"],
  "participants": ["Alice", "Bob"],
  "summary": "Optional narrative paragraph.",
  "generated_at": "2026-10-11T12:00:00Z"
}
```

All array fields are optional; the frontend renders "None identified" for
missing sections. A non-`summary` field means no Executive Summary section
is shown.

### Backend reference implementation

The project's Streamlit app (`app.py`) and the Jupyter notebooks
(`bart_meeting_summarizer_*.ipynb`, `flan_t5_meeting_summarizer_*.ipynb`)
contain the full summarization pipeline (fine-tuned `facebook/bart-large-cnn`
and `google/flan-t5-small`, loaded from `bart_model.pt` / `flan_t5_model.pt`).
To expose them, wrap the `build_minutes()` / `model_summarize()` logic from
those notebooks in a small FastAPI/Flask service implementing the two
endpoints above. The frontend does not load `.pt` files and cannot run Python.

### CORS

The backend must allow cross-origin requests from the Pages site:

```
Access-Control-Allow-Origin: https://manish2701.github.io
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

(Or `*` during development.) Without CORS headers, the browser will block
requests and the frontend will show a network error message.

## Features without a backend (local-only mode)

When `API_BASE_URL` is empty:

- Enter/paste a transcript and preview it.
- Enter meeting metadata.
- Upload `.txt` / `.md` transcript files (type and 10 MB size validated).
- **Rule-based minutes extraction** — a faithful port of the deterministic
  extraction logic from the project notebooks (Key Points, Decisions, Action
  Items, Dates). Results are explicitly labeled
  **"Rule-based extraction (no backend)"** and are **not** presented as AI
  output.
- Save meetings locally (localStorage), browse/search/filter history,
  rename, delete, export as Markdown, and import previously exported JSON.
- Theme switching and all settings.

## Features that require a backend

- AI summarization with the fine-tuned BART / FLAN-T5 models.
- Neural executive summaries (`summary` field).
- Connection testing against a live service.

If **Generate Meeting Minutes** is clicked with no backend configured, the
app runs the local rule-based extraction and clearly labels the result — it
never fabricates an "AI" result.

## Data storage

Meetings and settings are stored in the browser's `localStorage` on the
current device only. Data is **not** synchronized across devices and is lost
if the browser storage is cleared. Use **Settings → Export All Meetings** to
keep a backup, and **Import Meetings** to restore it.

## Security notes

- No credentials or secrets are stored or transmitted by the frontend.
- User-generated content is HTML-escaped before rendering; no `innerHTML`
  injection of untrusted text.
- File uploads are restricted to text formats and size-limited.
- Trained model files are never bundled with the frontend.
