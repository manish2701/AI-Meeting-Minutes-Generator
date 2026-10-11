// Public frontend configuration.
//
// API_BASE_URL controls backend integration.
//   - "" (empty)  -> no backend configured; the app runs in local-only mode.
//   - "http://..." -> a separately deployed Python backend that implements the
//                     API contract documented in frontend/README.md.
//
// Do NOT put API keys or secrets here. This file is public on GitHub Pages.
window.APP_CONFIG = {
    API_BASE_URL: "",

    // Request timeout in milliseconds for backend calls.
    API_TIMEOUT_MS: 60000,

    // Maximum transcript file size accepted for local (client-side) reading.
    MAX_LOCAL_FILE_BYTES: 10 * 1024 * 1024, // 10 MB

    // Summarization methods advertised to the backend.
    // "bart"    -> facebook/bart-large-cnn  (bart_model.pt)
    // "flan-t5" -> google/flan-t5-small     (flan_t5_model.pt)
    METHODS: ["bart", "flan-t5"],

    // Application metadata (static, safe to expose publicly).
    APP_NAME: "AI Meeting Minutes Generator",
    APP_VERSION: "1.0.0",
};
