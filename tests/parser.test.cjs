const assert = require('node:assert/strict');
require('../shared.js');

const { parseResetTime, findNearestResetTime, hasUsageLimitText } = global.CUAR;

function localMs(y, m, d, h, min) {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

assert.equal(hasUsageLimitText('Usage limit reached'), true);
assert.equal(hasUsageLimitText("You've reached your usage limit. Try again later."), true);
assert.equal(hasUsageLimitText('Everything is fine.'), false);

{
  const now = localMs(2026, 8, 10, 1, 49);
  const got = parseResetTime('Usage limit reached. Resets at 4:10 AM', now);
  assert.equal(got, localMs(2026, 8, 10, 4, 10));
}

{
  const now = localMs(2026, 8, 10, 23, 49);
  const got = parseResetTime('Resets at 4:10 AM', now);
  assert.equal(got, localMs(2026, 8, 11, 4, 10));
}

{
  const now = localMs(2026, 8, 10, 13, 0);
  const got = parseResetTime('Resets at 16:30', now);
  assert.equal(got, localMs(2026, 8, 10, 16, 30));
}

{
  const now = localMs(2026, 8, 10, 1, 0);
  const got = parseResetTime('Usage limit reached — resets in 2h 15m', now);
  assert.equal(got, now + (135 * 60 * 1000));
}

{
  const now = localMs(2026, 8, 10, 19, 0);
  const got = findNearestResetTime(
    'Old limit: Resets at 4:10 AM. Current limit: Resets at 8:30 PM.',
    now
  );
  assert.equal(got.timestamp, localMs(2026, 8, 10, 20, 30));
  assert.equal(got.text.toLowerCase(), 'resets at 8:30 pm');
}

{
  const now = localMs(2026, 8, 10, 23, 0);
  const got = findNearestResetTime(
    'Old limit: Resets at 8:30 PM. Current limit: Resets at 4:10 AM.',
    now
  );
  assert.equal(got.timestamp, localMs(2026, 8, 11, 4, 10));
  assert.equal(got.text.toLowerCase(), 'resets at 4:10 am');
}

{
  const now = localMs(2026, 8, 10, 19, 0);
  const got = findNearestResetTime('Resets at 21:05', now);
  assert.equal(got.timestamp, localMs(2026, 8, 10, 21, 5));
}

console.log('parser tests: PASS');
