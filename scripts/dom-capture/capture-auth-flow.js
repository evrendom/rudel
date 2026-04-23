/*
Paste this script into DevTools Console on the target auth page.

It starts a persistent capture session on `window.__authFlowCapture`.
Interact with the page manually, then finish with:

  await window.__authFlowCapture.stop()

Optional helpers:

  window.__authFlowCapture.snapshot("after-email-focus")
  window.__authFlowCapture.checkpoint("after-password-step")
  window.__authFlowCapture.refresh()
  window.__authFlowCapture.getRoles()
  window.__authFlowCapture.watchRole("footerBar", ["footer", "footer [class*='wrapper']"])
  await window.__authFlowCapture.stop({ copyToClipboard: true })

The exported JSON includes:
- DOM structure summary
- flow sections and interactive controls
- active Web Animations / CSS animation inventory
- mutation log
- interaction log
- timeline samples of animated / interactive elements
- exact role timelines for button, text, stage, and footer targets
*/

(() => {
  const userConfig =
    window.__authFlowCaptureOptions &&
    typeof window.__authFlowCaptureOptions === "object"
      ? window.__authFlowCaptureOptions
      : {};

  const CONFIG = {
    explicitRootSelector: userConfig.explicitRootSelector ?? "",
    autoRootSelectors: [
      "[data-final-message]",
      "form",
      "main",
      "#__next",
      "#root",
      "body",
    ],
    sampleIntervalMs: userConfig.sampleIntervalMs ?? 80,
    maxTrackedNodes: userConfig.maxTrackedNodes ?? 260,
    maxSnapshots: userConfig.maxSnapshots ?? 720,
    maxEvents: userConfig.maxEvents ?? 2000,
    maxMutations: userConfig.maxMutations ?? 2000,
    maxRoleMatchesPerSpec: userConfig.maxRoleMatchesPerSpec ?? 6,
    maxRoleTimelineEntries: userConfig.maxRoleTimelineEntries ?? 1800,
    maxChildrenPerNode: 12,
    maxTextLength: 140,
    maxHtmlLength: 350000,
    trackedStyleProps: [
      "display",
      "position",
      "top",
      "right",
      "bottom",
      "left",
      "width",
      "min-width",
      "max-width",
      "height",
      "min-height",
      "max-height",
      "padding",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "margin",
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
      "gap",
      "grid-template-columns",
      "grid-template-rows",
      "flex",
      "flex-direction",
      "justify-content",
      "align-items",
      "border",
      "border-radius",
      "background",
      "background-color",
      "box-shadow",
      "opacity",
      "transform",
      "transform-origin",
      "will-change",
      "filter",
      "clip-path",
      "overflow",
      "overflow-x",
      "overflow-y",
      "font-size",
      "font-weight",
      "line-height",
      "letter-spacing",
      "color",
      "text-align",
      "transition-property",
      "transition-duration",
      "transition-delay",
      "transition-timing-function",
      "animation-name",
      "animation-duration",
      "animation-delay",
      "animation-timing-function",
      "animation-fill-mode",
      "animation-direction",
      "animation-iteration-count",
      "animation-play-state",
    ],
    interestingTags: new Set([
      "body",
      "main",
      "header",
      "section",
      "article",
      "footer",
      "nav",
      "form",
      "div",
      "h1",
      "h2",
      "h3",
      "p",
      "button",
      "input",
      "label",
      "a",
      "svg",
      "path",
      "ul",
      "li",
      "span",
    ]),
    roleSpecs: normalizeRoleSpecs(
      userConfig.roleSpecs ?? [
        {
          id: "primaryButton",
          selectors: [
            'button[data-variant="primary"]',
            'button[type="submit"]',
          ],
        },
        {
          id: "buttonContent",
          selectors: [
            'button[data-variant="primary"] [class*="children"]',
            'button[type="submit"] [class*="children"]',
          ],
        },
        {
          id: "buttonLabel",
          selectors: [
            'button[data-variant="primary"] [class*="children"] span',
            'button[type="submit"] [class*="children"] span',
          ],
        },
        {
          id: "headingGroup",
          selectors: ['[class*="heading"]', "h1", "h2", "h3"],
        },
        {
          id: "paragraphGroup",
          selectors: ['[class*="heading"] p', "p"],
        },
        {
          id: "stageShell",
          selectors: [
            "[data-final-message]",
            '[style*="transition-property: height"]',
            "form",
          ],
        },
        {
          id: "footerBar",
          selectors: ["footer [class*='wrapper']", "footer", "nav"],
        },
      ],
    ),
  };

  const existingCapture = window.__authFlowCapture;

  if (existingCapture && typeof existingCapture.stop === "function") {
    existingCapture.stop({ download: false, copyToClipboard: false }).catch(
      () => {},
    );
  }

  const startPerf = performance.now();
  const eventLog = [];
  const mutationLog = [];
  const snapshots = [];
  const checkpoints = [];
  const roleTimeline = new Map();
  let trackedNodes = [];
  let sampleTimer = null;
  let observer = null;
  let root = null;
  let rootSelector = "";
  let lastFlowSummary = null;
  let isStopped = false;

  function nowMs() {
    return Math.round(performance.now() - startPerf);
  }

  function normalize(value) {
    return String(value ?? "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function summarizeText(value) {
    const text = normalize(value);

    if (!text) {
      return "";
    }

    return text.length > CONFIG.maxTextLength
      ? `${text.slice(0, CONFIG.maxTextLength)}...`
      : text;
  }

  function rectOf(element) {
    const rect = element.getBoundingClientRect();

    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function simpleSelector(element) {
    if (!(element instanceof Element)) {
      return "<unknown>";
    }

    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const testId = element.getAttribute("data-testid");
    const className = normalize(element.className)
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((token) => `.${token}`)
      .join("");
    const testIdSuffix = testId ? `[data-testid="${testId}"]` : "";

    return `${tag}${id}${className}${testIdSuffix}`;
  }

  function nodePath(element, stopAt) {
    if (!(element instanceof Element)) {
      return "<unknown>";
    }

    if (element === stopAt) {
      return simpleSelector(stopAt);
    }

    const parts = [];
    let current = element;

    while (current && current !== stopAt && current instanceof Element) {
      const parent = current.parentElement;
      const tag = current.tagName.toLowerCase();
      let suffix = "";

      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => {
          return child.tagName === current.tagName;
        });
        const index = siblings.indexOf(current);

        if (siblings.length > 1 && index >= 0) {
          suffix = `:nth-of-type(${index + 1})`;
        }
      }

      parts.unshift(`${simpleSelector(current)}${suffix}`);
      current = parent;
    }

    if (stopAt instanceof Element) {
      parts.unshift(simpleSelector(stopAt));
    }

    return parts.join(" > ");
  }

  function toArray(value) {
    return normalize(value)
      .split(",")
      .map((part) => normalize(part))
      .filter(Boolean);
  }

  function normalizeRoleSpecs(roleSpecs) {
    return roleSpecs
      .map((spec, index) => {
        const id = normalize(spec?.id || `role-${index + 1}`);
        const selectors = Array.isArray(spec?.selectors)
          ? spec.selectors.map((selector) => String(selector).trim()).filter(Boolean)
          : [];

        if (!id || selectors.length === 0) {
          return null;
        }

        return {
          id,
          selectors,
          label: normalize(spec?.label || id) || id,
        };
      })
      .filter(Boolean);
  }

  function pickStyles(element) {
    const computed = getComputedStyle(element);
    const picked = {};

    for (const prop of CONFIG.trackedStyleProps) {
      const value = normalize(computed.getPropertyValue(prop));

      if (
        !value ||
        value === "none" ||
        value === "normal" ||
        value === "auto" ||
        value === "rgba(0, 0, 0, 0)" ||
        value === "0s"
      ) {
        continue;
      }

      picked[prop] = value;
    }

    return picked;
  }

  function motionSummary(element) {
    const computed = getComputedStyle(element);
    const transitionDurations = toArray(computed.transitionDuration);
    const transitionDelays = toArray(computed.transitionDelay);
    const animationDurations = toArray(computed.animationDuration);
    const animationDelays = toArray(computed.animationDelay);

    return {
      transform: normalize(computed.transform) || "none",
      opacity: normalize(computed.opacity) || "1",
      willChange: normalize(computed.willChange) || "auto",
      transitionProperty: normalize(computed.transitionProperty) || "none",
      transitionDuration: transitionDurations,
      transitionDelay: transitionDelays,
      animationName: toArray(computed.animationName),
      animationDuration: animationDurations,
      animationDelay: animationDelays,
      animationPlayState: toArray(computed.animationPlayState),
    };
  }

  function summarizeElement(element, stopAt) {
    return {
      path: nodePath(element, stopAt),
      selector: simpleSelector(element),
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      testId: element.getAttribute("data-testid") || null,
      role: element.getAttribute("role") || null,
      text: summarizeText(element.textContent),
      rect: rectOf(element),
      styles: pickStyles(element),
      motion: motionSummary(element),
    };
  }

  function summarizeRoleElement(element, stopAt, animationList) {
    const summary = summarizeElement(element, stopAt);
    const path = summary.path;
    const relatedAnimations = animationList
      .filter((animation) => animation.targetPath === path)
      .map((animation) => {
        return {
          playState: animation.playState,
          currentTime: animation.currentTime,
          timing: animation.timing,
        };
      });

    return {
      path,
      selector: summary.selector,
      tag: summary.tag,
      text: summary.text,
      rect: summary.rect,
      motion: summary.motion,
      styles: summary.styles,
      activeAnimations: relatedAnimations,
    };
  }

  function childSummary(element, stopAt) {
    return Array.from(element.children)
      .slice(0, CONFIG.maxChildrenPerNode)
      .map((child) => summarizeElement(child, stopAt));
  }

  function commonAncestor(a, b) {
    if (!(a instanceof Element) || !(b instanceof Element)) {
      return null;
    }

    const seen = new Set();
    let current = a;

    while (current) {
      seen.add(current);
      current = current.parentElement;
    }

    current = b;

    while (current) {
      if (seen.has(current)) {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }

  function findRoot() {
    if (CONFIG.explicitRootSelector) {
      const explicitNode = document.querySelector(CONFIG.explicitRootSelector);

      if (explicitNode) {
        return {
          node: explicitNode,
          selector: CONFIG.explicitRootSelector,
        };
      }
    }

    const form = document.querySelector("form");
    const footer = document.querySelector("footer");
    const formFooterAncestor = commonAncestor(form, footer);

    if (formFooterAncestor) {
      return {
        node: formFooterAncestor,
        selector: "commonAncestor(form, footer)",
      };
    }

    if (form) {
      let current = form;

      while (current.parentElement && current.parentElement !== document.body) {
        const parent = current.parentElement;
        const hasHeading = parent.querySelector("h1, h2, h3");
        const hasInteractive = parent.querySelector("button, input, a");

        if (hasHeading && hasInteractive) {
          current = parent;
          continue;
        }

        break;
      }

      return {
        node: current,
        selector: "form-anchored-auth-root",
      };
    }

    for (const selector of CONFIG.autoRootSelectors) {
      const foundNode = document.querySelector(selector);

      if (foundNode) {
        return {
          node: foundNode,
          selector,
        };
      }
    }

    return {
      node: document.body,
      selector: "body",
    };
  }

  function collectFlowSummary(authRoot) {
    const headings = Array.from(authRoot.querySelectorAll("h1, h2, h3")).map(
      (node) => {
        return {
          path: nodePath(node, authRoot),
          tag: node.tagName.toLowerCase(),
          text: summarizeText(node.textContent),
        };
      },
    );

    const paragraphs = Array.from(authRoot.querySelectorAll("p"))
      .map((node) => {
        return {
          path: nodePath(node, authRoot),
          text: summarizeText(node.textContent),
        };
      })
      .filter((item) => item.text);

    const forms = Array.from(authRoot.querySelectorAll("form")).map((form) => {
      const controls = Array.from(
        form.querySelectorAll("input, button, select, textarea"),
      ).map((control) => {
        return {
          path: nodePath(control, authRoot),
          tag: control.tagName.toLowerCase(),
          type: control.getAttribute("type") || null,
          name: control.getAttribute("name") || null,
          id: control.id || null,
          placeholder: control.getAttribute("placeholder") || null,
          text: summarizeText(control.textContent),
          rect: rectOf(control),
        };
      });

      return {
        path: nodePath(form, authRoot),
        rect: rectOf(form),
        controls,
      };
    });

    const buttons = Array.from(
      authRoot.querySelectorAll('button, [role="button"], a'),
    ).map((node) => {
      return {
        path: nodePath(node, authRoot),
        tag: node.tagName.toLowerCase(),
        text: summarizeText(node.textContent),
        href: node instanceof HTMLAnchorElement ? node.href : null,
        rect: rectOf(node),
      };
    });

    const trackedFlags = Array.from(
      authRoot.querySelectorAll("[data-final-message]"),
    ).map((node) => {
      return {
        path: nodePath(node, authRoot),
        value: node.getAttribute("data-final-message"),
      };
    });

    return {
      headings,
      paragraphs,
      forms,
      buttons,
      trackedFlags,
    };
  }

  function hasInterestingMotion(element) {
    const motion = motionSummary(element);
    const hasTransitions =
      motion.transitionProperty !== "none" &&
      motion.transitionDuration.some((value) => value !== "0s");
    const hasAnimations =
      motion.animationName.some((value) => value !== "none") &&
      motion.animationDuration.some((value) => value !== "0s");
    const hasVisibleTransform = motion.transform !== "none";
    const hasWillChange = motion.willChange !== "auto";
    const hasOpacity = motion.opacity !== "1";

    return (
      hasTransitions ||
      hasAnimations ||
      hasVisibleTransform ||
      hasWillChange ||
      hasOpacity
    );
  }

  function isInterestingNode(element, authRoot) {
    if (element === authRoot) {
      return true;
    }

    if (!CONFIG.interestingTags.has(element.tagName.toLowerCase())) {
      return false;
    }

    if (hasInterestingMotion(element)) {
      return true;
    }

    if (element.matches("form, input, button, a, footer, nav")) {
      return true;
    }

    if (element.hasAttribute("data-final-message")) {
      return true;
    }

    return Boolean(summarizeText(element.textContent));
  }

  function collectTrackedNodes(authRoot) {
    const nodes = [authRoot];
    const walker = document.createTreeWalker(authRoot, NodeFilter.SHOW_ELEMENT);

    while (walker.nextNode()) {
      const current = walker.currentNode;

      if (!(current instanceof Element)) {
        continue;
      }

      if (!isInterestingNode(current, authRoot)) {
        continue;
      }

      nodes.push(current);

      if (nodes.length >= CONFIG.maxTrackedNodes) {
        break;
      }
    }

    return nodes;
  }

  function activeAnimations(authRoot) {
    const getAnimations =
      typeof authRoot.getAnimations === "function"
        ? authRoot.getAnimations.bind(authRoot)
        : typeof document.getAnimations === "function"
          ? document.getAnimations.bind(document)
          : null;

    if (!getAnimations) {
      return [];
    }

    return getAnimations({ subtree: true })
      .map((animation, index) => {
        const effect = animation.effect;
        const target =
          effect && "target" in effect && effect.target instanceof Element
            ? effect.target
            : null;
        const timing =
          effect && typeof effect.getTiming === "function"
            ? effect.getTiming()
            : null;
        const keyframes =
          effect && typeof effect.getKeyframes === "function"
            ? effect.getKeyframes().map((frame) => {
                return {
                  offset:
                    typeof frame.offset === "number" ? frame.offset : null,
                  easing: frame.easing ?? null,
                  opacity:
                    frame.opacity === undefined ? null : String(frame.opacity),
                  transform:
                    frame.transform === undefined ? null : String(frame.transform),
                  filter: frame.filter === undefined ? null : String(frame.filter),
                };
              })
            : [];

        return {
          index,
          id:
            typeof animation.id === "string" && animation.id
              ? animation.id
              : null,
          type: animation.constructor?.name ?? "Animation",
          targetPath: target ? nodePath(target, authRoot) : null,
          playState: animation.playState,
          currentTime:
            typeof animation.currentTime === "number"
              ? Math.round(animation.currentTime)
              : animation.currentTime,
          startTime:
            typeof animation.startTime === "number"
              ? Math.round(animation.startTime)
              : animation.startTime,
          playbackRate: animation.playbackRate,
          timeline:
            animation.timeline?.constructor?.name ??
            animation.timeline?.toString?.() ??
            null,
          timing: timing
            ? {
                delay: timing.delay,
                duration: timing.duration,
                easing: timing.easing,
                endDelay: timing.endDelay,
                fill: timing.fill,
                iterationStart: timing.iterationStart,
                iterations: timing.iterations,
              }
            : null,
          keyframes,
        };
      })
      .filter((animation) => {
        return (
          animation.playState !== "idle" ||
          animation.currentTime !== null ||
          animation.keyframes.length > 0
        );
      });
  }

  function querySelectorAllSafe(authRoot, selector) {
    try {
      return Array.from(authRoot.querySelectorAll(selector));
    } catch (_error) {
      return [];
    }
  }

  function uniqueElements(elements) {
    const seen = new Set();

    return elements.filter((element) => {
      if (!(element instanceof Element) || seen.has(element)) {
        return false;
      }

      seen.add(element);
      return true;
    });
  }

  function collectRoleSnapshot(authRoot, animationList) {
    const roles = CONFIG.roleSpecs.map((spec) => {
      const matches = uniqueElements(
        spec.selectors.flatMap((selector) => querySelectorAllSafe(authRoot, selector)),
      )
        .slice(0, CONFIG.maxRoleMatchesPerSpec)
        .map((element) => summarizeRoleElement(element, authRoot, animationList));

      return {
        id: spec.id,
        label: spec.label,
        selectors: spec.selectors,
        matches,
      };
    });

    for (const role of roles) {
      const entries = roleTimeline.get(role.id) ?? [];

      entries.push({
        t: nowMs(),
        matches: role.matches.map((match) => {
          return {
            path: match.path,
            text: match.text,
            rect: match.rect,
            motion: match.motion,
            activeAnimations: match.activeAnimations,
          };
        }),
      });

      if (entries.length > CONFIG.maxRoleTimelineEntries) {
        entries.shift();
      }

      roleTimeline.set(role.id, entries);
    }

    return roles;
  }

  function findMatchingRoleIds(target) {
    if (!(target instanceof Element) || !root) {
      return [];
    }

    const matches = [];

    for (const spec of CONFIG.roleSpecs) {
      const isMatch = spec.selectors.some((selector) => {
        try {
          return Boolean(target.closest(selector));
        } catch (_error) {
          return false;
        }
      });

      if (isMatch) {
        matches.push(spec.id);
      }
    }

    return matches;
  }

  function logEvent(type, target, detail = {}) {
    if (eventLog.length >= CONFIG.maxEvents) {
      return;
    }

    eventLog.push({
      t: nowMs(),
      type,
      target:
        target instanceof Element && root ? nodePath(target, root) : "<unknown>",
      roleIds: findMatchingRoleIds(target),
      detail,
    });
  }

  function logMutation(record) {
    if (mutationLog.length >= CONFIG.maxMutations) {
      return;
    }

    const target =
      record.target instanceof Element && root
        ? nodePath(record.target, root)
        : "<unknown>";

    if (record.type === "attributes") {
      mutationLog.push({
        t: nowMs(),
        type: "attributes",
        target,
        roleIds: findMatchingRoleIds(record.target),
        attributeName: record.attributeName,
        value:
          record.target instanceof Element && record.attributeName
            ? record.target.getAttribute(record.attributeName)
            : null,
      });
      return;
    }

    mutationLog.push({
      t: nowMs(),
      type: record.type,
      target,
      roleIds: findMatchingRoleIds(record.target),
      added: record.addedNodes.length,
      removed: record.removedNodes.length,
    });
  }

  function collectSnapshot(label) {
    if (!root) {
      return null;
    }

    const flowSummary = collectFlowSummary(root);
    lastFlowSummary = flowSummary;

    const animationList = activeAnimations(root).map((animation) => {
      return {
        targetPath: animation.targetPath,
        playState: animation.playState,
        currentTime: animation.currentTime,
        timing: animation.timing,
      };
    });
    const roles = collectRoleSnapshot(root, animationList);
    const snapshot = {
      t: nowMs(),
      label,
      scroll: {
        x: Math.round(window.scrollX),
        y: Math.round(window.scrollY),
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      root: {
        path: nodePath(root, root),
        rect: rectOf(root),
        childCount: root.children.length,
      },
      flow: flowSummary,
      activeAnimations: animationList,
      roles,
      nodes: trackedNodes.map((node) => {
        const summary = summarizeElement(node, root);

        return {
          path: summary.path,
          tag: summary.tag,
          text: summary.text,
          rect: summary.rect,
          motion: summary.motion,
        };
      }),
    };

    snapshots.push(snapshot);

    if (snapshots.length > CONFIG.maxSnapshots) {
      snapshots.shift();
    }

    if (label !== "interval") {
      checkpoints.push({
        t: snapshot.t,
        label: snapshot.label,
        headings: snapshot.flow.headings.map((item) => item.text).filter(Boolean),
      });
    }

    return snapshot;
  }

  function refreshTrackedNodes() {
    if (!root) {
      return [];
    }

    trackedNodes = collectTrackedNodes(root);
    return trackedNodes.map((node) => nodePath(node, root));
  }

  function serializeRootHtml(authRoot) {
    const html = authRoot.outerHTML;

    if (html.length <= CONFIG.maxHtmlLength) {
      return html;
    }

    return `${html.slice(0, CONFIG.maxHtmlLength)}\n<!-- truncated -->`;
  }

  async function copyText(text) {
    if (typeof copy === "function") {
      copy(text);
      return "copy()";
    }

    await navigator.clipboard.writeText(text);
    return "navigator.clipboard";
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  function buildPayload() {
    const authRoot = root ?? document.body;

    return {
      meta: {
        captureVersion: "2",
        url: location.href,
        title: document.title,
        startedAt: new Date(Date.now() - nowMs()).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: nowMs(),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        rootSelector,
      },
      flow: collectFlowSummary(authRoot),
      root: {
        summary: summarizeElement(authRoot, authRoot),
        children: childSummary(authRoot, authRoot),
        html: serializeRootHtml(authRoot),
      },
      trackedNodes: trackedNodes.map((node) => summarizeElement(node, authRoot)),
      activeAnimations: activeAnimations(authRoot),
      roleSpecs: CONFIG.roleSpecs,
      roleTimeline: Object.fromEntries(roleTimeline.entries()),
      checkpoints,
      events: eventLog,
      mutations: mutationLog,
      snapshots,
    };
  }

  function handleUiEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    const detail = {};

    if (event instanceof KeyboardEvent) {
      detail.key = event.key;
    }

    if (event instanceof InputEvent) {
      detail.inputType = event.inputType;
      detail.data = event.data ?? null;
    }

    if (target instanceof HTMLInputElement) {
      detail.value = target.value;
      detail.type = target.type;
    }

    logEvent(event.type, target, detail);
  }

  function handleAnimationEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    const detail = {};

    if ("animationName" in event) {
      detail.animationName = event.animationName;
    }

    if ("elapsedTime" in event) {
      detail.elapsedTime = event.elapsedTime;
    }

    if ("propertyName" in event) {
      detail.propertyName = event.propertyName;
    }

    logEvent(event.type, target, detail);
  }

  function attachListeners() {
    const uiEvents = ["click", "focusin", "input", "submit", "keydown"];
    const animationEvents = [
      "animationstart",
      "animationiteration",
      "animationend",
      "animationcancel",
      "transitionrun",
      "transitionstart",
      "transitionend",
      "transitioncancel",
    ];

    for (const eventName of uiEvents) {
      document.addEventListener(eventName, handleUiEvent, true);
    }

    for (const eventName of animationEvents) {
      document.addEventListener(eventName, handleAnimationEvent, true);
    }

    return () => {
      for (const eventName of uiEvents) {
        document.removeEventListener(eventName, handleUiEvent, true);
      }

      for (const eventName of animationEvents) {
        document.removeEventListener(eventName, handleAnimationEvent, true);
      }
    };
  }

  const detachListeners = attachListeners();

  function startObserver() {
    observer = new MutationObserver((records) => {
      for (const record of records) {
        logMutation(record);
      }

      refreshTrackedNodes();
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: false,
      attributeFilter: [
        "class",
        "style",
        "hidden",
        "aria-hidden",
        "data-final-message",
        "data-state",
      ],
    });
  }

  function watchRole(id, selectors, label = "") {
    const normalizedId = normalize(id);
    const normalizedSelectors = Array.isArray(selectors)
      ? selectors.map((selector) => String(selector).trim()).filter(Boolean)
      : [];

    if (!normalizedId || normalizedSelectors.length === 0) {
      return null;
    }

    const nextSpec = {
      id: normalizedId,
      label: normalize(label || normalizedId) || normalizedId,
      selectors: normalizedSelectors,
    };
    const existingIndex = CONFIG.roleSpecs.findIndex((spec) => spec.id === normalizedId);

    if (existingIndex >= 0) {
      CONFIG.roleSpecs.splice(existingIndex, 1, nextSpec);
    } else {
      CONFIG.roleSpecs.push(nextSpec);
    }

    if (root) {
      return collectRoleSnapshot(root, activeAnimations(root).map((animation) => {
        return {
          targetPath: animation.targetPath,
          playState: animation.playState,
          currentTime: animation.currentTime,
          timing: animation.timing,
        };
      }));
    }

    return null;
  }

  async function stopCapture(options = {}) {
    if (isStopped) {
      return buildPayload();
    }

    isStopped = true;

    if (sampleTimer !== null) {
      window.clearInterval(sampleTimer);
      sampleTimer = null;
    }

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    detachListeners();
    collectSnapshot("final");

    const payload = buildPayload();
    const json = JSON.stringify(payload, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `auth-flow-capture-${location.hostname}-${timestamp}.json`;

    if (options.download !== false) {
      downloadText(filename, json);
    }

    if (options.copyToClipboard) {
      await copyText(json);
    }

    console.log("Stopped auth flow capture.", {
      filename,
      durationMs: payload.meta.durationMs,
      events: payload.events.length,
      mutations: payload.mutations.length,
      snapshots: payload.snapshots.length,
      animations: payload.activeAnimations.length,
    });

    return payload;
  }

  const rootMatch = findRoot();
  root = rootMatch.node instanceof Element ? rootMatch.node : document.body;
  rootSelector = rootMatch.selector;
  refreshTrackedNodes();
  lastFlowSummary = collectFlowSummary(root);
  startObserver();
  collectSnapshot("initial");

  sampleTimer = window.setInterval(() => {
    if (isStopped) {
      return;
    }

    collectSnapshot("interval");
  }, CONFIG.sampleIntervalMs);

  window.__authFlowCapture = {
    config: { ...CONFIG },
    getRoot() {
      return {
        selector: rootSelector,
        summary: root ? summarizeElement(root, root) : null,
      };
    },
    getFlow() {
      return lastFlowSummary ?? (root ? collectFlowSummary(root) : null);
    },
    getTrackedNodePaths() {
      return trackedNodes.map((node) => (root ? nodePath(node, root) : "<unknown>"));
    },
    getRoles() {
      if (!root) {
        return [];
      }

      return collectRoleSnapshot(root, activeAnimations(root).map((animation) => {
        return {
          targetPath: animation.targetPath,
          playState: animation.playState,
          currentTime: animation.currentTime,
          timing: animation.timing,
        };
      }));
    },
    checkpoint(label = "manual") {
      return collectSnapshot(label);
    },
    watchRole,
    refresh() {
      return refreshTrackedNodes();
    },
    snapshot(label = "manual") {
      return collectSnapshot(label);
    },
    stop: stopCapture,
  };

  console.log("Started auth flow capture.", {
    rootSelector,
    root: summarizeElement(root, root),
    trackedNodes: trackedNodes.length,
    help: [
      "Interact with the page manually.",
      'Call window.__authFlowCapture.snapshot("label") for named checkpoints.',
      "Call await window.__authFlowCapture.stop() to export the capture.",
    ],
  });

  return window.__authFlowCapture;
})();
