---
name: posthog-debugger
description: Debug and inspect PostHog implementations on any website. Use this skill when a user wants to understand how PostHog is implemented on a page, troubleshoot tracking issues, verify configuration, check what events are being sent, or audit a PostHog setup. Works with Chrome DevTools MCP and Playwright MCP to inspect live websites.
---

# PostHog Debugger

Inspect and debug PostHog implementations on any website using browser automation tools. This skill helps developers and product teams understand exactly how PostHog is configured and what data is being captured.

## Critical Rules

1. **Always ask for the URL first** if not provided.
2. **Always ask if the page requires login.** If yes, guide the user to log in via Chrome first.
3. **Use browser tools to navigate and inspect.** Prefer Chrome DevTools MCP (`mcp__chrome-devtools__*`) or Playwright MCP (`mcp__playwright__*`) tools.
4. **Check multiple signals.** PostHog can be implemented in various ways - check scripts, network requests, and the window object.
5. **Report findings clearly.** Summarize what you find in a structured format.
6. **Never modify anything.** This is read-only inspection.

## Initial Flow

When a user asks to inspect a PostHog implementation:

1. **Get the URL** (if not provided)
2. **Navigate to the URL** with `?__posthog_debug=true` appended
3. **Check if login is required** by taking a snapshot and looking for login indicators
4. **If login required**, ask the user to authenticate in the browser
5. **Once authenticated**, proceed with inspection

## Detecting Login Pages

After navigating, take a snapshot and look for login indicators:
- Page title contains "login", "sign in", "authenticate"
- URL contains "login", "signin", "auth", "sso"
- Page has username/password fields
- Page shows "Sign in with Google/GitHub/etc." buttons

## Authenticated Pages Workflow

If you detect a login page or the user mentions the page requires auth:

1. **Keep the browser open** - you've already navigated there
2. **Ask the user to log in:**
   ```
   "This page requires authentication. Please log in using the Chrome browser I just opened. Let me know when you're logged in and on the page you want to inspect."
   ```

3. **Once the user confirms**, take a new snapshot to verify they're authenticated

4. **Add the debug parameter** if not already present and reload if needed

5. **Proceed with inspection**

## Available Browser Tools

### Chrome DevTools MCP
- `mcp__chrome-devtools__navigate_page` - Navigate to URL
- `mcp__chrome-devtools__take_snapshot` - Get page accessibility tree
- `mcp__chrome-devtools__evaluate_script` - Run JavaScript to inspect PostHog
- `mcp__chrome-devtools__list_network_requests` - See network traffic
- `mcp__chrome-devtools__get_network_request` - Get request details
- `mcp__chrome-devtools__list_console_messages` - Check for errors

### Playwright MCP
- `mcp__playwright__browser_navigate` - Navigate to URL
- `mcp__playwright__browser_snapshot` - Get page snapshot
- `mcp__playwright__browser_evaluate` - Run JavaScript
- `mcp__playwright__browser_network_requests` - See network traffic
- `mcp__playwright__browser_console_messages` - Check console

## Inspection Workflow

### Step 1: Navigate to the Page with Debug Mode

**Always add `?__posthog_debug=true`** to the URL to enable PostHog's debug mode. This outputs detailed logs to the console.

- If URL has no query string: `https://example.com?__posthog_debug=true`
- If URL already has query string: `https://example.com?foo=bar&__posthog_debug=true`

**Workflow:**

1. **Navigate to the URL** with the debug parameter
2. **Take a snapshot** to see what loaded
3. **Check for login page indicators:**
   - URL redirected to `/login`, `/signin`, `/auth`, `/sso`
   - Page title contains "log in", "sign in"
   - Page has login form fields
4. **If login detected:**
   - Tell the user: "I've opened the page but it requires login. Please log in using Chrome, then let me know when you're ready."
   - Wait for user confirmation
   - Take a new snapshot to verify authentication
   - Add debug parameter to the new URL if needed
5. **If no login needed:** Proceed with inspection

### Step 2: Check PostHog Global Object

Execute JavaScript to inspect the `posthog` object on the window:

