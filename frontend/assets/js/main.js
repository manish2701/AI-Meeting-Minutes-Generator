// Showcase interaction — tabs and data loading
(function () {
  'use strict';

  // Tab switching
  window.switchTab = function (index) {
    document.querySelectorAll('.tab-btn').forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
      btn.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-panel').forEach((panel, i) => {
      panel.classList.toggle('active', i === index);
    });
  };

  // Load real examples
  async function loadExamples() {
    try {
      const res = await fetch('./assets/data/examples.json');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      if (!data.examples) return;

      data.examples.forEach((ex, idx) => {
        // Full transcript into panel
        const transcriptEl = document.getElementById('transcript-' + idx);
        if (transcriptEl && ex.transcript_full) {
          transcriptEl.innerHTML = '<pre style="font-family:var(--font-mono);font-size:.82rem;line-height:1.7;color:var(--text-secondary);white-space:pre-wrap;word-break:break-word;"><strong>Source:</strong> ' + (ex.engine === 'whisper' ? 'Whisper' : 'AssemblyAI') + ' · ' + ex.meeting_id + ' · Utterances: ' + (ex.transcript_total_utterances || '-') + '<br><hr>' + String(ex.transcript_full).replace(/</g, '&lt;') + '</pre>';
        }

        // Minutes
        const minutesEl = document.getElementById('minutes-' + idx);
        if (minutesEl && ex.minutes) {
          const sections = ['KEY POINTS', 'DECISIONS', 'ACTION ITEMS', 'IMPORTANT DATES / DEADLINES'];
          let html = '<div class="minute-section" style="margin-bottom:1rem;">';
          sections.forEach(s => {
            const items = ex.minutes[s];
            html += '<h5 style="margin-top:0.75rem;font-size:.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;">' + s + '</h5>';
            if (items && items.length) {
              html += '<ul style="margin:0;padding-left:1.25rem;font-size:.9rem;color:var(--text-secondary);line-height:1.6;">';
              items.forEach(i => html += '<li>' + String(i).replace(/</g, '&lt;') + '</li>');
              html += '</ul>';
            } else {
              html += '<p style="font-size:.85rem;color:var(--text-muted);font-style:italic;">No explicit ' + s.toLowerCase().replace('/', ' / ').trim() + ' identified.</p>';
            }
          });
          html += '</div>';
          minutesEl.innerHTML = html;
        }
      });
    } catch (e) {
      console.error('Examples load:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadExamples);
  } else {
    loadExamples();
  }
})();
