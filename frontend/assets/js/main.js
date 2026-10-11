// Results showcase: accessible tabs and real, repository-backed example data.
(function () {
  'use strict';

  const tabButtons = () => Array.from(document.querySelectorAll('.tab-btn'));
  const tabPanels = () => Array.from(document.querySelectorAll('.tab-panel'));

  function switchTab(index, focusButton = false) {
    const buttons = tabButtons();
    const panels = tabPanels();
    if (!buttons[index] || !panels[index]) return;

    buttons.forEach((button, i) => {
      const active = i === index;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel, i) => {
      const active = i === index;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
    if (focusButton) buttons[index].focus();
  }

  window.switchTab = switchTab;

  function renderTranscript(container, example) {
    container.replaceChildren();
    const meta = document.createElement('div');
    meta.className = 'transcript-source';
    meta.textContent = `${example.engine === 'whisper' ? 'Whisper' : 'AssemblyAI'} · ${example.meeting_id || 'Meeting'} · ${example.transcript_total_utterances ?? '—'} utterances`;
    const text = document.createElement('pre');
    text.className = 'excerpt';
    text.textContent = example.transcript_full || 'No transcript is available for this example.';
    container.append(meta, text);
  }

  function renderMinutes(container, example) {
    container.replaceChildren();
    const sections = [
      ['KEY POINTS', 'Key points'],
      ['DECISIONS', 'Decisions'],
      ['ACTION ITEMS', 'Action items'],
      ['IMPORTANT DATES / DEADLINES', 'Important dates / deadlines']
    ];

    sections.forEach(([key, label]) => {
      const section = document.createElement('section');
      section.className = 'minute-section';
      const heading = document.createElement('h5');
      heading.textContent = label;
      section.appendChild(heading);

      const items = example.minutes && example.minutes[key];
      if (Array.isArray(items) && items.length) {
        const list = document.createElement('ul');
        items.forEach(item => {
          const li = document.createElement('li');
          li.textContent = String(item);
          list.appendChild(li);
        });
        section.appendChild(list);
      } else {
        const empty = document.createElement('p');
        empty.className = 'empty-result';
        empty.textContent = 'No explicit items identified in this output.';
        section.appendChild(empty);
      }
      container.appendChild(section);
    });
  }

  async function loadExamples() {
    const resultSection = document.getElementById('results');
    try {
      const response = await fetch('./assets/data/examples.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.examples) || data.examples.length === 0) {
        throw new Error('The examples file contains no result examples.');
      }

      data.examples.forEach((example, index) => {
        const transcript = document.getElementById(`transcript-${index}`);
        const minutes = document.getElementById(`minutes-${index}`);
        if (transcript) renderTranscript(transcript, example);
        if (minutes) renderMinutes(minutes, example);
      });

      // Report missing mappings instead of leaving a misleading loading state.
      for (let i = data.examples.length; i < 4; i++) {
        ['transcript', 'minutes'].forEach(prefix => {
          const element = document.getElementById(`${prefix}-${i}`);
          if (element) {
            element.textContent = 'No saved output is available for this model/transcriber pairing.';
            element.classList.add('empty-result');
          }
        });
      }
    } catch (error) {
      console.error('Unable to load showcase examples:', error);
      if (resultSection) {
        const notice = document.createElement('p');
        notice.className = 'results-error';
        notice.textContent = 'The saved result examples could not be loaded. Open this page through GitHub Pages or a local web server so the examples.json file can be fetched.';
        const intro = resultSection.querySelector('.results-intro');
        if (intro) intro.appendChild(notice);
      }
      document.querySelectorAll('.loading-state').forEach(el => {
        el.textContent = 'Result data could not be loaded.';
      });
    }
  }

  document.addEventListener('keydown', event => {
    const buttons = tabButtons();
    const current = buttons.indexOf(document.activeElement);
    if (current < 0) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      switchTab((current + direction + buttons.length) % buttons.length, true);
    } else if (event.key === 'Home') {
      event.preventDefault();
      switchTab(0, true);
    } else if (event.key === 'End') {
      event.preventDefault();
      switchTab(buttons.length - 1, true);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    switchTab(0);
    loadExamples();
  });
})();