```javascript
(() => {
  if (typeof posthog === 'undefined') {
    return { installed: false };
  }

  const ph = posthog;
  return {
    installed: true,
    version: ph.version || ph.LIB_VERSION || 'unknown',
    config: {
      token: ph.config?.token || ph.get_config?.('token') || 'not accessible',
      apiHost: ph.config?.api_host || ph.get_config?.('api_host') || 'not accessible',
      autocapture: ph.config?.autocapture ?? ph.get_config?.('autocapture') ?? 'not accessible',
      capturePageview: ph.config?.capture_pageview ?? ph.get_config?.('capture_pageview') ?? 'not accessible',
      capturePageleave: ph.config?.capture_pageleave ?? ph.get_config?.('capture_pageleave') ?? 'not accessible',
      sessionRecording: ph.config?.enable_recording_console_log !== undefined ||
                        ph.sessionRecording?.started ||
                        'check network',
      persistence: ph.config?.persistence || ph.get_config?.('persistence') || 'not accessible',
      debug: ph.config?.debug ?? ph.get_config?.('debug') ?? false
    },
    distinctId: ph.get_distinct_id?.() || 'not accessible',
    sessionId: ph.get_session_id?.() || 'not accessible',
    featureFlags: ph.getFeatureFlag ? Object.keys(ph.featureFlags?.flags || {}) : [],
    activeFeatureFlags: ph.getFeatureFlag ?
      Object.entries(ph.featureFlags?.flags || {})
        .filter(([_, v]) => v)
        .map(([k]) => k) : []
  };
})()
```

### Step 2b: Check for Bundled PostHog (Remote Config)

If `posthog` is not on `window`, check for bundled implementations that use `_POSTHOG_REMOTE_CONFIG`:

```javascript
(() => {
  const remoteConfig = window._POSTHOG_REMOTE_CONFIG;
  if (!remoteConfig) {
    return { found: false };
  }

  const tokens = Object.keys(remoteConfig);
  const configs = tokens.map(token => {
    const cfg = remoteConfig[token]?.config || {};
    return {
      token,
      hasFeatureFlags: cfg.hasFeatureFlags || false,
      autocapture: !cfg.autocapture_opt_out,
      sessionRecording: cfg.sessionRecording || false,
      heatmaps: cfg.heatmaps || false,
      surveys: cfg.surveys || false,
      capturePerformance: cfg.capturePerformance || {},
      defaultIdentifiedOnly: cfg.defaultIdentifiedOnly || false
    };
  });

  return {
    found: true,
    bundled: true,
    configs
  };
})()
```

### Step 2c: Check Console for PostHog Debug Messages

With `?__posthog_debug=true`, PostHog outputs detailed logs. Use `list_console_messages` and look for `[PostHog.js]` entries:

**Key messages to look for:**
- `[PostHog.js] Persistence loaded` - Shows persistence type (localStorage, sessionStorage, cookie)
- `[PostHog.js] [Surveys] Surveys loaded successfully` - Surveys module loaded
- `[PostHog.js] [Surveys] flags response received, isSurveysEnabled: X` - Whether surveys are enabled
- `[PostHog.js] [SessionRecording]` - Session recording status
- `[PostHog.js] [WebExperiments]` - Web experiments/feature flags
- `[PostHog.js] set_config` - Configuration changes

**Important distinction:**
- **Module loaded** = The JavaScript file loaded successfully
- **Feature enabled** = The feature is turned on in PostHog settings

A module can load but still be disabled. For example:
```
[PostHog.js] [Surveys] Surveys loaded successfully  <- Module loaded
[PostHog.js] [Surveys] flags response received, isSurveysEnabled: false  <- Feature disabled
```

### Step 3: Check for PostHog Script

Look for PostHog scripts in the page:

```javascript
(() => {
  const scripts = Array.from(document.querySelectorAll('script'));
  const posthogScripts = scripts.filter(s =>
    (s.src && (s.src.includes('posthog') || s.src.includes('ph.js'))) ||
    (s.textContent && (s.textContent.includes('posthog.init') || s.textContent.includes('!function(t,e)')))
  );

  return {
    found: posthogScripts.length > 0,
    scripts: posthogScripts.map(s => ({
      src: s.src || 'inline',
      async: s.async,
      defer: s.defer,
      type: s.type || 'text/javascript'
    }))
  };
})()
```

### Step 4: Check Network Requests

Filter network requests to find PostHog traffic. PostHog may use:

**Standard domains:**
- `*.posthog.com`
- `us.i.posthog.com` / `eu.i.posthog.com`
- `us-assets.i.posthog.com` / `eu-assets.i.posthog.com`

**Custom proxy domains** (common patterns):
- `ph.yourcompany.com`
- `analytics.yourcompany.com`
- `t.yourcompany.com`
- Any domain with `/array/phc_` in the path (PostHog config)

**Endpoints to look for:**
- `/e/` or `/capture/` - Events
- `/s/` - Session recording
- `/decide/` or `/flags/` - Feature flags
- `/batch/` - Batched events
- `/array/phc_*/config.js` - Remote config (bundled implementations)
- `/static/surveys.js` - Surveys module
- `/static/recorder.js` - Session recording module

