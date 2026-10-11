# AI Meeting Minutes Generator — Project Showcase

A single-page static website that presents the Deep Learning mini project:
meeting summarization using fine-tuned **BART** and **FLAN-T5** models.

The site showcases the project's **actual outputs** — real transcripts and
generated meeting minutes from the repository — with no backend, no build
step, and no JavaScript dependencies.

## Local testing

Serve the `frontend/` folder with any static server:

```bash
cd frontend
python3 -m http.server 8080
# open http://localhost:8080/
```

Or open `frontend/index.html` directly in a browser (the page uses only
relative paths, so `file://` works too, though `fetch()` of
`examples.json` may be blocked on some browsers — use a local server for
the full experience).

## GitHub Pages deployment

The repository publishes `frontend/` to GitHub Pages via
`.github/workflows/deploy-pages.yml`.

**Required one-time repository setting:**

1. Go to the repository **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
   (not "Deploy from a branch").
3. On the next push to `main` (or via **Actions → Deploy Frontend to
   GitHub Pages → Run workflow**), the workflow uploads `frontend/` as
   the Pages artifact and deploys it.

The site is published at:

**https://manish2701.github.io/AI-Meeting-Minutes-Generator/**

Only the contents of `frontend/` are published — model weights (`.pt`),
notebooks, datasets, and other repository artifacts are excluded.

### Troubleshooting 404s

- Confirm Pages source is set to **GitHub Actions** in Settings → Pages.
- Check the Actions tab for a successful "Deploy Frontend to GitHub Pages" run.
- The URL must include the repository name:
  `https://manish2701.github.io/AI-Meeting-Minutes-Generator/`
- All asset paths are relative (`./assets/...`), so no `/`-rooted paths
  break under the project subpath.

## What the site shows

| Section | Content |
|---|---|
| Hero | Project title, problem statement, badges, hero illustration |
| Project Overview | Problem, approach, benefit cards |
| Pipeline | 5-stage processing pipeline (audio → minutes) |
| Models & Stack | BART, FLAN-T5, Whisper, AssemblyAI cards + tech badges |
| Results Showcase | 4 real transcript/minute pairings (AssemblyAI/Whisper × BART/FLAN-T5) |
| Sample Demonstration | Before/after excerpt with actual output |
| Architecture | Input → preprocessing → transcription → summarization → output |
| Findings | Transcription quality, model output quality, structure, limitations |
| Limitations & Future Scope | Current limits vs. proposed improvements |
| Footer | Project name, description, GitHub link |

## Data sources for the results section

All examples are read from the repository at build time and stored in
`frontend/assets/data/examples.json`:

- `outputs/assemblyai/transcripts/MTG_32040.txt` — AssemblyAI transcript
- `outputs/whisper/transcripts/MTG_32040.txt` — Whisper transcript
- `outputs/BART/assemblyai/MTG_32040_summary.txt` — BART minutes
- `outputs/Flan-T5/assemblyai/MTG_32040_summary.txt` — FLAN-T5 minutes
- `outputs/assemblyai/assemblyai_summary.csv` — transcription stats

No synthetic or fabricated results are displayed.

## Notes

- The site is fully static; no Python, PyTorch, or `.pt` files are
  loaded or executed in the browser.
- No API keys or credentials are stored or transmitted.
- Dark theme by default; responsive down to mobile widths.
- Vanilla HTML/CSS/JS only — no npm, no build step, no dependencies
  beyond Google Fonts (graceful fallback to system fonts if offline).
