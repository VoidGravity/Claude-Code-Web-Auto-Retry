# Changelog

All notable changes to Claude Code Web Auto-Retry will be documented here.

## 1.0.1 - 2026-08-10

### Fixed

- Submit a `continue` draft after **Try again** when Claude Code Web leaves it in the composer instead of sending it.
- Detect the actual enabled send/submit control near the Claude composer.
- Fall back to form submission and Enter when the send control markup changes.
- Verify that submission actually started before treating the retry as successful.

## 1.0.0 - 2026-08-10

### Added

- Claude Code Web usage-limit detection.
- Parsing for 12-hour, 24-hour, and relative reset times.
- Browser-alarm scheduling at reset time plus a configurable buffer.
- Automatic **Try again** interaction and post-click verification.
- Configurable retry interval and maximum attempts.
- Recovery for Chrome-discarded Claude tabs.
- Independent schedules for multiple Claude tabs.
- Popup controls for settings, manual retry, and clearing schedules.
- Parser tests.
- No-telemetry security and privacy policy.