**How to identify a custom proxy:**
1. Look for requests with PostHog-specific paths (`/flags/`, `/array/phc_`)
2. Check network request details for PostHog headers
3. Look for `phc_` tokens in request URLs or bodies

### Step 5: Check for Common Issues

Run diagnostics:

```javascript
(() => {
  const issues = [];

  // Check if posthog exists
  if (typeof posthog === 'undefined') {
    issues.push('PostHog not found on window object');
    return { issues };
  }

  // Check for multiple instances
  if (window.__POSTHOG_INSTANCES__ && window.__POSTHOG_INSTANCES__.length > 1) {
    issues.push('Multiple PostHog instances detected - may cause duplicate events');
  }

  // Check if initialized
  if (!posthog.get_distinct_id || !posthog.get_distinct_id()) {
    issues.push('PostHog may not be fully initialized');
  }

  // Check consent mode
  if (posthog.has_opted_out_capturing && posthog.has_opted_out_capturing()) {
    issues.push('User has opted out of tracking');
  }

  // Check for debug mode in production
  const isDebug = posthog.config?.debug || posthog.get_config?.('debug');
  const hostname = window.location.hostname;
  if (isDebug && !hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
    issues.push('Debug mode is enabled in production');
  }

  // Check autocapture
  const autocapture = posthog.config?.autocapture ?? posthog.get_config?.('autocapture');
  if (autocapture === false) {
    issues.push('Autocapture is disabled - only manual events will be tracked');
  }

  return {
    issues: issues.length > 0 ? issues : ['No issues detected'],
    checksRun: true
  };
})()
```

### Step 6: Capture Recent Events (if debug available)

If debug mode is on or we can access the queue:

```javascript
(() => {
  if (typeof posthog === 'undefined') return { events: [] };

  // Try to get queued events
  const queue = posthog._requestQueue?.queue ||
                posthog.requestQueue?.queue ||
                [];

  // Get recent events from persistence if available
  const stored = posthog.persistence?.props?.$stored_events || [];

  return {
    queuedEvents: queue.length,
    recentEventTypes: [...new Set([...queue, ...stored].map(e => e?.event || 'unknown').slice(0, 20))]
  };
})()
```

### Step 7: Detect Other Analytics Tools

Scan network requests and scripts to identify all analytics/tracking tools on the page. Use known patterns for named tools, and detect unknown tracking scripts as a fallback.

