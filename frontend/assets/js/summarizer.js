// summarizer.js — deterministic meeting-minutes extraction.
//
// This is a faithful JavaScript port of the rule-based extraction logic in
// `bart_meeting_summarizer_assemblyai.ipynb` (cells 4-10). It structures an
// existing transcript into Key Points / Decisions / Action Items / Dates.
//
// IMPORTANT: this is NOT neural inference. It does not load bart_model.pt or
// flan_t5_model.pt (browser cannot). Results are labeled as "extracted" in the UI
// and are never presented as AI-generated.

const Summarizer = (function () {
    "use strict";

    // ---- configuration (matches notebook cell 1) ---------------------------
    const MAX_KEY_POINTS = 5;
    const MAX_DECISIONS = 8;
    const MAX_ACTIONS = 8;
    const MAX_DATES = 8;

    // ---- helpers (cell 4) ------------------------------------------------
    function clean(text) {
        return String(text == null ? "" : text).replace(/\s+/g, " ").trim();
    }

    function normalize(text) {
        return clean(text)
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function similarity(a, b) {
        const aa = new Set(normalize(a).split(" ").filter(Boolean));
        const bb = new Set(normalize(b).split(" ").filter(Boolean));
        if (aa.size === 0 || bb.size === 0) return 0.0;
        let inter = 0;
        aa.forEach((w) => { if (bb.has(w)) inter += 1; });
        return inter / (aa.size + bb.size - inter);
    }

    function dedupe(items, threshold) {
        const result = [];
        for (const raw of items) {
            const item = clean(raw);
            if (!item) continue;
            if (result.some((old) => similarity(item, old) >= threshold)) continue;
            result.push(item);
        }
        return result;
    }

    // transcript line -> { speaker, body }
    function parseTranscript(text) {
        const records = [];
        for (const rawLine of String(text || "").split(/\r?\n/)) {
            // strip leading [timestamp] like the notebook
            let line = clean(rawLine.replace(/^\s*\[[^\]]+\]\s*/, ""));
            if (!line) continue;
            const m = line.match(/^([^:]{1,70}):\s*(.+)$/);
            let speaker = "";
            let body = line;
            if (m) {
                speaker = clean(m[1]);
                body = clean(m[2]);
            }
            if (body.split(/\s+/).filter(Boolean).length >= 4) {
                records.push({ speaker, body });
            }
        }
        return records;
    }

    // ---- classifiers (cells 5-6) ----------------------------------------
    const QUESTION_RE = /\?$|^(?:can|could|would|should|shall|do|does|did|is|are|will|what|when|where|why|how|may|might)\b/i;
    const COMMITMENT_RE = /^(?:I\s+(?:will|shall|am going to|plan to|intend to)\b|I['’]ll\b)/i;
    const REQUEST_RE = /^(?:please|can you|could you|would you)\b/i;
    const CAPABILITY_RE = /^(?:I|we)\s+(?:can|could)\b/i;

    const DECISION_HEADER_RE =
        /\b(?:the|our)\s+(?:(?:final|main|budget)\s+)?decisions?\s+(?:are|is|were|was)\b|\bthe\s+(?:final\s+)?decision\s+(?:is|was|will be)\b/i;
    const DECISION_DIRECT_RE =
        /^(?:we(?:[’']ll|\s+will)\s+(?:use|adopt|keep|go with|proceed with|retain|include|exclude|schedule|target|set|select)\b|let[’']?s\s+(?:use|adopt|keep|go with|proceed with|retain|include|exclude|schedule|target|set|select|configure|standardize)\b|we\s+(?:have\s+)?(?:decided|agreed|approved|confirmed|finalized)\b)/i;
    const REQUIREMENT_RE =
        /\b(?:should|needs?\s+to|must|has\s+to|have\s+to|need\s+to|is\s+required\s+to|are\s+required\s+to|required\s+to)\b/i;
    const DECISION_SPLIT_RE =
        /,\s*(?:and\s+)?(?=(?:run|keep|retain|include|exclude|hold|use|adopt|review|add|remove|rotate|test|compare|assign|alert|conduct|target|show|reduce|submit|monitor|apply|schedule|select|set|proceed|go with|configure|standardize|require|limit|start|refresh|perform)\b)|\s+and\s+(?=(?:run|keep|retain|include|exclude|hold|use|adopt|review|add|remove|rotate|test|compare|assign|alert|conduct|target|show|reduce|submit|monitor|apply|schedule|select|set|proceed|go with|configure|standardize|require|limit|start|refresh|perform)\b)/i;

    function isQuestion(text) { return QUESTION_RE.test(clean(text)); }
    function isCommitment(text) { return COMMITMENT_RE.test(clean(text)); }
    function isRequest(text) { return REQUEST_RE.test(clean(text)); }
    function isDecision(text) {
        const t = clean(text);
        return DECISION_HEADER_RE.test(t) || DECISION_DIRECT_RE.test(t);
    }

    function cleanDecision(text) {
        let t = clean(text);
        const header = t.match(DECISION_HEADER_RE);
        if (header) {
            t = t.slice(header.index + header[0].length);
            t = t.replace(/^\s*:??\s*(?:to\s+)?/, "");
        }
        t = t.replace(/^we\s+(?:have\s+)?(?:decided|agreed|approved|confirmed|finalized)\s+(?:that\s+)?/i, "");
        t = t.replace(/^(?:we(?:[’']ll|\s+will)|let[’']?s)\s+/i, "");
        return clean(t).replace(/[?.! ]+$/, "");
    }

    function splitDecisionText(text) {
        const t = cleanDecision(text);
        return t
            .split(DECISION_SPLIT_RE)
            .map((p) => clean(p).replace(/^[,\s]+|[,\s]+$/g, ""))
            .filter((p) => clean(p).split(/\s+/).filter(Boolean).length >= 3);
    }

    function extractDecisions(records) {
        let decisions = [];
        for (const record of records) {
            const body = clean(record.body);
            if (!body || isQuestion(body) || isRequest(body) || !isDecision(body)) continue;
            decisions = decisions.concat(splitDecisionText(body));
        }
        const cleaned = [];
        for (const raw of decisions) {
            const item = clean(raw);
            if (!item) continue;
            let duplicate = false;
            for (const old of cleaned) {
                const a = normalize(item);
                const b = normalize(old);
                const aSet = new Set(a.split(" ").filter(Boolean));
                const bSet = new Set(b.split(" ").filter(Boolean));
                const smaller = Math.min(aSet.size, bSet.size) || 1;
                let inter = 0;
                aSet.forEach((w) => { if (bSet.has(w)) inter += 1; });
                const shorterOverlap = inter / smaller;
                const sameFrequency =
                    a.includes("metadata") && b.includes("metadata") &&
                    a.includes("four") && b.includes("four") &&
                    a.includes("hour") && b.includes("hour");
                if (a.includes(b) || b.includes(a) || similarity(item, old) >= 0.62 ||
                    shorterOverlap >= 0.70 || sameFrequency) {
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) cleaned.push(item);
        }
        return cleaned.slice(0, MAX_DECISIONS);
    }

    // ---- action items (cell 7) -----------------------------------------
    function stripCommitment(body) {
        let t = clean(body);
        t = t.replace(/^I\s+(?:will|shall|am going to|plan to|intend to)\s+/i, "");
        t = t.replace(/^I['’]ll\s+/i, "");
        return clean(t).replace(/[?.! ]+$/, "");
    }

    function extractActions(records) {
        const actions = [];
        const seen = new Set();
        for (const record of records) {
            const body = clean(record.body);
            if (!body || isQuestion(body) || isRequest(body)) continue;
            if (!isCommitment(body)) continue;
            const task = stripCommitment(body);
            if (task.split(/\s+/).filter(Boolean).length < 3) continue;
            const speaker = clean(record.speaker) || "Team";
            const key = normalize(speaker + " " + task);
            if (seen.has(key)) continue;
            seen.add(key);
            actions.push(speaker + " — " + task);
        }
        return dedupe(actions, 0.84).slice(0, MAX_ACTIONS);
    }

    // ---- dates (cell 8) ------------------------------------------------
    // NOTE: 'g' flag is required because extractDates uses matchAll.
    const DATE_RE =
        /\b(?:next|this|coming)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm))?(?:\s+(?:morning|afternoon|evening))?\b|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)|\s+(?:morning|afternoon|evening))\b|\b(?:today|tomorrow|yesterday)(?:\s+(?:morning|afternoon|evening))?\b|\b(?:this|next|coming)\s+(?:week|month)\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?\b/gi;

    const DATE_TRIGGER_RE =
        /\b(?:by|before|until|deadline|due|scheduled\s+for|schedule(?:d)?|target(?:ed)?|review|meeting|release|test|demo|submission|delivery|launch|rehearsal|go-live|workshop|pilot|training|session|appointment|hold|conduct|submit|complete|finish|prepare|update|configure|verify|deploy|implement|run|send|circulate|i\s+(?:will|shall|am going to|plan to|intend to)|i['’]ll)\b/i;

    function extractDateContext(body, match) {
        let left = body.lastIndexOf(",", 0, match.index);
        let right = body.indexOf(",", match.index + match[0].length);
        if (left < 0) left = 0; else left += 1;
        if (right < 0) right = body.length;

        let clause = clean(body.slice(left, right).replace(/^[\s,:.-]+|[\s,:.-]+$/g, ""));

        if (clause.split(/\s+/).filter(Boolean).length < 2 && left > 0) {
            let prevLeft = body.lastIndexOf(",", 0, left - 1);
            prevLeft = prevLeft < 0 ? 0 : prevLeft + 1;
            clause = clean(body.slice(prevLeft, right).replace(/^[\s,:.-]+|[\s,:.-]+$/g, ""));
        }

        clause = clause.replace(/^(?:yes|okay|ok|right|so|and|then|the following)\s*,?\s*/i, "");
        clause = clause.replace(/^(?:i\s+(?:will|shall|am going to|plan to|intend to)|i['’]ll|let[’']?s)\s+/i, "").trim();
        clause = clause.replace(DATE_RE, "").replace(/^[\s,:.-]+|[\s,:.-]+$/g, "").replace(DATE_RE, "").trim();
        clause = clause.replace(/^(?:at|on|by|before|until|for)\s+/i, "").replace(/^[\s,:.-]+|[\s,:.-]+$/g, "");
        clause = clause.replace(/\b(?:is|are|was|were|will be)\s*$/i, "").replace(/^[\s,:.-]+|[\s,:.-]+$/g, "");
        clause = clean(clause);

        if (!clause || clause.split(/\s+/).filter(Boolean).length < 2) return null;
        if (clause.split(/\s+/).filter(Boolean).length > 10) {
            clause = clause.split(/\s+/).filter(Boolean).slice(-10).join(" ");
        }
        return clause;
    }

    function extractDates(records) {
        const items = [];
        for (const record of records) {
            const body = clean(record.body);
            if (!body || !DATE_TRIGGER_RE.test(body)) continue;
            if (/^(?:good morning|good afternoon|good evening|today everyone|today we are|today we're|the agenda|the discussion)\b/i.test(body)) continue;
            const speaker = clean(record.speaker) || "Team";
            for (const match of body.matchAll(DATE_RE)) {
                const phrase = clean(match[0]);
                const context = extractDateContext(body, match);
                if (!context) continue;
                if (/^(?:the following|scheduled item|current target|current release target)$/i.test(context)) continue;
                if (!/\b(?:review|meeting|deadline|launch|release|test|demo|rehearsal|training|workshop|pilot|submit|prepare|finish|complete|update|configure|verify|deploy|implement|run|schedule|hold|conduct|send|circulate|target|checklist|build|dataset|report|assessment)\b/i.test(context)) continue;
                items.push(phrase + " — " + speaker + ": " + context);
            }
        }
        return dedupe(items, 0.88).slice(0, MAX_DATES);
    }

    // ---- key points (cell 9) -------------------------------------------
    function isNonKeypointSentence(text) {
        const t = clean(text);
        const lower = t.toLowerCase();
        if (isQuestion(t) || isRequest(t) || isCommitment(t)) return true;
        if (CAPABILITY_RE.test(t)) return true;
        const planning = ["we should", "we need", "we have to", "we must", "let's", "lets",
            "could we", "can we", "i think we should", "i think we need"];
        if (planning.some((p) => lower.startsWith(p))) return true;
        const conversational = ["i agree", "that makes sense", "sounds good", "okay", "ok",
            "right", "yes", "no", "thanks", "thank you"];
        if (conversational.some((p) => lower.startsWith(p))) return true;
        return false;
    }

    function isFactualKeypoint(body) {
        const text = clean(body);
        if (text.split(/\s+/).filter(Boolean).length < 6) return false;
        if (isNonKeypointSentence(text)) return false;
        if (/^(?:i|we)\s+(?:can|could|will|shall|am going to|plan to|intend to)\b/i.test(text)) return false;
        if (isDecision(text)) return false;
        if (REQUIREMENT_RE.test(text)) return false;
        if (/^(?:i|we)\s+(?:can|could|will|shall|am going to|plan to|intend to|should|need to|must)\b/i.test(text)) return false;
        const decisionLike = /^(?:to summarize,\s*)?(?:we\s+(?:are|will|shall)\s+(?:using|adopting|keeping|going with)|the\s+(?:current|final)\s+(?:approach|choice|plan)\s+is)\b/i;
        if (decisionLike.test(text)) return false;
        return true;
    }

    function keypointScore(body, frequency) {
        const words = normalize(body).split(" ").filter(Boolean);
        const stop = new Set(["this", "that", "with", "from", "have", "will", "were", "been", "there", "their", "about"]);
        let informative = 0;
        let numbers = 0;
        for (const w of words) {
            if (w.length >= 4 && !stop.has(w)) informative += 1;
            if (/\d/.test(w)) numbers += 1;
        }
        return Math.min(words.length, 30) * 0.8 + informative * 1.2 + numbers * 2.0 +
            Math.min(frequency[normalize(body)] || 1, 3);
    }

    function selectKeypointSources(records, decisions) {
        const frequency = {};
        for (const record of records) {
            const key = normalize(clean(record.body));
            if (key) frequency[key] = (frequency[key] || 0) + 1;
        }
        let candidates = [];
        for (const record of records) {
            const body = clean(record.body);
            if (!isFactualKeypoint(body)) continue;
            if (decisions.some((d) => similarity(body, d) >= 0.45)) continue;
            candidates.push(body);
        }
        candidates = dedupe(candidates, 0.68);
        candidates.sort((a, b) => keypointScore(b, frequency) - keypointScore(a, frequency));
        const selected = [];
        for (const candidate of candidates) {
            if (selected.some((old) => similarity(candidate, old) >= 0.55)) continue;
            selected.push(candidate);
            if (selected.length >= MAX_KEY_POINTS) break;
        }
        return selected;
    }

    function normalizeKeypointOutput(text) {
        let t = clean(text).replace(/^[•\-* ]+|[•\-* ]+$/g, "");
        if (!t) return t;
        const numericStart = t.match(/^(\d+(?:[.,]\d+)*)(\s+)(.+)$/);
        if (numericStart) {
            const rest = numericStart[3];
            return numericStart[1] + numericStart[2] + rest.charAt(0).toLowerCase() + rest.slice(1);
        }
        for (let i = 0; i < t.length; i++) {
            if (/[a-z]/i.test(t[i])) {
                return t.slice(0, i) + t[i].toUpperCase() + t.slice(i + 1);
            }
        }
        return t;
    }

    function extractKeyPoints(records, decisions) {
        const sources = selectKeypointSources(records, decisions);
        // NOTE: the notebook optionally shortens each key point with the neural
        // model (flan_keypoint). Without a backend we keep the original sentence.
        return sources
            .map(normalizeKeypointOutput)
            .filter((item) => !isNonKeypointSentence(item) && !isDecision(item));
    }

    // ---- top level (cell 10) -------------------------------------------
    function extractMinutes(transcript) {
        const records = parseTranscript(transcript);
        const decisions = extractDecisions(records);
        const actions = extractActions(records);
        const dates = extractDates(records);
        const keyPoints = extractKeyPoints(records, decisions);

        const speakers = [];
        for (const r of records) {
            const s = clean(r.speaker);
            if (s && !speakers.includes(s)) speakers.push(s);
        }

        return {
            method: "rule-based",
            key_points: keyPoints,
            decisions: decisions,
            action_items: actions,
            dates: dates,
            participants: speakers,
            utterance_count: records.length,
        };
    }

    return {
        extractMinutes,
        parseTranscript,
        MAX_KEY_POINTS,
        MAX_DECISIONS,
        MAX_ACTIONS,
        MAX_DATES,
    };
})();
