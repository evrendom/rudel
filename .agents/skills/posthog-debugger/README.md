# PostHog Debugger

A Claude skill that inspects and debugs PostHog implementations on any website using browser automation tools.

## What it does

This skill helps you understand exactly how PostHog is implemented on a page by:

1. **Inspecting the PostHog object** – Checks the global `posthog` object for configuration, version, and state
2. **Analyzing network traffic** – Identifies requests to PostHog endpoints (events, session recording, feature flags)
3. **Detecting issues** – Finds common problems like multiple instances, opt-out status, or missing configuration
4. **Reporting findings** – Provides a clear summary of the implementation

## Features

- **Full implementation audit** – Version, API host, token, autocapture, session recording, persistence
- **Feature flag inspection** – See which flags are loaded and their values
- **Session & identity info** – View distinct ID, session ID, and device ID
- **Network analysis** – Track what data is being sent to PostHog
- **Issue detection** – Identify common implementation problems
- **Script loading analysis** – Check how PostHog is loaded (CDN, self-hosted, bundled)

## Requirements

- **Claude** with skills support
- **Browser automation MCP** – Either:
  - Chrome DevTools MCP (recommended)
  - Playwright MCP

## Prerequisites

### Chrome DevTools MCP Setup

1. Chrome must be running with remote debugging enabled
2. Chrome DevTools MCP must be configured in Claude

To start Chrome with remote debugging:
```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Windows
chrome.exe --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222
```

### For Authenticated Pages

Claude will automatically detect if a page requires login:

1. Claude navigates to the URL you provide
2. If a login page is detected, Claude will ask you to log in using the browser it opened
3. Log in to the webapp in Chrome
4. Tell Claude "I'm logged in" or "ready"
5. Claude will verify authentication and proceed with inspection

You don't need to pre-open Chrome or navigate manually - Claude handles the browser.

## Usage

Ask Claude to inspect a PostHog implementation:

```
"How is PostHog implemented on https://example.com?"
```

Or ask specific questions:

```
"Is session recording enabled on https://mysite.com?"
"What feature flags are active on this page?"
"Are there any issues with the PostHog setup on https://app.example.com?"
```

## Example Output

```
## PostHog Implementation Summary

### Status
✅ Installed

### Implementation Type
Global window.posthog

### Configuration
- **Version:** 1.96.1
- **API Host:** https://us.i.posthog.com (US Cloud)
- **Project Token:** phc_abc123def456ghi789jkl012mno345
- **Persistence:** localStorage+cookie

### Features (Module Loaded → Feature Enabled)
| Feature | Module Loaded | Enabled |
|---------|---------------|---------|
| Autocapture | ✅ | ✅ |
| Session Recording | ✅ | ✅ |
| Surveys | ✅ | ❌ |
| Feature Flags | ✅ | ✅ |

### Identifiers
- **Distinct ID:** 018d4f2a-1234-7abc-def0-123456789abc
- **Session ID:** 018d4f2a-5678-7xyz-abc0-987654321xyz

### Feature Flags
- `new-checkout-flow` ✅
- `beta-features` ❌

### Network Activity
- Events endpoint: ✅
- Session recording: ✅
- Decide/flags endpoint: ✅

### Issues Found
✅ None detected

### Other Analytics Tools Detected
- Google Tag Manager
- Google Analytics
- HubSpot

### Other External Scripts
- cdn.example-vendor.com
```

## What It Checks

| Check | Description |
|-------|-------------|
| PostHog object | Whether `posthog` exists on window or is bundled |
| Implementation type | Global, bundled, or custom proxy |
| Version | Library version being used |
| API Host | Where data is being sent (US/EU cloud, custom proxy, or self-hosted) |
| Module vs Feature | Distinguishes between JS module loaded vs feature enabled |
| Autocapture | Whether automatic event capture is enabled |
| Session Recording | Whether recordings are active |
| Surveys | Whether surveys module is loaded and enabled |
| Feature Flags | Which flags are loaded and their states |
| Network Requests | Traffic to PostHog endpoints (including custom proxies) |
| Console Debug Logs | PostHog debug output (via `?__posthog_debug=true`) |
| Multiple Instances | Detects duplicate initialization |
| Opt-out Status | Whether user has opted out of tracking |
| Other Analytics Tools | Known tracking/analytics tools detected on the page |
| Other External Scripts | Third-party scripts not matched to known tools |

## Troubleshooting

### "Cannot connect to Chrome"

- Make sure Chrome is running with `--remote-debugging-port=9222`
- Check that no other process is using port 9222
- Try restarting Chrome with the debugging flag

### "Page not found in browser tabs"

- Use `list_pages` to see available tabs
- Navigate to the page manually in Chrome first
- Make sure you're not in incognito mode (unless MCP supports it)

### "PostHog not detected but I know it's installed"

PostHog might be:
- Loaded asynchronously and not yet initialized
- Behind a consent banner (user hasn't accepted cookies)
- Using a custom variable name instead of `posthog`
- Blocked by an ad blocker

Try:
- Waiting a few seconds and re-running the check
- Accepting any cookie/consent banners
- Disabling ad blockers temporarily

### "Session recording shows inactive but I enabled it"

Session recording may be:
- Configured but not started yet (waiting for user interaction)
- Disabled for this specific user segment
- Blocked by browser privacy settings
- Waiting for the `/decide` endpoint response

## Files

```
posthog-debugger/
├── README.md    # This file
└── SKILL.md     # Main skill instructions
```