```javascript
(() => {
  const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
  const hostname = window.location.hostname.replace('www.', '');
  const knownTools = [];
  const matchedScripts = new Set();

  const patterns = {
    'Google Analytics': /google-analytics\.com|gtag\/js/i,
    'Google Tag Manager': /googletagmanager\.com\/gtm/i,
    'Facebook Pixel': /connect\.facebook\.net.*fbevents/i,
    'LinkedIn Insight': /snap\.licdn\.com/i,
    'HubSpot': /js\.hs-scripts\.com|js\.hsforms\.com/i,
    'Hotjar': /static\.hotjar\.com/i,
    'Segment': /cdn\.segment\.com/i,
    'Mixpanel': /cdn\.mxpnl\.com|mixpanel\.com/i,
    'Amplitude': /cdn\.amplitude\.com/i,
    'Heap': /heap-analytics\.com|heapanalytics\.com/i,
    'Intercom': /widget\.intercom\.io|intercomcdn\.com/i,
    'Drift': /js\.driftt\.com/i,
    'Zendesk': /static\.zdassets\.com/i,
    'Crisp': /client\.crisp\.chat/i,
    'FullStory': /fullstory\.com\/s\/fs\.js/i,
    'LogRocket': /cdn\.logrocket\.com/i,
    'Sentry': /browser\.sentry-cdn\.com/i,
    'Datadog': /datadoghq\.com/i,
    'Snowplow': /cdn\.snowplow/i,
    'Rudderstack': /cdn\.rudderlabs\.com/i,
    'Clearbit': /tag\.clearbitscripts\.com/i,
    'Dreamdata': /cdn\.dreamdata\.cloud/i,
    'GrowthBook': /cdn\.growthbook\.io/i,
    'LaunchDarkly': /sdk\.launchdarkly\.com/i,
    'Optimizely': /cdn\.optimizely\.com/i,
    'VWO': /dev\.visualwebsiteoptimizer\.com/i,
    'Ahrefs': /analytics\.ahrefs\.com/i,
    'AdRoll': /s\.adroll\.com/i,
    'Factors.ai': /app\.factors\.ai/i,
    'Vector': /cdn\.vector\.co/i,
    'Leadfeeder': /sc\.lfeeder\.com/i,
    'Pendo': /cdn\.pendo\.io/i,
    'Chameleon': /fast\.chameleon\.io/i,
    'Appcues': /fast\.appcues\.com/i,
    'UserPilot': /js\.userpilot\.io/i,
    'Mouseflow': /cdn\.mouseflow\.com/i,
    'Lucky Orange': /tools\.luckyorange\.com/i,
    'Crazy Egg': /script\.crazyegg\.com/i,
    'Plausible': /plausible\.io\/js/i,
    'Fathom': /cdn\.usefathom\.com/i,
    'Simple Analytics': /scripts\.simpleanalyticscdn\.com/i,
    'Matomo': /matomo\.js|piwik\.js/i,
    'Klaviyo': /static\.klaviyo\.com/i,
    'Customer.io': /track\.customer\.io/i,
    'Braze': /sdk\.iad-\d+\.braze\.com/i,
    'OneSignal': /cdn\.onesignal\.com/i,
    'Insider': /insr\.io/i,
    'Mutiny': /cdn\.mutinycdn\.com/i,
    'Qualified': /js\.qualified\.com/i,
    'Chilipiper': /js\.chilipiper\.com/i,
    'Typekit': /use\.typekit\.net/i,
    'Google Fonts': /fonts\.googleapis\.com/i,
    'Cookiebot': /consent\.cookiebot\.com/i,
    'OneTrust': /cdn\.cookielaw\.org/i,
    'TrustArc': /consent\.trustarc\.com/i,
    'Osano': /cmp\.osano\.com/i,
    'Usercentrics': /app\.usercentrics\.eu/i,
    'OpenLI/Legal Monster': /widgets\.legalmonster\.com|openli\.com/i,
    'Nelio A/B Testing': /nelio-ab-testing/i,
    'Mesh': /mesh-interactive|withmesh\.com/i,
    'Reddit Pixel': /redditstatic\.com|rdt\.li/i,
    'Webflow': /wdfl\.co|webflow\.com\/js/i,
    'Dub.co': /dubcdn\.com|dub\.co/i
  };

  // Match known tools
  for (const [name, pattern] of Object.entries(patterns)) {
    for (const src of scripts) {
      if (pattern.test(src)) {
        knownTools.push(name);
        matchedScripts.add(src);
        break;
      }
    }
  }

  // Find unknown tracking scripts
  const trackingKeywords = /track|analytics|pixel|tag|beacon|collect|measure|metric|event|telemetry|monitor/i;
  const unknownScripts = scripts.filter(src => {
    if (matchedScripts.has(src)) return false;
    try {
      const url = new URL(src);
      const scriptHost = url.hostname.replace('www.', '');
      // Skip same-domain scripts
      if (scriptHost === hostname || scriptHost.endsWith('.' + hostname)) return false;
      // Skip common CDNs that host non-tracking code
      if (/unpkg\.com|jsdelivr\.net|cdnjs\.cloudflare\.com|ajax\.googleapis\.com/i.test(scriptHost)) return false;
      // Include if it has tracking-like keywords or is from a third-party
      return trackingKeywords.test(src) || true;
    } catch {
      return false;
    }
  });

  // Extract just the domain from unknown scripts for cleaner output
  const unknownDomains = [...new Set(unknownScripts.map(src => {
    try {
      return new URL(src).hostname;
    } catch {
      return src;
    }
  }))].sort();

  return {
    knownTools: [...new Set(knownTools)].sort(),
    unknownScripts: unknownDomains
  };
})()
```

## Response Format

After inspection, provide a structured summary. Be factual and concise - no commentary or recommendations unless asked. Use emojis to indicate status at a glance.

**Status emojis:**
- ✅ = Yes / Enabled / Active / Installed
- ❌ = No / Disabled / Not found
- ⚠️ = Warning / Issue detected

