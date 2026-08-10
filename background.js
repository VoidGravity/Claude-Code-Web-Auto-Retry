'use strict';

importScripts('shared.js');

const { DEFAULTS } = globalThis.CUAR;
const STATE_KEY = 'retrySchedules';
const ALARM_PREFIX = 'claude-usage-retry:';

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

async function getSchedules() {
  const data = await chrome.storage.local.get(STATE_KEY);
  return data[STATE_KEY] || {};
}

async function setSchedules(schedules) {
  await chrome.storage.local.set({ [STATE_KEY]: schedules });
  await refreshBadge(schedules);
}

async function refreshBadge(schedules = null) {
  schedules ||= await getSchedules();
  const active = Object.values(schedules).filter((s) => s?.status === 'waiting' || s?.status === 'retrying').length;
  await chrome.action.setBadgeText({ text: active ? String(active) : '' });
  if (active) {
    await chrome.action.setBadgeBackgroundColor({ color: '#d97706' });
  }
}

function alarmName(tabId) {
  return `${ALARM_PREFIX}${tabId}`;
}

function tabIdFromAlarm(name) {
  if (!name.startsWith(ALARM_PREFIX)) return null;
  const id = Number(name.slice(ALARM_PREFIX.length));
  return Number.isInteger(id) ? id : null;
}

async function scheduleAlarm(tabId, whenMs) {
  await chrome.alarms.clear(alarmName(tabId));
  chrome.alarms.create(alarmName(tabId), { when: Math.max(Date.now() + 1000, whenMs) });
}

async function upsertSchedule(tabId, patch) {
  const schedules = await getSchedules();
  schedules[tabId] = {
    ...(schedules[tabId] || {}),
    tabId,
    updatedAt: Date.now(),
    ...patch
  };
  await setSchedules(schedules);
  return schedules[tabId];
}

async function removeSchedule(tabId) {
  const schedules = await getSchedules();
  delete schedules[tabId];
  await setSchedules(schedules);
  await chrome.alarms.clear(alarmName(tabId));
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'getUsageLimitState' });
    return true;
  } catch {}

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['shared.js', 'content.js'] });
    await new Promise((resolve) => setTimeout(resolve, 250));
    return true;
  } catch {
    return false;
  }
}

async function waitForTabComplete(tabId, timeoutMs = 15000) {
  const current = await chrome.tabs.get(tabId).catch(() => null);
  if (!current) return false;
  if (current.status === 'complete') return true;

  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => finish(false), timeoutMs);

    function finish(value) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(value);
    }

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') finish(true);
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function attemptRetry(tabId, manual = false) {
  const settings = await getSettings();
  if (!settings.enabled && !manual) return;

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    await removeSchedule(tabId);
    return;
  }

  if (!tab.url?.startsWith('https://claude.ai/')) {
    await removeSchedule(tabId);
    return;
  }

  if (tab.discarded) {
    if (!settings.reloadDiscardedTabs) {
      await queueRetry(tabId, 'tab-discarded');
      return;
    }
    try {
      await chrome.tabs.reload(tabId);
      await waitForTabComplete(tabId, 20000);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch {
      await queueRetry(tabId, 'reload-failed');
      return;
    }
  }

  const ready = await ensureContentScript(tabId);
  if (!ready) {
    await queueRetry(tabId, 'content-script-unavailable');
    return;
  }

  const currentSchedules = await getSchedules();
  const current = currentSchedules[tabId] || { attempts: 0 };
  const attempts = manual ? current.attempts || 0 : (current.attempts || 0) + 1;

  await upsertSchedule(tabId, {
    status: 'retrying',
    attempts,
    lastAttemptAt: Date.now(),
    lastReason: manual ? 'manual' : 'scheduled'
  });

  let result;
  try {
    result = await chrome.tabs.sendMessage(tabId, { type: 'attemptUsageRetry' });
  } catch {
    await queueRetry(tabId, 'message-failed');
    return;
  }

  if (result?.limited === false) {
    await removeSchedule(tabId);
    return;
  }

  const actionTaken = Boolean(result?.clicked || result?.submitted);
  await new Promise((resolve) => setTimeout(resolve, actionTaken ? 8000 : 1500));

  let state = null;
  try {
    state = await chrome.tabs.sendMessage(tabId, { type: 'getUsageLimitState' });
  } catch {}

  if (state && !state.limited) {
    await removeSchedule(tabId);
    return;
  }

  if (!manual && attempts >= settings.maxAttempts) {
    await upsertSchedule(tabId, {
      status: 'stopped',
      lastReason: state?.hasTryAgain === false ? 'button-not-found' : 'max-attempts'
    });
    await chrome.alarms.clear(alarmName(tabId));
    return;
  }

  await queueRetry(tabId, result?.reason || 'still-limited');
}

