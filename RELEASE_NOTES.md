# Claude Code Web Auto-Retry v1.0.1

This release fixes the retry flow after Claude Code Web usage resets.

## Fixed

- Automatically submits the `continue` draft after clicking **Try again**.
- Finds and clicks Claude's enabled **Send** / **Submit** control when available.
- Falls back to `form.requestSubmit()` and Enter-key submission if Claude changes the button markup.
- Verifies that submission actually started before treating the retry as successful.

## Existing behavior

- Detects Claude Code Web **Usage limit reached** states.
- Parses the displayed reset time.
- Schedules retry for the reset time plus a configurable buffer.
- Retries again if usage has not propagated yet.
- Handles discarded background tabs when enabled.
- Keeps separate retry schedules for multiple Claude tabs.
- Sends no telemetry and makes no external network requests.

## Install

1. Download `claude-code-web-auto-retry-v1.0.1.zip` from this release.
2. Extract it.
3. Open `chrome://extensions/` or `edge://extensions/`.
4. Enable **Developer mode**.
5. Choose **Load unpacked** and select the extracted folder.
6. Refresh any open Claude Code Web tabs.

Built for Claude Code on the web at `claude.ai`, not the Claude Code CLI.
