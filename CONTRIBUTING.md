# Contributing

Contributions are welcome, especially fixes for Claude UI changes, additional reset-time formats, browser compatibility, and regression tests.

## Design rules

Keep this extension small and boring:

1. Do not add telemetry, analytics, remote scripts, or third-party services.
2. Do not automate billing or attempt to bypass usage limits.
3. Prefer visible text and accessibility attributes over private CSS class names.
4. Prefer event-driven detection and `chrome.alarms` over permanent high-frequency polling.
5. Keep retry behavior idempotent and bounded.
6. Do not inject user prompts or modify Claude conversation content.
7. Keep host permissions limited to Claude unless there is a documented technical requirement.

## Local validation

Run:

```bash
node tests/parser.test.cjs
node --check shared.js
node --check content.js
node --check background.js
node --check popup.js
```

Then load the repository using Chrome/Edge **Load unpacked** and verify the popup opens without console errors.

## Reporting Claude UI breakage

A useful issue includes:

- browser + version;
- exact visible text of the usage-limit message;
- exact visible reset-time text;
- whether **Try again** is visible;
- whether an artifact/sidebar/panel is open;
- a screenshot with private content removed;
- content-script or service-worker console errors, if any.
