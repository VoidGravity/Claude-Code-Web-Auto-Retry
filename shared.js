(function (root) {
  'use strict';

  const DEFAULTS = Object.freeze({
    enabled: true,
    bufferSeconds: 45,
    retryIntervalSeconds: 60,
    maxAttempts: 10,
    reloadDiscardedTabs: true
  });

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function hasUsageLimitText(text) {
    const t = normalizeText(text).toLowerCase();
    return (
      t.includes('usage limit reached') ||
      t.includes("you've reached your usage limit") ||
      t.includes('you have reached your usage limit') ||
      t.includes('you’ve reached your usage limit')
    );
  }

  function parseResetTime(text, nowMs = Date.now()) {
    const input = normalizeText(text);
    if (!input) return null;

    const now = new Date(nowMs);

    const relativeMatch = input.match(/resets?\s+in\s+(?:(\d+)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes))?/i);
    if (relativeMatch && (relativeMatch[1] || relativeMatch[2])) {
      const hours = Number(relativeMatch[1] || 0);
      const minutes = Number(relativeMatch[2] || 0);
      return nowMs + ((hours * 60 + minutes) * 60 * 1000);
    }

    const twelveHour = input.match(/resets?(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
    if (twelveHour) {
      let hour = Number(twelveHour[1]);
      const minute = Number(twelveHour[2] || 0);
      const meridiem = twelveHour[3].toUpperCase();
      if (hour < 1 || hour > 12 || minute > 59) return null;
      if (hour === 12) hour = 0;
      if (meridiem === 'PM') hour += 12;

      const candidate = new Date(now);
      candidate.setHours(hour, minute, 0, 0);
      if (candidate.getTime() <= nowMs + 5000) {
        candidate.setDate(candidate.getDate() + 1);
      }
      return candidate.getTime();
    }

    const twentyFourHour = input.match(/resets?(?:\s+at)?\s+([01]?\d|2[0-3]):([0-5]\d)\b/i);
    if (twentyFourHour) {
      const hour = Number(twentyFourHour[1]);
      const minute = Number(twentyFourHour[2]);
      const candidate = new Date(now);
      candidate.setHours(hour, minute, 0, 0);
      if (candidate.getTime() <= nowMs + 5000) {
        candidate.setDate(candidate.getDate() + 1);
      }
      return candidate.getTime();
    }

    return null;
  }

  function findNearestResetTime(text, nowMs = Date.now()) {
    const input = normalizeText(text);
    if (!input) return null;

    const patterns = [
      /resets?\s+in\s+(?:(?:\d+)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(?:\d+)\s*(?:m|min|mins|minute|minutes))?/gi,
      /resets?(?:\s+at)?\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/gi,
      /resets?(?:\s+at)?\s+(?:[01]?\d|2[0-3]):[0-5]\d\b/gi
    ];

    const seen = new Set();
    const candidates = [];

    for (const pattern of patterns) {
      for (const match of input.matchAll(pattern)) {
        const candidateText = normalizeText(match[0]);
        const key = `${match.index}:${candidateText.toLowerCase()}`;
        if (!candidateText || seen.has(key)) continue;
        seen.add(key);

        const timestamp = parseResetTime(candidateText, nowMs);
        if (!timestamp) continue;
        candidates.push({
          timestamp,
          text: candidateText,
          index: match.index || 0
        });
      }
    }

    if (!candidates.length) {
      const timestamp = parseResetTime(input, nowMs);
      return timestamp ? { timestamp, text: null, index: 0 } : null;
    }

    candidates.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      return b.index - a.index;
    });

    return candidates[0];
  }

  function formatTime(timestamp) {
    if (!timestamp) return 'Unknown';
    try {
      return new Date(timestamp).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return new Date(timestamp).toString();
    }
  }

  root.CUAR = Object.freeze({
    DEFAULTS,
    normalizeText,
    hasUsageLimitText,
    parseResetTime,
    findNearestResetTime,
    formatTime
  });
})(globalThis);
