/*
Paste this into DevTools Console on the page that contains the target code block.

This version auto-starts immediately if it finds the target block.

Manual start or restart:

  window.__codeBitCapture.start({
    rootSelector: ".styles_container__X8qbd",
    copyButtonSelector: ".styles_copyButton__Zd8M6"
  })

Optional:

  window.__codeBitCapture.snapshot("before-hover")
  window.__codeBitCapture.snapshot("after-hover")
  window.__codeBitCapture.snapshot("after-click")
  await window.__codeBitCapture.stop()
  await window.__codeBitCapture.stop({ copyToClipboard: true })

What it captures:
- exact subtree HTML for the code surface
- computed styles for the root, pre, code, tokens, button, and SVG parts
- transition / animation events
- getAnimations() keyframes and timing
- timeline samples during hover and click
- direct copy-button interaction events
*/

void function installCodeBitCapture() {
  const CONFIG = {
    rootSelectorCandidates: [
      ".styles_container__X8qbd",
      "[data-rehype-pretty-code-figure]",
      "figure[data-rehype-pretty-code-figure]",
      "pre[data-language]",
    ],
    copyButtonSelectorCandidates: [
      ".styles_copyButton__Zd8M6",
      'button[aria-label="Copy to clipboard"]',
      "button",
    ],
    sampleIntervalMs: 48,
    maxSamples: 360,
    maxEvents: 500,
    maxMutations: 300,
    maxHtmlLength: 120000,
    trackedStyleProps: [
      "display",
      "position",
      "width",
      "height",
      "min-width",
      "min-height",
      "padding",
      "margin",
      "gap",
      "border",
      "border-radius",
      "background",
      "background-color",
      "box-shadow",
      "opacity",
      "color",
      "fill",
      "stroke",
      "stroke-width",
      "transform",
      "transform-origin",
      "transform-box",
      "filter",
      "overflow",
      "font-family",
      "font-size",
      "font-weight",
      "line-height",
      "letter-spacing",
      "white-space",
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
  };

  const existingCapture = window.__codeBitCapture;

  if (existingCapture && typeof existingCapture.stop === "function") {
    existingCapture.stop({ download: false, copyToClipboard: false }).catch(
      () => {},
    );
  }

  const state = {
    active: false,
    startPerf: 0,
    root: null,
    rootSelector: "",
    copyButton: null,
    copyButtonSelector: "",
    tracked: {},
    samples: [],
    events: [],
    mutations: [],
    timerId: null,
    observer: null,
    removeListeners: [],
    lastStartError: null,
  };

  function nowMs() {
    return Math.round(performance.now() - state.startPerf);
  }

  function normalize(value) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toArray(value) {
    return normalize(value)
      .split(",")
      .map((part) => normalize(part))
      .filter(Boolean);
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
    const className = normalize(element.className)
      .split(" ")
      .filter(Boolean)
      .slice(0, 3)
      .map((token) => `.${token}`)
      .join("");

    return `${tag}${id}${className}`;
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

      parts.unshift(`${tag}${suffix}`);
      current = parent;
    }

    if (stopAt instanceof Element) {
      parts.unshift(simpleSelector(stopAt));
    }

    return parts.join(" > ");
  }

  function pickStyles(element) {
    if (!(element instanceof Element)) {
      return {};
    }

    const computed = getComputedStyle(element);
    const picked = {};

    for (const prop of CONFIG.trackedStyleProps) {
      const value = normalize(computed.getPropertyValue(prop));

      if (
        !value ||
        value === "none" ||
        value === "normal" ||
        value === "auto" ||
        value === "0s" ||
        value === "rgba(0, 0, 0, 0)"
      ) {
        continue;
      }

      picked[prop] = value;
    }

    return picked;
  }

  function motionSummary(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    const computed = getComputedStyle(element);

    return {
      opacity: normalize(computed.opacity) || "1",
      transform: normalize(computed.transform) || "none",
      transitionProperty: normalize(computed.transitionProperty) || "none",
      transitionDuration: toArray(computed.transitionDuration),
      transitionDelay: toArray(computed.transitionDelay),
      animationName: toArray(computed.animationName),
      animationDuration: toArray(computed.animationDuration),
      animationDelay: toArray(computed.animationDelay),
      animationPlayState: toArray(computed.animationPlayState),
    };
  }

  function summarizeElement(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    return {
      path: nodePath(element, state.root),
      selector: simpleSelector(element),
      tag: element.tagName.toLowerCase(),
      text: normalize(element.textContent),
      rect: rectOf(element),
      styles: pickStyles(element),
      motion: motionSummary(element),
      attributes: Array.from(element.attributes).reduce((result, attribute) => {
        result[attribute.name] = attribute.value;
        return result;
      }, {}),
    };
  }

  function serializeHtml(element) {
    if (!(element instanceof Element)) {
      return "";
    }

    const html = element.outerHTML;

    if (html.length <= CONFIG.maxHtmlLength) {
      return html;
    }

    return `${html.slice(0, CONFIG.maxHtmlLength)}\n<!-- truncated -->`;
  }

  function findFirst(candidates, root = document) {
    for (const selector of candidates) {
      const match = root.querySelector(selector);

      if (match) {
        return {
          element: match,
          selector,
        };
      }
    }

    return {
      element: null,
      selector: "",
    };
  }

  function resolveRoot(options = {}) {
    if (options.root instanceof Element) {
      return {
        element: options.root,
        selector: simpleSelector(options.root),
      };
    }

    if (options.rootSelector) {
      const explicit = document.querySelector(options.rootSelector);

      if (!explicit) {
        throw new Error(`Root selector not found: ${options.rootSelector}`);
      }

      return {
        element: explicit,
        selector: options.rootSelector,
      };
    }

    const found = findFirst(CONFIG.rootSelectorCandidates);

    if (!found.element) {
      throw new Error(
        "Could not find the target code block. Pass rootSelector explicitly.",
      );
    }

    return found;
  }

  function resolveCopyButton(root, options = {}) {
    if (!(root instanceof Element)) {
      return {
        element: null,
        selector: "",
      };
    }

    if (options.copyButton instanceof Element) {
      return {
        element: options.copyButton,
        selector: simpleSelector(options.copyButton),
      };
    }

    if (options.copyButtonSelector) {
      const explicit = root.querySelector(options.copyButtonSelector);

      if (!explicit) {
        throw new Error(
          `Copy button selector not found: ${options.copyButtonSelector}`,
        );
      }

      return {
        element: explicit,
        selector: options.copyButtonSelector,
      };
    }

    return findFirst(CONFIG.copyButtonSelectorCandidates, root);
  }

  function collectTrackedNodes(root, copyButton) {
    const figure = root.querySelector("figure");
    const pre = root.querySelector("pre");
    const code = root.querySelector("code");
    const codeTokens = code
      ? Array.from(code.querySelectorAll("span")).slice(0, 24)
      : [];
    const svg = copyButton ? copyButton.querySelector("svg") : null;
    const svgParts = svg
      ? Array.from(svg.querySelectorAll("rect, path, g, mask")).slice(0, 24)
      : [];

    return {
      root,
      figure,
      pre,
      code,
      codeTokens,
      copyButton,
      svg,
      svgParts,
    };
  }

  function animationDetails(root) {
    if (!(root instanceof Element) || typeof root.getAnimations !== "function") {
      return [];
    }

    return root.getAnimations({ subtree: true }).map((animation, index) => {
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
          ? effect.getKeyframes().map((frame) => ({
              offset:
                typeof frame.offset === "number" ? frame.offset : null,
              easing: frame.easing ?? null,
              opacity:
                frame.opacity === undefined ? null : String(frame.opacity),
              transform:
                frame.transform === undefined ? null : String(frame.transform),
              stroke:
                frame.stroke === undefined ? null : String(frame.stroke),
            }))
          : [];

      return {
        index,
        type: animation.constructor?.name ?? "Animation",
        playState: animation.playState,
        currentTime:
          typeof animation.currentTime === "number"
            ? Math.round(animation.currentTime)
            : animation.currentTime,
        targetPath: target ? nodePath(target, state.root) : null,
        timing: timing
          ? {
              delay: timing.delay,
              duration: timing.duration,
              easing: timing.easing,
              fill: timing.fill,
              iterations: timing.iterations,
            }
          : null,
        keyframes,
      };
    });
  }

  function sampleNodeCollection() {
    const tracked = state.tracked;

    return {
      t: nowMs(),
      root: summarizeElement(tracked.root),
      figure: summarizeElement(tracked.figure),
      pre: summarizeElement(tracked.pre),
      code: summarizeElement(tracked.code),
      codeTokens: tracked.codeTokens.map((element) => summarizeElement(element)),
      copyButton: summarizeElement(tracked.copyButton),
      svg: summarizeElement(tracked.svg),
      svgParts: tracked.svgParts.map((element) => summarizeElement(element)),
      animations: animationDetails(state.root),
    };
  }

  function pushSample(label = "interval") {
    if (!state.active) {
      return null;
    }

    const sample = {
      label,
      ...sampleNodeCollection(),
    };

    state.samples.push(sample);

    if (state.samples.length > CONFIG.maxSamples) {
      state.samples.shift();
    }

    return sample;
  }

  function logEvent(type, target, detail = {}) {
    if (state.events.length >= CONFIG.maxEvents) {
      return;
    }

    state.events.push({
      t: nowMs(),
      type,
      target:
        target instanceof Element ? nodePath(target, state.root) : "<unknown>",
      detail,
    });
  }

  function attachListeners() {
    const eventNames = [
      "mouseenter",
      "mouseleave",
      "pointerenter",
      "pointerleave",
      "pointerdown",
      "pointerup",
      "click",
      "focusin",
      "focusout",
      "animationstart",
      "animationiteration",
      "animationend",
      "transitionrun",
      "transitionstart",
      "transitionend",
      "transitioncancel",
    ];

    for (const eventName of eventNames) {
      const handler = (event) => {
        const detail = {};

        if ("propertyName" in event) {
          detail.propertyName = event.propertyName;
        }

        if ("animationName" in event) {
          detail.animationName = event.animationName;
        }

        if ("elapsedTime" in event) {
          detail.elapsedTime = event.elapsedTime;
        }

        logEvent(event.type, event.target, detail);
      };

      state.root.addEventListener(eventName, handler, true);
      state.removeListeners.push(() => {
        state.root.removeEventListener(eventName, handler, true);
      });
    }
  }

  function startObserver() {
    state.observer = new MutationObserver((records) => {
      for (const record of records) {
        if (state.mutations.length >= CONFIG.maxMutations) {
          break;
        }

        state.mutations.push({
          t: nowMs(),
          type: record.type,
          target:
            record.target instanceof Element
              ? nodePath(record.target, state.root)
              : "<unknown>",
          attributeName: record.attributeName ?? null,
          added: record.addedNodes.length,
          removed: record.removedNodes.length,
        });
      }
    });

    state.observer.observe(state.root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: false,
    });
  }

  function buildPayload() {
    return {
      meta: {
        url: location.href,
        title: document.title,
        durationMs: nowMs(),
        rootSelector: state.rootSelector,
        copyButtonSelector: state.copyButtonSelector,
      },
      structure: {
        root: summarizeElement(state.root),
        copyButton: summarizeElement(state.copyButton),
        html: serializeHtml(state.root),
      },
      snapshots: state.samples,
      events: state.events,
      mutations: state.mutations,
      finalAnimations: animationDetails(state.root),
    };
  }

  async function copyText(text) {
    if (typeof copy === "function") {
      copy(text);
      return;
    }

    await navigator.clipboard.writeText(text);
  }

  function downloadJson(text) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `code-copy-capture-${location.hostname}-${timestamp}.json`;
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);

    return filename;
  }

  async function stop(options = {}) {
    if (!state.active) {
      if (!state.root) {
        throw new Error(
          "Capture was never started. Paste the installer again or call window.__codeBitCapture.start(...).",
        );
      }

      return buildPayload();
    }

    state.active = false;

    if (state.timerId !== null) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }

    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }

    for (const removeListener of state.removeListeners) {
      removeListener();
    }

    state.removeListeners = [];
    pushSample("final");

    const payload = buildPayload();
    const json = JSON.stringify(payload, null, 2);
    const filename =
      options.download === false ? null : downloadJson(json);

    if (options.copyToClipboard) {
      await copyText(json);
    }

    console.log("Stopped code-bit capture.", {
      filename,
      samples: payload.snapshots.length,
      events: payload.events.length,
      mutations: payload.mutations.length,
      animations: payload.finalAnimations.length,
    });

    return payload;
  }

  function start(options = {}) {
    if (state.active) {
      return {
        rootSelector: state.rootSelector,
        copyButtonSelector: state.copyButtonSelector,
      };
    }

    state.startPerf = performance.now();
    state.samples = [];
    state.events = [];
    state.mutations = [];
    state.removeListeners = [];
    state.lastStartError = null;

    const rootMatch = resolveRoot(options);
    const copyButtonMatch = resolveCopyButton(rootMatch.element, options);

    state.root = rootMatch.element;
    state.rootSelector = rootMatch.selector;
    state.copyButton = copyButtonMatch.element;
    state.copyButtonSelector = copyButtonMatch.selector;
    state.tracked = collectTrackedNodes(state.root, state.copyButton);
    state.active = true;

    attachListeners();
    startObserver();
    pushSample("initial");

    state.timerId = window.setInterval(() => {
      pushSample("interval");
    }, options.sampleIntervalMs ?? CONFIG.sampleIntervalMs);

    console.log("Started code-bit capture.", {
      rootSelector: state.rootSelector,
      copyButtonSelector: state.copyButtonSelector,
      help: [
        "Hover and click the copy button now.",
        'Use window.__codeBitCapture.snapshot("label") for checkpoints.',
        "Use await window.__codeBitCapture.stop() when done.",
      ],
    });

    return {
      rootSelector: state.rootSelector,
      copyButtonSelector: state.copyButtonSelector,
    };
  }

  function autoStart() {
    try {
      return start({
        rootSelector: ".styles_container__X8qbd",
        copyButtonSelector: ".styles_copyButton__Zd8M6",
      });
    } catch (error) {
      state.lastStartError =
        error instanceof Error ? error.message : String(error);
      console.warn("Code-bit capture did not auto-start.", {
        error: state.lastStartError,
        help: "Call window.__codeBitCapture.start({ rootSelector: \".styles_container__X8qbd\", copyButtonSelector: \".styles_copyButton__Zd8M6\" }) once the target block is in the DOM.",
      });
      return null;
    }
  }

  window.__codeBitCapture = {
    config: { ...CONFIG },
    start,
    snapshot(label = "manual") {
      return pushSample(label);
    },
    getTrackedNodes() {
      return {
        root: summarizeElement(state.tracked.root),
        figure: summarizeElement(state.tracked.figure),
        pre: summarizeElement(state.tracked.pre),
        code: summarizeElement(state.tracked.code),
        copyButton: summarizeElement(state.tracked.copyButton),
        svg: summarizeElement(state.tracked.svg),
      };
    },
    getStatus() {
      return {
        active: state.active,
        rootSelector: state.rootSelector,
        copyButtonSelector: state.copyButtonSelector,
        lastStartError: state.lastStartError,
        samples: state.samples.length,
        events: state.events.length,
      };
    },
    stop,
  };

  console.log("Installed window.__codeBitCapture");
  autoStart();
}();
