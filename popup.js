(() => {
  'use strict';

  const { DEFAULTS, formatTime } = globalThis.CUAR;
  const ids = ['enabled', 'bufferSeconds', 'retryIntervalSeconds', 'maxAttempts', 'reloadDiscardedTabs'];
  const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  const sessionsEl = document.getElementById('sessions');
  const statusEl = document.getElementById('status');

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[ch]));
  }

  async function load() {
    const state = await chrome.runtime.sendMessage({ type: 'getPopupState' });
    const settings = { ...DEFAULTS, ...(state?.settings || {}) };
    els.enabled.checked = settings.enabled;
    els.bufferSeconds.value = settings.bufferSeconds;
    els.retryIntervalSeconds.value = settings.retryIntervalSeconds;
    els.maxAttempts.value = settings.maxAttempts;
    els.reloadDiscardedTabs.checked = settings.reloadDiscardedTabs;
    renderSchedules(state?.schedules || {});
  }

  function renderSchedules(schedules) {
    const items = Object.values(schedules).sort((a, b) => (a.nextAttemptAt || Infinity) - (b.nextAttemptAt || Infinity));
    if (!items.length) {
      sessionsEl.innerHTML = '<div class="empty">No usage-limited sessions detected.</div>';
      return;
    }

    sessionsEl.innerHTML = items.map((s) => `
      <div class="session" data-tab-id="${Number(s.tabId)}">
        <div class="session-title">${escapeHtml(s.title || 'Claude Code')}</div>
        <div class="meta">
          Reset: ${escapeHtml(formatTime(s.resetAt))}<br />
          Next try: ${escapeHtml(formatTime(s.nextAttemptAt))}<br />
          Status: ${escapeHtml(s.status || 'waiting')} · Attempts: ${Number(s.attempts || 0)}
        </div>
        <div class="actions">
          <button data-action="retry">Retry now</button>
          <button data-action="clear">Forget</button>
        </div>
      </div>
    `).join('');
  }

  async function saveSettings() {
    const settings = {
      enabled: els.enabled.checked,
      bufferSeconds: Math.max(0, Math.min(600, Number(els.bufferSeconds.value) || DEFAULTS.bufferSeconds)),
      retryIntervalSeconds: Math.max(30, Math.min(3600, Number(els.retryIntervalSeconds.value) || DEFAULTS.retryIntervalSeconds)),
      maxAttempts: Math.max(1, Math.min(100, Number(els.maxAttempts.value) || DEFAULTS.maxAttempts)),
      reloadDiscardedTabs: els.reloadDiscardedTabs.checked
    };
    await chrome.runtime.sendMessage({ type: 'saveSettings', settings });
    setStatus('Saved.');
  }

  ids.forEach((id) => els[id].addEventListener('change', saveSettings));

  sessionsEl.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    const card = event.target.closest('.session');
    if (!button || !card) return;
    const tabId = Number(card.dataset.tabId);
    const action = button.dataset.action;
    button.disabled = true;
    try {
      if (action === 'retry') {
        setStatus('Retrying…');
        await chrome.runtime.sendMessage({ type: 'retryNow', tabId });
      } else if (action === 'clear') {
        await chrome.runtime.sendMessage({ type: 'clearSchedule', tabId });
      }
      await load();
    } finally {
      button.disabled = false;
    }
  });

  chrome.storage.onChanged.addListener(() => load().catch(() => {}));
  load().catch((error) => setStatus(`Error: ${error.message || error}`));
})();