async function queueRetry(tabId, reason) {
  const settings = await getSettings();
  const when = Date.now() + settings.retryIntervalSeconds * 1000;
  await upsertSchedule(tabId, {
    status: 'waiting',
    nextAttemptAt: when,
    lastReason: reason
  });
  await scheduleAlarm(tabId, when);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'usageLimitDetected' && sender.tab?.id != null) {
      const settings = await getSettings();
      if (!settings.enabled) return;

      const tabId = sender.tab.id;
      const schedules = await getSchedules();
      const existing = schedules[tabId];

      const resetAt = Number(message.resetAt) || null;
      const fallbackDelay = 5 * 60 * 1000;
      const target = resetAt
        ? resetAt + settings.bufferSeconds * 1000
        : Date.now() + fallbackDelay;

      const nextAttemptAt = existing?.nextAttemptAt && existing.nextAttemptAt <= target
        ? existing.nextAttemptAt
        : target;

      await upsertSchedule(tabId, {
        url: message.url || sender.tab.url,
        title: sender.tab.title || 'Claude Code',
        resetAt,
        resetText: message.resetText || null,
        hasTryAgain: Boolean(message.hasTryAgain),
        status: 'waiting',
        attempts: existing?.resetAt === resetAt ? (existing.attempts || 0) : 0,
        nextAttemptAt,
        lastReason: resetAt ? 'usage-limit-detected' : 'reset-time-unknown'
      });
      await scheduleAlarm(tabId, nextAttemptAt);
      return;
    }

    if (message?.type === 'usageLimitCleared' && sender.tab?.id != null) {
      await removeSchedule(sender.tab.id);
      return;
    }

    if (message?.type === 'getPopupState') {
      sendResponse({ settings: await getSettings(), schedules: await getSchedules() });
      return;
    }

    if (message?.type === 'saveSettings') {
      const patch = {};
      for (const key of Object.keys(DEFAULTS)) {
        if (Object.prototype.hasOwnProperty.call(message.settings || {}, key)) {
          patch[key] = message.settings[key];
        }
      }
      await chrome.storage.local.set(patch);
      sendResponse({ ok: true, settings: await getSettings() });
      return;
    }

    if (message?.type === 'retryNow') {
      await attemptRetry(Number(message.tabId), true);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'clearSchedule') {
      await removeSchedule(Number(message.tabId));
      sendResponse({ ok: true });
      return;
    }
  })().catch((error) => {
    console.warn('[Claude Code Web Auto-Retry]', error);
    try { sendResponse({ ok: false, error: String(error?.message || error) }); } catch {}
  });
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  const tabId = tabIdFromAlarm(alarm.name);
  if (tabId == null) return;
  attemptRetry(tabId, false).catch((error) => {
    console.warn('[Claude Code Web Auto-Retry] alarm retry failed', error);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  removeSchedule(tabId).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => refreshBadge().catch(() => {}));
chrome.runtime.onStartup.addListener(() => refreshBadge().catch(() => {}));
refreshBadge().catch(() => {});