```
## PostHog Implementation Summary

### Status
✅ Installed / ✅ Installed (bundled) / ❌ Not Found

### Implementation Type
[Global window.posthog / Bundled (not exposed globally) / Custom proxy]

### Configuration
- **Version:** [version]
- **API Host:** [host] ([US/EU Cloud] / [Custom proxy] / [Self-hosted])
- **Project Token:** [full token]
- **Persistence:** [localStorage/sessionStorage/cookie/memory]

### Features (Module Loaded → Feature Enabled)
| Feature | Module Loaded | Enabled |
|---------|---------------|---------|
| Autocapture | ✅ / ❌ | ✅ / ❌ |
| Session Recording | ✅ / ❌ | ✅ / ❌ |
| Surveys | ✅ / ❌ | ✅ / ❌ |
| Heatmaps | ✅ / ❌ | ✅ / ❌ |
| Feature Flags | ✅ / ❌ | ✅ / ❌ |
| Web Vitals | ✅ / ❌ | ✅ / ❌ |

### Identifiers
- **Distinct ID:** [id]
- **Session ID:** [id]

### Feature Flags
[List of active flags or "None loaded"]

### Network Activity
- Events endpoint: ✅ / ❌
- Session recording: ✅ / ❌
- Decide/flags endpoint: ✅ / ❌
- Surveys endpoint: ✅ / ❌

### Issues Found
✅ None detected
— or —
⚠️ [Issue description]

### Script Loading
- **Source:** [CDN/Self-hosted/NPM bundle/Custom proxy]
- **Loading:** [Async/Sync/Defer]

### Other Analytics Tools Detected
[List of recognized analytics, tracking, and marketing tools]

### Other External Scripts
[Third-party script domains not matched to known tools]
```

## Common Questions and How to Answer Them

### "How is PostHog implemented on this page?"
Run full inspection workflow and provide complete summary.

### "Is PostHog tracking working?"
1. Check if posthog object exists
2. Verify network requests are being sent
3. Check for any errors in console
4. Look for opted-out status

### "What events are being tracked?"
1. Check autocapture status
2. Look at network requests to `/e/` or `/capture/`
3. Try to access event queue
4. Note if $pageview, $pageleave, etc. are enabled

### "Is session recording enabled?"
1. Check config for recording settings
2. Look for `/s/` network requests
3. Check sessionRecording object state

### "What feature flags are active?"
1. Check featureFlags object on posthog
2. Look for `/decide/` network request
3. List all flags and their values

### "Are there any issues with the implementation?"
Run the diagnostic checks and report findings.

### "Is this using the EU or US cloud?"
Check the api_host configuration:
- `us.i.posthog.com` = US Cloud
- `eu.i.posthog.com` = EU Cloud
- `app.posthog.com` = Legacy (defaults to US)
- Custom domain = Self-hosted or proxy

## Example Conversation

**User:** "How is PostHog implemented on https://example.com?"

**Claude:** "I'll navigate to example.com with debug mode enabled and inspect the PostHog implementation."

[Navigates to https://example.com?__posthog_debug=true]
[Runs JavaScript checks]
[Checks console for PostHog debug messages]
[Analyzes network requests]

**Claude:**
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
| Heatmaps | ❌ | ❌ |
| Feature Flags | ✅ | ✅ |
| Web Vitals | ✅ | ✅ |

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
- Surveys endpoint: ✅

### Issues Found
✅ None detected

### Script Loading
- **Source:** CDN (us-assets.i.posthog.com)
- **Loading:** Async

### Other Analytics Tools Detected
- Google Tag Manager
- Google Analytics
- HubSpot

### Other External Scripts
- cdn.example-vendor.com
```

---

**Example 2: Authenticated page with custom proxy**

**User:** "Check PostHog on https://app.example.com/dashboard"

**Claude:** "I'll navigate to that page with debug mode enabled."

[Navigates to https://app.example.com/dashboard?__posthog_debug=true]
[Takes snapshot, sees login page]

**Claude:** "I've opened the page but it requires login. Please log in using the Chrome browser I just opened. Let me know when you're on the dashboard."

**User:** "I'm logged in"

**Claude:** [Takes new snapshot, verifies authenticated, runs inspection]

```
## PostHog Implementation Summary

### Status
✅ Installed (bundled)

### Implementation Type
Bundled (not exposed globally) via custom proxy

### Configuration
- **Version:** 1.257.2
- **API Host:** ph.example.com (Custom proxy)
- **Project Token:** phc_abc123def456ghi789jkl012mno345
- **Persistence:** sessionStorage

### Features (Module Loaded → Feature Enabled)
| Feature | Module Loaded | Enabled |
|---------|---------------|---------|
| Autocapture | ✅ | ❌ |
| Session Recording | ❌ | ❌ |
| Surveys | ✅ | ❌ |
| Heatmaps | ❌ | ❌ |
| Feature Flags | ✅ | ✅ |
| Web Vitals | ✅ | ❌ |

### Identifiers
- **Distinct ID:** (not accessible - bundled)
- **Session ID:** (not accessible - bundled)

### Network Activity
- Events endpoint: ✅
- Session recording: ❌
- Decide/flags endpoint: ✅
- Surveys endpoint: ✅ (module loaded, feature disabled)

### Issues Found
✅ None detected

### Script Loading
- **Source:** Custom proxy (ph.example.com)
- **Loading:** Bundled in app
```
