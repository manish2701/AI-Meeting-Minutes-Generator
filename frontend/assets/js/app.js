// app.js — main application controller
(function () {
    "use strict";

    const CONFIG = window.APP_CONFIG || {};
    const STORAGE_KEY = "amm_meetings";
    const SETTINGS_KEY = "amm_settings";

    // ---- utilities -------------------------------------------------
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    function escapeHTML(str) {
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function toast(message, type) {
        type = type || "info";
        const existing = $(".toast");
        if (existing) existing.remove();
        const el = document.createElement("div");
        el.className = "toast toast-" + type;
        el.setAttribute("role", "status");
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4200);
    }

    function download(filename, content, mime) {
        const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function wordCount(text) {
        return String(text || "").trim().split(/\s+/).filter(Boolean).length;
    }

    // ---- storage ----------------------------------------------------
    function loadMeetings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const data = JSON.parse(raw);
            return Array.isArray(data) ? data : [];
        } catch (err) {
            console.warn("Failed to load meetings", err);
            return [];
        }
    }

    function saveMeetings(meetings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
            return true;
        } catch (err) {
            toast("Could not save to local storage: " + err.message, "error");
            return false;
        }
    }

    function loadSettings() {
        const defaults = { theme: "light", backendUrl: "" };
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return defaults;
            return { ...defaults, ...JSON.parse(raw) };
        } catch (err) {
            return defaults;
        }
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (err) {
            console.warn("Failed to save settings", err);
        }
    }

    // ---- state ------------------------------------------------------
    const state = {
        meetings: loadMeetings(),
        settings: loadSettings(),
        currentResult: null,
        currentTranscript: "",
        currentMeta: {},
    };

    // ---- theme ------------------------------------------------------
    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        state.settings.theme = theme;
        saveSettings(state.settings);
        const checkbox = $("#theme-preference");
        if (checkbox) checkbox.checked = theme === "dark";
    }

    function initTheme() {
        const saved = state.settings.theme;
        const prefersDark =
            window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        applyTheme(saved || (prefersDark ? "dark" : "light"));
    }

    // ---- navigation -------------------------------------------------
    const VIEWS = ["dashboard", "new-meeting", "results", "history", "settings"];
    const TITLES = {
        "dashboard": "Dashboard",
        "new-meeting": "New Meeting",
        "results": "Meeting Minutes",
        "history": "Meeting History",
        "settings": "Settings",
    };

    function showView(name) {
        if (!VIEWS.includes(name)) name = "dashboard";
        $$(".view").forEach((v) => v.classList.remove("active"));
        const view = $("#view-" + name);
        if (view) view.classList.add("active");
        $$(".nav-item").forEach((n) => {
            n.classList.toggle("active", n.getAttribute("data-view") === name);
        });
        $("#page-title").textContent = TITLES[name] || "Dashboard";
        if (name === "history") renderHistory();
        if (name === "dashboard") renderDashboard();
    }

    function toggleSidebar() {
        document.getElementById("app").classList.toggle("sidebar-collapsed");
    }

    // ---- dashboard --------------------------------------------------
    function renderDashboard() {
        const meetings = state.meetings;
        $("#total-meetings").textContent = meetings.length;
        const withMinutes = meetings.filter((m) => m.minutes).length;
        $("#saved-summaries").textContent = withMinutes;
        const recent = meetings.slice(0, 5);
        $("#recent-count").textContent = recent.length;
        $("#models-available").textContent = (CONFIG.METHODS || []).length;

        const list = $("#recent-meetings-list");
        if (!recent.length) {
            list.innerHTML = '<p class="empty-state">No meetings yet. Create your first meeting to get started.</p>';
        } else {
            list.innerHTML = recent.map((m) => `
                <div class="meeting-card" data-id="${escapeAttr(m.id)}">
                    <div class="meeting-card-title">${escapeHTML(m.title || "Untitled Meeting")}</div>
                    <div class="meeting-card-meta">
                        ${escapeHTML(m.date || "No date")}
                        ${m.minutes ? " • Has minutes" : ""}
                    </div>
                </div>`).join("");
            list.querySelectorAll(".meeting-card").forEach((card) => {
                card.addEventListener("click", () => {
                    const meeting = state.meetings.find((m) => m.id === card.getAttribute("data-id"));
                    if (meeting) openMeeting(meeting);
                });
            });
        }
    }

    // ---- new meeting form -------------------------------------------
    function updateTranscriptStats() {
        const text = $("#transcript-input").value;
        state.currentTranscript = text;
        $("#transcript-stats").textContent =
            text.length + " characters • " + wordCount(text) + " words";
        const preview = $("#transcript-preview");
        if (text.trim()) {
            preview.innerHTML =
                '<div class="preview-label">Transcript Preview</div>' +
                '<div class="preview-text">' + escapeHTML(text.slice(0, 400)) +
                (text.length > 400 ? "…" : "") + "</div>";
        } else {
            preview.innerHTML = "";
        }
    }

    function handleFileUpload(file) {
        if (!file) return;
        const maxBytes = CONFIG.MAX_LOCAL_FILE_BYTES || 10 * 1024 * 1024;
        const okTypes = ["text/plain", "text/markdown"];
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        if (!okTypes.includes(file.type) && !["txt", "md"].includes(ext)) {
            toast("Unsupported file type. Please upload a .txt or .md file.", "error");
            return;
        }
        if (file.size > maxBytes) {
            toast("File is too large. Maximum size is " + Math.round(maxBytes / 1024 / 1024) + " MB.", "error");
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            $("#transcript-input").value = String(e.target.result || "");
            updateTranscriptStats();
            toast("Transcript loaded from " + file.name, "success");
        };
        reader.onerror = () => toast("Could not read file.", "error");
        reader.readAsText(file);
    }

    function setFormStatus(message, type) {
        const el = $("#form-status");
        el.className = "form-status " + (type || "");
        el.textContent = message || "";
    }

    async function handleGenerate(e) {
        e.preventDefault();
        const transcript = $("#transcript-input").value.trim();
        const title = $("#meeting-title").value.trim() || "Untitled Meeting";

        if (!transcript) {
            setFormStatus("Please enter or upload a meeting transcript first.", "error");
            toast("Transcript is required.", "error");
            return;
        }
        if (wordCount(transcript) < 10) {
            setFormStatus("Transcript looks too short to summarize (minimum ~10 words).", "error");
            return;
        }

        const method = $("#summarization-method").value;
        const meta = {
            title: title,
            date: $("#meeting-date").value || new Date().toISOString().slice(0, 10),
            participants: $("#participants").value
                .split(",").map((s) => s.trim()).filter(Boolean),
            context: $("#meeting-context").value.trim(),
            method: method,
            max_output: parseInt($("#max-output").value, 10) || 128,
        };

        const btn = $("#generate-minutes");
        btn.disabled = true;
        btn.classList.add("loading");
        setFormStatus("Processing…", "info");

        try {
            let result;
            if (API.isConfigured()) {
                // Real backend inference.
                setFormStatus("Sending transcript to backend…", "info");
                result = await API.summarize({
                    title: meta.title,
                    transcript: transcript,
                    method: method,
                    max_output: meta.max_output,
                });
                result.source = "backend";
            } else {
                // Local-only: deterministic rule-based extraction (NOT neural AI).
                setFormStatus("No backend configured — running local rule-based extraction…", "info");
                result = Summarizer.extractMinutes(transcript);
                result.source = "local-rule-based";
            }

            state.currentResult = result;
            state.currentTranscript = transcript;
            state.currentMeta = meta;
            renderResults(result, meta, transcript);
            showView("results");
            setFormStatus("");
            toast("Minutes generated (" + result.source + ").", "success");
        } catch (err) {
            const msg = err && err.message ? err.message : "Unknown error";
            setFormStatus("Error: " + msg, "error");
            toast("Generation failed: " + msg, "error");
        } finally {
            btn.disabled = false;
            btn.classList.remove("loading");
        }
    }

    // ---- results ----------------------------------------------------
    function section(title, items, editable) {
        if (!items || !items.length) {
            return '<section class="result-section"><h3>' + escapeHTML(title) +
                '</h3><p class="empty-state">None identified.</p></section>';
        }
        const list = items.map((item, i) =>
            '<li contenteditable="' + (editable ? "true" : "false") +
            '" data-index="' + i + '">' + escapeHTML(item) + "</li>"
        ).join("");
        return '<section class="result-section"><h3>' + escapeHTML(title) +
            '</h3><ul class="result-list">' + list + "</ul></section>";
    }

    function renderResults(result, meta, transcript) {
        $("#results-title").textContent = meta.title || "Meeting Minutes";

        const sourceLabel = result.source === "backend"
            ? "AI-generated (" + escapeHTML(result.method || "model") + ")"
            : "Rule-based extraction (no backend)";

        let html = "";
        html += '<div class="result-banner ' + (result.source === "backend" ? "banner-ai" : "banner-local") + '">' +
            "<strong>Source:</strong> " + sourceLabel +
            " — results are " + (result.source === "backend" ? "generated by the configured model." :
            "extracted with local rules and are NOT neural AI output.") + "</div>";

        // 1. Meeting Overview
        html += '<section class="result-section"><h3>1. Meeting Overview</h3><dl class="overview">' +
            "<dt>Title</dt><dd>" + escapeHTML(meta.title || "—") + "</dd>" +
            "<dt>Date</dt><dd>" + escapeHTML(meta.date || "—") + "</dd>" +
            "<dt>Participants</dt><dd>" +
            (meta.participants && meta.participants.length
                ? escapeHTML(meta.participants.join(", "))
                : (result.participants && result.participants.length
                    ? escapeHTML(result.participants.join(", ")) : "—")) + "</dd>" +
            (meta.context ? "<dt>Context</dt><dd>" + escapeHTML(meta.context) + "</dd>" : "") +
            "</dl></section>";

        // 2. Executive Summary (only when the backend supplies one)
        if (result.summary) {
            html += '<section class="result-section"><h3>2. Executive Summary</h3>' +
                '<p class="editable" contenteditable="true">' + escapeHTML(result.summary) + "</p></section>";
        }

        // 3-6. Structured sections
        html += section("3. Key Discussion Points", result.key_points, true);
        html += section("4. Decisions Made", result.decisions, true);
        html += section("5. Action Items", result.action_items, true);
        if (result.dates && result.dates.length) {
            html += section("Important Dates / Deadlines", result.dates, true);
        }

        // 7. Full minutes
        const minutesText = buildMinutesText(result, meta);
        html += '<section class="result-section"><h3>7. Full Meeting Minutes</h3>' +
            '<pre class="minutes-text">' + escapeHTML(minutesText) + "</pre></section>";

        $("#results-content").innerHTML = html;
    }

    function buildMinutesText(result, meta) {
        const lines = [];
        lines.push("MEETING MINUTES");
        lines.push("=".repeat(60));
        lines.push("Title: " + (meta.title || "Untitled"));
        lines.push("Date: " + (meta.date || ""));
        if (meta.participants && meta.participants.length) {
            lines.push("Participants: " + meta.participants.join(", "));
        }
        lines.push("Source: " + (result.source === "backend"
            ? "AI (" + (result.method || "model") + ")"
            : "Local rule-based extraction"));
        lines.push("");
        lines.push("KEY POINTS");
        lines.push("-".repeat(20));
        (result.key_points && result.key_points.length
            ? result.key_points : ["No clear key points identified."])
            .forEach((i) => lines.push("• " + i));
        lines.push("", "DECISIONS", "-".repeat(20));
        (result.decisions && result.decisions.length
            ? result.decisions : ["No explicit decisions identified."])
            .forEach((i) => lines.push("• " + i));
        lines.push("", "ACTION ITEMS", "-".repeat(20));
        (result.action_items && result.action_items.length
            ? result.action_items : ["No explicit action items identified."])
            .forEach((i) => lines.push("• " + i));
        if (result.dates && result.dates.length) {
            lines.push("", "IMPORTANT DATES / DEADLINES", "-".repeat(30));
            result.dates.forEach((i) => lines.push("• " + i));
        }
        return lines.join("\n") + "\n";
    }

    function buildMinutesMarkdown(result, meta) {
        const lines = [];
        lines.push("# " + (meta.title || "Meeting Minutes"));
        lines.push("");
        lines.push("**Date:** " + (meta.date || ""));
        if (meta.participants && meta.participants.length) {
            lines.push("**Participants:** " + meta.participants.join(", "));
        }
        lines.push("**Source:** " + (result.source === "backend"
            ? "AI (" + (result.method || "model") + ")"
            : "Local rule-based extraction"));
        lines.push("");
        if (result.summary) {
            lines.push("## Executive Summary", "", result.summary, "");
        }
        lines.push("## Key Discussion Points", "");
        (result.key_points && result.key_points.length
            ? result.key_points : ["No clear key points identified."])
            .forEach((i) => lines.push("- " + i));
        lines.push("", "## Decisions Made", "");
        (result.decisions && result.decisions.length
            ? result.decisions : ["No explicit decisions identified."])
            .forEach((i) => lines.push("- " + i));
        lines.push("", "## Action Items", "");
        (result.action_items && result.action_items.length
            ? result.action_items : ["No explicit action items identified."])
            .forEach((i) => lines.push("- " + i));
        if (result.dates && result.dates.length) {
            lines.push("", "## Important Dates / Deadlines", "");
            result.dates.forEach((i) => lines.push("- " + i));
        }
        return lines.join("\n") + "\n";
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => toast("Copied to clipboard.", "success"))
                .catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand("copy");
            toast("Copied to clipboard.", "success");
        } catch (err) {
            toast("Copy failed. Please select and copy manually.", "error");
        }
        ta.remove();
    }

    function saveCurrentMeeting() {
        if (!state.currentResult) {
            toast("Nothing to save yet.", "error");
            return;
        }
        const meeting = {
            id: uid(),
            title: state.currentMeta.title || "Untitled Meeting",
            date: state.currentMeta.date || new Date().toISOString().slice(0, 10),
            participants: state.currentMeta.participants || [],
            context: state.currentMeta.context || "",
            transcript: state.currentTranscript,
            minutes: buildMinutesText(state.currentResult, state.currentMeta),
            markdown: buildMinutesMarkdown(state.currentResult, state.currentMeta),
            result: state.currentResult,
            source: state.currentResult.source,
            created_at: new Date().toISOString(),
        };
        state.meetings.unshift(meeting);
        if (saveMeetings(state.meetings)) {
            toast("Meeting saved locally.", "success");
            renderDashboard();
        }
    }

    function openMeeting(meeting) {
        state.currentResult = meeting.result || {
            key_points: [], decisions: [], action_items: [], dates: [],
            participants: meeting.participants || [],
            method: "local-rule-based",
        };
        state.currentTranscript = meeting.transcript || "";
        state.currentMeta = {
            title: meeting.title,
            date: meeting.date,
            participants: meeting.participants || [],
            context: meeting.context || "",
            method: "local-rule-based",
        };
        renderResults(state.currentResult, state.currentMeta, state.currentTranscript);
        showView("results");
    }

    // ---- history ----------------------------------------------------
    function renderHistory() {
        const query = ($("#history-search").value || "").toLowerCase().trim();
        const filter = $("#history-date-filter").value;

        let meetings = state.meetings.slice();

        if (filter === "today") {
            const today = new Date().toISOString().slice(0, 10);
            meetings = meetings.filter((m) => (m.date || "").slice(0, 10) === today);
        } else if (filter === "week") {
            const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            meetings = meetings.filter((m) => new Date(m.created_at) >= weekAgo);
        } else if (filter === "month") {
            const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
            meetings = meetings.filter((m) => new Date(m.created_at) >= monthAgo);
        }

        if (query) {
            meetings = meetings.filter((m) =>
                (m.title || "").toLowerCase().includes(query) ||
                (m.transcript || "").toLowerCase().includes(query) ||
                (m.participants || []).join(" ").toLowerCase().includes(query)
            );
        }

        const list = $("#history-list");
        if (!meetings.length) {
            list.innerHTML = '<p class="empty-state">' +
                (state.meetings.length
                    ? "No meetings match your search or filters."
                    : "No saved meetings yet. Generate minutes and save them here.") +
                "</p>";
            return;
        }

        list.innerHTML = meetings.map((m) => `
            <div class="history-card" data-id="${escapeAttr(m.id)}">
                <div class="history-card-main">
                    <div class="history-card-title">${escapeHTML(m.title || "Untitled Meeting")}</div>
                    <div class="history-card-meta">
                        <span>${escapeHTML(m.date || "")}</span>
                        ${m.participants && m.participants.length
                            ? "<span>• " + escapeHTML(m.participants.join(", ")) + "</span>"
                            : ""}
                        ${m.source ? "<span class=\"badge\">" + escapeHTML(m.source) + "</span>" : ""}
                    </div>
                </div>
                <div class="history-card-actions">
                    <button class="btn btn-sm btn-outline" data-action="open">Open</button>
                    <button class="btn btn-sm btn-outline" data-action="rename">Rename</button>
                    <button class="btn btn-sm btn-outline" data-action="export">Export</button>
                    <button class="btn btn-sm btn-danger" data-action="delete">Delete</button>
                </div>
            </div>`).join("");

        list.querySelectorAll(".history-card").forEach((card) => {
            const id = card.getAttribute("data-id");
            const meeting = state.meetings.find((m) => m.id === id);
            if (!meeting) return;
            card.querySelectorAll("[data-action]").forEach((btn) => {
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const action = btn.getAttribute("data-action");
                    if (action === "open") openMeeting(meeting);
                    else if (action === "rename") renameMeeting(meeting);
                    else if (action === "export") exportMeeting(meeting);
                    else if (action === "delete") deleteMeeting(meeting);
                });
            });
            card.addEventListener("click", () => openMeeting(meeting));
        });
    }

    function renameMeeting(meeting) {
        const name = window.prompt("Rename meeting:", meeting.title || "");
        if (name === null) return;
        const trimmed = name.trim();
        if (!trimmed) {
            toast("Name cannot be empty.", "error");
            return;
        }
        meeting.title = trimmed;
        saveMeetings(state.meetings);
        renderHistory();
        renderDashboard();
        toast("Meeting renamed.", "success");
    }

    function exportMeeting(meeting) {
        const content = meeting.markdown || meeting.minutes ||
            buildMinutesText(meeting.result || {}, meeting);
        const safeName = (meeting.title || "meeting")
            .replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 60);
        download(safeName + "_minutes.md", content, "text/markdown;charset=utf-8");
        toast("Exported " + safeName + "_minutes.md", "success");
    }

    function deleteMeeting(meeting) {
        const ok = window.confirm(
            "Delete \"" + (meeting.title || "Untitled Meeting") +
            "\"? This cannot be undone."
        );
        if (!ok) return;
        state.meetings = state.meetings.filter((m) => m.id !== meeting.id);
        saveMeetings(state.meetings);
        renderHistory();
        renderDashboard();
        toast("Meeting deleted.", "success");
    }

    // ---- settings ---------------------------------------------------
    function renderSettings() {
        $("#backend-url").value = state.settings.backendUrl || "";
        updateBackendUI();
    }

    function updateBackendUI() {
        const configured = API.isConfigured();
        const indicator = $("#backend-status");
        const statusEl = $("#backend-connection-status");
        if (indicator) {
            indicator.innerHTML =
                '<div class="status-indicator ' + (configured ? "online" : "offline") + '"></div>' +
                "<span>Backend: " + (configured ? "Configured" : "Not Configured") + "</span>";
        }
        if (statusEl) {
            statusEl.textContent = configured
                ? "Configured — " + escapeHTML(API.BASE_URL)
                : "Not configured (local-only mode)";
        }
        const methods = $("#backend-methods-list");
        if (methods) {
            methods.innerHTML = configured
                ? (CONFIG.METHODS || []).map((m) => "<li>" + escapeHTML(m) + "</li>").join("")
                : "<li>Configure a backend URL to enable AI summarization methods.</li>";
        }
    }

    async function testBackendConnection() {
        const statusEl = $("#backend-connection-status");
        if (!API.isConfigured()) {
            statusEl.textContent = "No backend URL configured.";
            toast("Set a backend URL first.", "error");
            return;
        }
        statusEl.textContent = "Testing…";
        try {
            const health = await API.health();
            statusEl.textContent = "Connected ✓ (" + escapeHTML(JSON.stringify(health).slice(0, 120)) + ")";
            toast("Backend connection successful.", "success");
        } catch (err) {
            statusEl.textContent = "Failed: " + escapeHTML(err.message || "unknown error");
            toast("Connection failed: " + err.message, "error");
        }
    }

    function exportAllData() {
        if (!state.meetings.length) {
            toast("No local data to export.", "info");
            return;
        }
        const payload = {
            app: "AI Meeting Minutes Generator",
            version: CONFIG.APP_VERSION || "1.0.0",
            exported_at: new Date().toISOString(),
            meetings: state.meetings,
        };
        download("meeting_minutes_export.json", JSON.stringify(payload, null, 2),
            "application/json");
        toast("Exported " + state.meetings.length + " meetings.", "success");
    }

    function handleImport(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(String(e.target.result || ""));
                const imported = Array.isArray(data) ? data : data.meetings;
                if (!Array.isArray(imported)) throw new Error("Invalid file format");
                let added = 0;
                for (const m of imported) {
                    if (m && m.title && m.transcript !== undefined) {
                        m.id = m.id || uid();
                        m.created_at = m.created_at || new Date().toISOString();
                        state.meetings.push(m);
                        added += 1;
                    }
                }
                saveMeetings(state.meetings);
                renderHistory();
                renderDashboard();
                toast("Imported " + added + " meetings.", "success");
            } catch (err) {
                toast("Import failed: " + err.message, "error");
            }
        };
        reader.readAsText(file);
    }

    function clearAllData() {
        const ok = window.confirm(
            "Are you sure you want to delete ALL locally stored meeting data? " +
            "This action cannot be undone."
        );
        if (!ok) return;
        state.meetings = [];
        saveMeetings(state.meetings);
        renderHistory();
        renderDashboard();
        toast("All local data cleared.", "success");
    }

    // ---- backend URL wiring -----------------------------------------
    function applyBackendUrl(url) {
        const trimmed = (url || "").trim();
        state.settings.backendUrl = trimmed;
        saveSettings(state.settings);
        // Reconfigure the API module's base URL.
        API.BASE_URL = trimmed.replace(/\/+$/, "");
        updateBackendUI();
    }

    // ---- wire up ----------------------------------------------------
    function init() {
        $("#app-version").textContent = CONFIG.APP_VERSION || "1.0.0";
        $("#about-version").textContent = CONFIG.APP_VERSION || "1.0.0";

        initTheme();
        renderDashboard();
        renderSettings();

        // Navigation
        $$(".nav-item").forEach((item) => {
            item.addEventListener("click", () => showView(item.getAttribute("data-view")));
        });
        $("#sidebar-toggle").addEventListener("click", toggleSidebar);
        $("#new-meeting-btn").addEventListener("click", () => showView("new-meeting"));
        $("#quick-new-meeting").addEventListener("click", () => showView("new-meeting"));
        $("#quick-view-history").addEventListener("click", () => showView("history"));

        // Theme
        $("#theme-toggle").addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme");
            applyTheme(current === "dark" ? "light" : "dark");
        });
        $("#theme-preference").addEventListener("change", (e) => {
            applyTheme(e.target.checked ? "dark" : "light");
        });

        // Transcript form
        const transcriptInput = $("#transcript-input");
        transcriptInput.addEventListener("input", updateTranscriptStats);
        $("#clear-transcript").addEventListener("click", () => {
            transcriptInput.value = "";
            updateTranscriptStats();
        });
        $("#upload-transcript").addEventListener("click", () => {
            $("#transcript-file").click();
        });
        $("#transcript-file").addEventListener("change", (e) => {
            handleFileUpload(e.target.files[0]);
            e.target.value = "";
        });
        $("#cancel-meeting").addEventListener("click", () => {
            $("#new-meeting-form").reset();
            updateTranscriptStats();
            setFormStatus("");
            showView("dashboard");
        });
        $("#new-meeting-form").addEventListener("submit", handleGenerate);

        // Results actions
        $("#copy-summary").addEventListener("click", () => {
            if (!state.currentResult) return;
            copyToClipboard(buildMinutesText(state.currentResult, state.currentMeta));
        });
        $("#download-txt").addEventListener("click", () => {
            if (!state.currentResult) return;
            const name = (state.currentMeta.title || "minutes").replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_");
            download(name + "_minutes.txt",
                buildMinutesText(state.currentResult, state.currentMeta));
        });
        $("#download-md").addEventListener("click", () => {
            if (!state.currentResult) return;
            const name = (state.currentMeta.title || "minutes").replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_");
            download(name + "_minutes.md",
                buildMinutesMarkdown(state.currentResult, state.currentMeta),
                "text/markdown;charset=utf-8");
        });
        $("#print-minutes").addEventListener("click", () => window.print());
        $("#save-meeting").addEventListener("click", saveCurrentMeeting);

        // History
        $("#history-search").addEventListener("input", renderHistory);
        $("#history-date-filter").addEventListener("change", renderHistory);
        $("#clear-history-search").addEventListener("click", () => {
            $("#history-search").value = "";
            renderHistory();
        });

        // Settings
        $("#backend-url").addEventListener("change", (e) => {
            applyBackendUrl(e.target.value);
        });
        $("#test-backend-connection").addEventListener("click", testBackendConnection);
        $("#export-all-data").addEventListener("click", exportAllData);
        $("#import-data").addEventListener("click", () => $("#import-file").click());
        $("#import-file").addEventListener("change", (e) => {
            handleImport(e.target.files[0]);
            e.target.value = "";
        });
        $("#clear-all-data").addEventListener("click", clearAllData);

        // Confirm-style buttons
        $$("[data-confirm]").forEach((btn) => {
            const original = btn.textContent;
            btn.addEventListener("click", () => {
                if (btn.dataset.armed === "true") {
                    btn.dataset.armed = "false";
                    btn.textContent = original;
                    return;
                }
                btn.dataset.armed = "true";
                btn.textContent = "Click again to confirm";
                setTimeout(() => {
                    btn.dataset.armed = "false";
                    btn.textContent = original;
                }, 3000);
            });
        });

        updateBackendUI();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
