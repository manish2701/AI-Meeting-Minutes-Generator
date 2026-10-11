// api.js — backend integration layer.
//
// This module abstracts ALL communication with the optional Python backend.
// When window.APP_CONFIG.API_BASE_URL is empty, isConfigured() returns false and
// the app stays in local-only mode. No fake AI results are ever produced here.

const API = (function () {
    "use strict";

    const CONFIG = window.APP_CONFIG || {};
    const BASE_URL = (CONFIG.API_BASE_URL || "").replace(/\/+$/, "");
    const TIMEOUT_MS = CONFIG.API_TIMEOUT_MS || 60000;

    /** True only when a backend URL has been configured. */
    function isConfigured() {
        return typeof BASE_URL === "string" && BASE_URL.length > 0;
    }

    /**
     * fetch() with a hard timeout.
     * Rejects with an Error whose .message is safe to show to the user.
     */
    async function request(path, options) {
        if (!isConfigured()) {
            throw new Error("No backend configured. Set API_BASE_URL in assets/js/config.js");
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            const response = await fetch(BASE_URL + path, {
                ...options,
                signal: controller.signal,
                headers: {
                    "Content-Type": "application/json",
                    ...(options && options.headers),
                },
            });

            // Read the body once so we can report it on failure.
            let payload = null;
            const raw = await response.text();
            if (raw) {
                try {
                    payload = JSON.parse(raw);
                } catch (err) {
                    payload = { detail: raw.slice(0, 500) };
                }
            }

            if (!response.ok) {
                const detail =
                    (payload && (payload.detail || payload.error)) ||
                    `Request failed with HTTP ${response.status}`;
                const error = new Error(detail);
                error.status = response.status;
                throw error;
            }

            return payload;
        } catch (err) {
            if (err.name === "AbortError") {
                throw new Error(
                    `Request timed out after ${Math.round(TIMEOUT_MS / 1000)}s. ` +
                    "The backend may be busy or unreachable."
                );
            }
            if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
                throw new Error(
                    "Could not reach the backend. Check the URL and that the server is running."
                );
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * GET /health
     * Expected 200 response: { "status": "ok", "models": ["bart", "flan-t5"] }
     * Used by the backend connection status indicator.
     */
    function health() {
        return request("/health", { method: "GET" });
    }

    /**
     * POST /api/summarize
     *
     * Request body:
     * {
     *   "title":       string,            // meeting title (optional)
     *   "transcript":  string,            // REQUIRED, raw transcript text
     *   "method":      "bart"|"flan-t5",// optional, default "bart"
     *   "max_key_points": number,       // optional
     *   "max_decisions":  number,       // optional
     *   "max_actions":    number,       // optional
     *   "max_dates":      number        // optional
     * }
     *
     * Expected 200 response:
     * {
     *   "method": "bart",
     *   "key_points": ["..."],
     *   "decisions":  ["..."],
     *   "action_items": ["Speaker — task"],
     *   "dates": ["phrase — Speaker: context"],
     *   "participants": ["A", "B"],
     *   "summary": "optional narrative paragraph",
     *   "minutes_markdown": "# ...",
     *   "generated_at": "ISO-8601 timestamp"
     * }
     */
    function summarize(payload) {
        return request("/api/summarize", {
            method: "POST",
            body: JSON.stringify(payload),
        });
    }

    return {
        isConfigured,
        health,
        summarize,
        BASE_URL: BASE_URL,
    };
})();
