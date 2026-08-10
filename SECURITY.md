# Security Policy

## Scope

Claude Code Web Auto-Retry is a browser extension that runs on `https://claude.ai/*` in order to detect Claude's visible usage-limit state and click **Try again** after the displayed reset time.

Because any content script running on Claude can technically inspect page content, this repository treats minimal permissions and zero data exfiltration as core requirements.

## Privacy guarantees

The extension currently:

- does not include analytics or telemetry;
- does not make third-party network requests;
- does not upload conversation content;
- does not upload account or usage information;
- does not load remote JavaScript;
- does not inject prompts into Claude conversations;
- stores retry settings and schedules only in `chrome.storage.local`.

## Permissions

- `storage` — settings and retry schedules.
- `alarms` — wake the extension near the displayed reset time.
- `tabs` — identify Claude tabs and recover Chrome-discarded tabs.
- `scripting` — re-inject the packaged content scripts when necessary.
- `https://claude.ai/*` — restrict host access to Claude.

## Reporting a vulnerability

Please open a GitHub security advisory for vulnerabilities that could expose user data, execute untrusted code, or cause unsafe browser behavior. For lower-severity bugs that do not expose sensitive data, a normal GitHub issue is fine.

When reporting, include the browser/version, extension version or commit SHA, reproduction steps, and the smallest useful console output. Do not include private Claude conversation content unless it is necessary to reproduce the issue.
