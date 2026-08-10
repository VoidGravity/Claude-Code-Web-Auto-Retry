(() => {
  'use strict';

  if (window.__claudeCodeWebAutoRetryLoaded) return;
  window.__claudeCodeWebAutoRetryLoaded = true;

  const { hasUsageLimitText, parseResetTime, normalizeText } = globalThis.CUAR;
  let lastFingerprint = null;
  let scanTimer = null;

  function visible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function pageText() {
    const main = document.querySelector('main') || document.body;
    return normalizeText(main?.innerText || '');
  }

  function findUsageLimitContainer() {
    const nodes = [
      ...document.querySelectorAll('[role="alert"], [role="status"], section, article, div')
    ];

    let best = null;
    for (const node of nodes) {
      if (!visible(node)) continue;
      const text = normalizeText(node.innerText || node.textContent || '');
      if (!hasUsageLimitText(text)) continue;
      if (!best || text.length < best.text.length) best = { node, text };
    }
    return best;
  }

  function findTryAgainButton(container) {
    const roots = container ? [container, document] : [document];
    for (const root of roots) {
      const buttons = [...root.querySelectorAll('button, [role="button"]')];
      const exact = buttons.find((el) => {
        if (!visible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
        const text = normalizeText(el.innerText || el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
        return text === 'try again' || text === 'retry';
      });
      if (exact) return exact;
    }
    return null;
  }

  function detectState() {
    const match = findUsageLimitContainer();
    const fullText = pageText();
    const limited = hasUsageLimitText(fullText);
    const resetAt = limited ? parseResetTime(fullText) : null;
    const button = limited ? findTryAgainButton(match?.node) : null;

    return {
      limited,
      resetAt,
      resetText: resetAt ? fullText.match(/resets?[^.\n]*/i)?.[0] || null : null,
      hasTryAgain: Boolean(button)
    };
  }

  function reportState(force = false) {
    const state = detectState();
    if (!state.limited) {
      if (lastFingerprint !== null) {
        lastFingerprint = null;
        chrome.runtime.sendMessage({ type: 'usageLimitCleared' }).catch(() => {});
      }
      return;
    }

    const fingerprint = `${state.resetAt || 'unknown'}:${state.hasTryAgain}`;
    if (!force && fingerprint === lastFingerprint) return;
    lastFingerprint = fingerprint;

    chrome.runtime.sendMessage({
      type: 'usageLimitDetected',
      resetAt: state.resetAt,
      resetText: state.resetText,
      hasTryAgain: state.hasTryAgain,
      url: location.href
    }).catch(() => {});
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => reportState(false), 350);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-disabled']
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'getUsageLimitState') {
      sendResponse(detectState());
      return;
    }

    if (message?.type === 'attemptUsageRetry') {
      const before = detectState();
      if (!before.limited) {
        sendResponse({ ok: true, clicked: false, limited: false, reason: 'already-clear' });
        return;
      }

      const match = findUsageLimitContainer();
      const button = findTryAgainButton(match?.node);
      if (!button) {
        sendResponse({ ok: false, clicked: false, limited: true, reason: 'button-not-found' });
        return;
      }

      button.click();
      sendResponse({ ok: true, clicked: true, limited: true, reason: 'clicked' });
      setTimeout(() => reportState(true), 2500);
      return;
    }
  });

  reportState(true);
})();
