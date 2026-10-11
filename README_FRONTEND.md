# DL Mini Project Frontend

Single-file Streamlit app (`app.py`) for viewing and generating meeting summaries.

## Run locally

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Deployment

The app is GitHub-compatible: it only reads existing artifacts (`dataset/`, `outputs/`, `*.pt` models) and writes nothing.
Push to any host that supports `streamlit run app.py` (Streamlit Community Cloud, Hugging Face Spaces, etc.).

## Tabs

- **Overview**: dataset metrics and pipeline diagram
- **Transcripts**: browse raw Whisper/AssemblyAI transcripts
- **Generated Summaries**: view pre-made summaries from the notebooks
- **Summarize (model)**: run BART or FLAN-T5 on a transcript and see the output

## Notes

- Model inference downloads weights from Hugging Face on first run (~500 MB for BART, ~300 MB for FLAN-T5).
- CPU-only by default; for GPU add `torch.device` logic in `load_summarizer`.
- No modification of existing files; safe for version control.
