"""Streamlit frontend for the Deep-Learning Mini Project (meeting summarization).

Run:  streamlit run app.py
GitHub-compatible: single .py file, no new folder, reads existing artifacts only:
  dataset/metadata.csv, dataset/references/**, outputs/**, bart_model.pt, flan_t5_model.pt
"""

import glob
import os
import re

import streamlit as st

ROOT = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------- artifacts
@st.cache_data
def read_metadata():
    import csv

    path = os.path.join(ROOT, "dataset", "metadata.csv")
    if not os.path.isfile(path):
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


@st.cache_data
def read_text(path):
    try:
        with open(path, encoding="utf-8", errors="ignore") as f:
            return f.read()
    except OSError:
        return ""


def relative(path):
    return os.path.relpath(path, ROOT)


def artifact_dirs():
    """{engine: {model: {split: [summary paths]}}} from outputs/"""
    tree = {}
    for model_dir in ("BART", "Flan-T5"):
        for engine_dir in ("assemblyai", "whisper"):
            d = os.path.join(ROOT, "outputs", model_dir, engine_dir)
            files = sorted(glob.glob(os.path.join(d, "*_summary.txt")))
            if files:
                tree.setdefault(engine_dir, {}).setdefault(model_dir, {})["all"] = files
    return tree


# ------------------------------------------------------- minutes (from notebooks)
def parse_transcript(text):
    """'[7.19s - 8.22s] A: line' -> records."""
    records = []
    pattern = re.compile(r"^\[([\d.]+)s\s*-\s*([\d.]+)s\]\s*([^:]+):\s*(.*)$", re.M)
    for m in pattern.finditer(text):
        records.append(
            {"start": float(m.group(1)), "end": float(m.group(2)),
             "speaker": m.group(3).strip(), "body": m.group(4).strip()}
        )
    return records


def split_minutes(text):
    """Split a generated *_summary.txt into its sections."""
    sections = {}
    current = None
    headers = ("KEY POINTS", "DECISIONS", "ACTION ITEMS", "IMPORTANT DATES / DEADLINES")
    for line in text.splitlines():
        header = line.strip()
        if header in headers:
            current = header
            sections.setdefault(current, [])
            continue
        if current is None:
            continue
        if not line.strip() or re.fullmatch(r"-+", line.strip()):
            continue
        bullet = re.sub(r"^[•\-*]\s*", "", line.strip())
        if bullet:
            sections[current].append(bullet)
    return sections


# ------------------------------------------------------------------ summarizer
@st.cache_resource
def load_summarizer(model_key):
    """Load the fine-tuned seq2seq model exactly like bart/flan_t5_training.ipynb."""
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    cfg = {
        "BART": ("facebook/bart-large-cnn", "bart_model.pt"),
        "Flan-T5": ("google/flan-t5-small", "flan_t5_model.pt"),
    }[model_key]
    model_name, weights = cfg
    device = torch.device("cpu")  # shortcut: CPU-only; add mps/cuda check for local GPU
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    state = torch.load(os.path.join(ROOT, weights), map_location=device)
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    return tokenizer, model


def model_summarize(model_key, transcript, max_input=1024, max_output=128):
    tokenizer, model = load_summarizer(model_key)
    inputs = tokenizer(
        "summarize: " + transcript, return_tensors="pt",
        max_length=max_input, truncation=True,
    )
    summary_ids = model.generate(
        inputs["input_ids"], attention_mask=inputs["attention_mask"],
        num_beams=4, max_length=max_output, early_stopping=True,
    )
    return tokenizer.decode(summary_ids[0], skip_special_tokens=True)


