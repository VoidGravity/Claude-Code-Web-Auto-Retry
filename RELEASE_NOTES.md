# Claude Code Web Auto-Retry v1.0.2

This release fixes stale reset-cycle state after an automatic retry succeeds.

## Fixed

- Stops treating old historical **Usage limit reached** text as an active current limit.
- Requires a visible active **Try again** / **Retry** control tied to a usage-limit card before arming a retry cycle.
- Clears the old detection fingerprint after the limit UI disappears, so the same Claude tab can automatically detect the next usage-limit cycle without a reload.
- When several old and new `Resets at ...` timestamps remain in the page, chooses the nearest valid upcoming reset instead of blindly using the first historical match.
- A changed reset timestamp now starts a fresh schedule instead of inheriting the previous cycle's `nextAttemptAt` or attempt count.

## Existing behavior

- Automatically clicks **Try again** after usage resets.
- Automatically submits Claude's `continue` draft and verifies that generation resumes.
- Retries again if the account limit has not propagated yet.
- Handles discarded background tabs when enabled.
- Keeps independent schedules for multiple Claude tabs.
- Sends no telemetry and makes no external network requests.

## Install / update

1. Download `claude-code-web-auto-retry-v1.0.2.zip` from this release.
2. Extract it.
3. Open `chrome://extensions/` or `edge://extensions/`.
4. Replace/update the unpacked extension folder, then click **Reload** on the extension.
5. Refresh any open Claude Code Web tabs once so the v1.0.2 content script is loaded.

After that, future reset cycles in the same tab should be picked up automatically; you should not need to press **Forget** or reload between cycles.

Built for Claude Code on the web at `claude.ai`, not the Claude Code CLI.
