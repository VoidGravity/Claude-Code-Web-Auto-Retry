(() => {
  'use strict';

  if (window.__claudeCodeWebAutoRetryLoaded) return;
  window.__claudeCodeWebAutoRetryLoaded = true;

  const { hasUsageLimitText, findNearestResetTime, normalizeText } = globalThis.CUAR;
  let lastFingerprint = null;
  let scanTimer = null;

  function visible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0;
  }

  function enabled(el) {
    return Boolean(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  }

  function pageText() {
    const main = document.querySelector('main') || document.body;
    return normalizeText(main?.innerText || '');
  }

  function elementLabel(el) {
    return normalizeText(
      el?.innerText ||
      el?.textContent ||
      el?.getAttribute?.('aria-label') ||
      el?.getAttribute?.('title') ||
      ''
    ).toLowerCase();
  }

  function isTryAgainButton(el) {
    if (!visible(el) || !enabled(el)) return false;
    const text = elementLabel(el);
    return text === 'try again' || text === 'retry';
  }

  function findUsageLimitAncestor(button) {
    let node = button;
    for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
      const text = normalizeText(node.innerText || node.textContent || '');
      if (!text || text.length > 3000) continue;
      if (hasUsageLimitText(text)) return node;
    }
    return null;
  }

  function findActiveUsageLimitAction() {
    const buttons = [...document.querySelectorAll('button, [role="button"]')];
    for (const button of buttons) {
      if (!isTryAgainButton(button)) continue;
      const container = findUsageLimitAncestor(button);
      if (container) return { button, container };
    }
    return null;
  }

  function composerText(composer) {
    if (!composer) return '';
    if ('value' in composer) return normalizeText(composer.value || '');
    return normalizeText(composer.innerText || composer.textContent || '');
  }

  function isContinueText(value) {
    const text = normalizeText(value).toLowerCase();
    return text === 'continue' || text === 'continue.' || text === 'please continue';
  }

  function isContinueDraft(composer) {
    return isContinueText(composerText(composer));
  }

  function findComposer() {
    const selectors = [
      'textarea[data-testid*="chat" i]',
      'textarea[data-testid*="prompt" i]',
      'textarea[placeholder*="message" i]',
      '[contenteditable="true"][data-placeholder]',
      '.ProseMirror[contenteditable="true"]',
      '[role="textbox"][contenteditable="true"]',
      'textarea',
      '[contenteditable="true"]'
    ];

    const candidates = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (seen.has(el) || !visible(el) || el.closest('[aria-hidden="true"]')) continue;
        seen.add(el);
        candidates.push(el);
      }
    }

    return candidates.find((el) => isContinueDraft(el)) || candidates[0] || null;
  }

  function findSendButton(composer) {
    const roots = [];
    if (composer) {
      const form = composer.closest('form');
      if (form) roots.push(form);

      let parent = composer.parentElement;
      for (let i = 0; parent && i < 5; i += 1, parent = parent.parentElement) {
        roots.push(parent);
      }
    }
    roots.push(document);

    const selectors = [
      'button[data-testid*="send" i]',
      'button[aria-label*="send" i]',
      '[role="button"][aria-label*="send" i]',
      'button[title*="send" i]',
      'button[type="submit"]'
    ];

    for (const root of roots) {
      for (const selector of selectors) {
        const buttons = [...root.querySelectorAll(selector)];
        const button = buttons.find((el) => visible(el) && enabled(el));
        if (button) return button;
      }
    }

    if (composer) {
      let parent = composer.parentElement;
      for (let depth = 0; parent && depth < 5; depth += 1, parent = parent.parentElement) {
        const buttons = [...parent.querySelectorAll('button, [role="button"]')]
          .filter((el) => visible(el) && enabled(el));

        const button = buttons.find((el) => {
          const metadata = normalizeText([
            el.getAttribute('aria-label'),
            el.getAttribute('title'),
            el.getAttribute('data-testid'),
            el.innerText,
            el.textContent
          ].filter(Boolean).join(' ')).toLowerCase();

          return /\b(send|submit)\b/.test(metadata);
        });
        if (button) return button;
      }
    }

    return null;
  }

  function isGenerating() {
    const selectors = [
      'button[aria-label*="stop" i]',
      'button[title*="stop" i]',
      'button[data-testid*="stop" i]'
    ];

    for (const selector of selectors) {
      const button = [...document.querySelectorAll(selector)]
        .find((el) => visible(el) && enabled(el));
      if (button) return true;
    }

    return [...document.querySelectorAll('button, [role="button"]')].some((el) => {
      if (!visible(el)) return false;
      const text = normalizeText(
        el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || ''
      ).toLowerCase();
      return text === 'stop' || text === 'stop response' || text === 'stop generating';
    });
  }

  function dispatchEnter(composer) {
    if (!composer) return false;

    composer.focus();
    const options = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    };

    composer.dispatchEvent(new KeyboardEvent('keydown', options));
    composer.dispatchEvent(new KeyboardEvent('keypress', options));
    composer.dispatchEvent(new KeyboardEvent('keyup', options));
    return true;
  }

  async function waitForSubmissionEvidence(composer, sendButton = null, timeoutMs = 1200) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!document.contains(composer) || !isContinueDraft(composer)) return true;
      if (sendButton && (!document.contains(sendButton) || !enabled(sendButton))) return true;
      if (isGenerating()) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return !document.contains(composer) ||
      !isContinueDraft(composer) ||
      Boolean(sendButton && (!document.contains(sendButton) || !enabled(sendButton))) ||
      isGenerating();
  }

  async function submitContinueDraft() {
    const composer = findComposer();
    if (!composer || !isContinueDraft(composer)) {
      return { submitted: false, method: null, reason: 'no-continue-draft' };
    }

    const sendButton = findSendButton(composer);
    if (sendButton) {
      sendButton.click();
      if (await waitForSubmissionEvidence(composer, sendButton)) {
        return { submitted: true, method: 'button', reason: 'continue-submitted' };
      }
    }

    const form = composer.closest('form');
    if (form && typeof form.requestSubmit === 'function') {
      try {
        form.requestSubmit();
        if (await waitForSubmissionEvidence(composer)) {
          return { submitted: true, method: 'form', reason: 'continue-submitted' };
        }
      } catch {}
    }

    if (dispatchEnter(composer) && await waitForSubmissionEvidence(composer)) {
      return { submitted: true, method: 'enter', reason: 'continue-submitted' };
    }

    return { submitted: false, method: null, reason: 'send-did-not-submit' };
  }

  function detectState() {
    const activeLimit = findActiveUsageLimitAction();
    const limited = Boolean(activeLimit);
    const fullText = pageText();
    const resetInfo = limited ? findNearestResetTime(fullText) : null;
    const composer = findComposer();

    return {
      limited,
      resetAt: resetInfo?.timestamp || null,
      resetText: resetInfo?.text || null,
      hasTryAgain: Boolean(activeLimit?.button),
      hasContinueDraft: isContinueDraft(composer)
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

    const fingerprint = `${state.resetAt || 'unknown'}:${state.hasTryAgain}:${state.hasContinueDraft}`;
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

    if (message?.type === 'resetUsageDetection') {
      lastFingerprint = null;
      setTimeout(() => reportState(true), 0);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'attemptUsageRetry') {
      (async () => {
        const before = detectState();

        if (!before.limited) {
          const submit = await submitContinueDraft();
          sendResponse({
            ok: true,
            clicked: false,
            submitted: submit.submitted,
            submitMethod: submit.method,
            limited: false,
            reason: submit.submitted ? submit.reason : 'already-clear'
          });
          if (submit.submitted) setTimeout(() => reportState(true), 2500);
          return;
        }

        const activeLimit = findActiveUsageLimitAction();
        const button = activeLimit?.button || null;
        let clicked = false;

        if (button) {
          button.click();
          clicked = true;
          await new Promise((resolve) => setTimeout(resolve, 900));
        }

        const submit = await submitContinueDraft();

        if (!clicked && !submit.submitted) {
          sendResponse({
            ok: false,
            clicked: false,
            submitted: false,
            limited: true,
            reason: 'button-not-found'
          });
          return;
        }

        sendResponse({
          ok: true,
          clicked,
          submitted: submit.submitted,
          submitMethod: submit.method,
          limited: true,
          reason: submit.submitted ? submit.reason : 'clicked'
        });
        setTimeout(() => reportState(true), 2500);
      })().catch((error) => {
        sendResponse({
          ok: false,
          clicked: false,
          submitted: false,
          limited: true,
          reason: String(error?.message || error)
        });
      });
      return true;
    }
  });

  reportState(true);
})();