# ---------------------------------------------------------------------- page
def main():
    st.set_page_config(page_title="Meeting Summarizer — DL Mini Project", layout="wide")
    st.title("🎙️ Meeting Summarizer — DL Mini Project")
    st.caption(
        "Audio → transcription (Whisper / AssemblyAI) → summarization (fine-tuned BART / FLAN-T5). "
        "Built with Streamlit; deploys to GitHub Pages-compatible static hosting or any `streamlit run app.py` host."
    )

    meta = read_metadata()

    tab_overview, tab_transcripts, tab_summaries, tab_generate = st.tabs(
        ["Overview", "Transcripts", "Generated Summaries", "Summarize (model)"]
    )

    # ---- Overview -------------------------------------------------------
    with tab_overview:
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Meetings", len(meta))
        if meta:
            c2.metric("Corpora", len({r.get("corpus", "?") for r in meta}))
            c3.metric("Speakers (total)", sum(int(r.get("num_speakers") or 0) for r in meta))
            c4.metric("Audio (min)", round(sum(float(r.get("duration_min") or 0) for r in meta), 1))
        st.subheader("Pipeline")
        st.write(
            "1. **Preprocessing** (`preprocessing.ipynb`) — `dataset/raw/` → `dataset/processed/` WAV\n"
            "2. **Transcription** — `outputs/assemblyai/` (AssemblyAI) and `outputs/whisper/` (Whisper)\n"
            "3. **Summarization** — fine-tuned `bart_model.pt` / `flan_t5_model.pt` → `outputs/{BART,Flan-T5}/`"
        )
        if meta:
            st.dataframe(meta, width="stretch")

    # ---- Transcripts --------------------------------------------------
    with tab_transcripts:
        engines = ["assemblyai", "whisper"]
        engine = st.radio("Transcription engine", engines, horizontal=True)
        transcripts = sorted(glob.glob(os.path.join(ROOT, "outputs", engine, "transcripts", "*.txt")))
        if not transcripts:
            st.warning(f"No transcripts under outputs/{engine}/transcripts/")
            return
        names = [os.path.splitext(os.path.basename(p))[0] for p in transcripts]
        name = st.selectbox("Meeting", names)
        path = dict(zip(names, transcripts))[name]
        text = read_text(path)
        records = parse_transcript(text)
        st.info(f"{len(records)} utterances • {relative(path)}")
        if records:
            speakers = sorted({r["speaker"] for r in records})
            keep = st.multiselect("Speakers", speakers, default=speakers)
            records = [r for r in records if r["speaker"] in keep]
        view = st.radio("View", ["Dialogue", "Plain text"], horizontal=True)
        if view == "Dialogue":
            for r in records:
                st.markdown(f"**{r['speaker']}** `{r['start']:.1f}s` — {r['body']}")
        else:
            st.code(text)

    # ---- Generated summaries ------------------------------------------
    with tab_summaries:
        tree = artifact_dirs()
        if not tree:
            st.warning("No generated summaries found under outputs/")
            return
        engine = st.selectbox("Engine", list(tree))
        model = st.selectbox("Model", list(tree[engine]))
        files = tree[engine][model]["all"]
        names = [os.path.basename(p).replace("_summary.txt", "") for p in files]
        name = st.selectbox("Meeting", names, key="sum_sel")
        path = dict(zip(names, files))[name]
        text = read_text(path)
        sections = split_minutes(text)
        for section, items in sections.items():
            with st.expander(f"**{section}** ({len(items)})", expanded=(section == "KEY POINTS")):
                for item in items:
                    st.markdown(f"• {item}")
        with st.expander("Raw minutes file"):
            st.code(text)

    # ---- Summarize (model) --------------------------------------------
    with tab_generate:
        st.subheader("Run a fine-tuned model on a transcript")
        model_key = st.radio("Model", ["BART", "Flan-T5"], horizontal=True)
        engine = st.radio("Transcript source", ["assemblyai", "whisper"], horizontal=True, key="gen_src")
        transcripts = sorted(glob.glob(os.path.join(ROOT, "outputs", engine, "transcripts", "*.txt")))
        if not transcripts:
            st.warning(f"No transcripts under outputs/{engine}/transcripts/")
            return
        names = [os.path.splitext(os.path.basename(p))[0] for p in transcripts]
        name = st.selectbox("Meeting", names, key="gen_sel")
        transcript = read_text(dict(zip(names, transcripts))[name])
        max_len = st.slider("Max summary tokens", 64, 256, 128)
        if st.button("Generate summary", type="primary"):
            with st.spinner(f"Running {model_key} on {name}…"):
                try:
                    out = model_summarize(model_key, transcript, max_output=max_len)
                    st.success(out)
                except Exception as e:
                    st.error(f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
