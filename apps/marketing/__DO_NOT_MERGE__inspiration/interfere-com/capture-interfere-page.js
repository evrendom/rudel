/**
 * Interfere reference-page exporter.
 *
 * Run this entire file in DevTools Console while viewing the Interfere page
 * you want to study. With the companion local server running, it writes a
 * network-backed HTML capture directly into this folder. Otherwise it falls
 * back to a normal browser download.
 *
 * This is temporary reference material. Do not ship it with Opaline.
 */

(async () => {
	const options = {
		// "snapshot" is the stable local mode: it removes the origin-dependent
		// Interfere application runtime while retaining CSS motion and replaying
		// active Web Animations captured at export time.
		// "preserve" is diagnostic only; the app currently clears its server DOM
		// after hydrating away from interfere.com.
		runtimeMode: "snapshot",
		stripTracking: true,
		captureScrollPositions: true,
		captureCanvas: true,
		outputName: "interfere-engineers.capture.html",
		localSaveEndpoint: "http://127.0.0.1:4174/__capture",
		fallbackToBrowserDownload: true,
	};

	const sourceUrl = new URL(window.location.href);
	const captureAttribute = "data-interfere-capture-id";
	const trackerPattern =
		/(?:redditstatic|reddit\.com\/pixel|securemet|cloudflareinsights|google-analytics|googletagmanager|doubleclick|segment\.com|posthog|mixpanel|hotjar|clarity\.ms)/i;
	const runtimeHostPattern = /(?:^|\.)assets\.interfere\.com$/i;
	const originalCaptureAttributes = new Map();

	const absoluteUrl = (value, base = sourceUrl.href) => {
		if (!value || /^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(value)) {
			return value;
		}

		try {
			return new URL(value, base).href;
		} catch {
			return value;
		}
	};

	const rewriteSrcset = (srcset, base = sourceUrl.href) =>
		srcset
			.split(",")
			.map((candidate) => {
				const trimmed = candidate.trim();
				if (!trimmed) return trimmed;
				const [url, ...descriptor] = trimmed.split(/\s+/);
				return [absoluteUrl(url, base), ...descriptor].join(" ");
			})
			.join(", ");

	const rewriteCssUrls = (css, stylesheetUrl) =>
		css
			.replace(
				/url\(\s*(["']?)(?!data:|blob:|#)([^"')]+)\1\s*\)/gi,
				(_match, _quote, value) =>
					`url("${absoluteUrl(value.trim(), stylesheetUrl)}")`,
			)
			.replace(
				/@import\s+(?:url\(\s*)?(["'])([^"']+)\1\s*\)?/gi,
				(_match, _quote, value) =>
					`@import url("${absoluteUrl(value, stylesheetUrl)}")`,
			);

	const jsonForScript = (value) =>
		JSON.stringify(value)
			.replaceAll("<", "\\u003c")
			.replaceAll(">", "\\u003e")
			.replaceAll("&", "\\u0026");

	const jsonSafe = (value) => {
		if (value === Infinity) return "__CAPTURE_INFINITY__";
		if (value === -Infinity) return "__CAPTURE_NEGATIVE_INFINITY__";
		if (
			typeof value === "number" ||
			typeof value === "string" ||
			typeof value === "boolean"
		) {
			return value;
		}
		if (value == null) return null;
		if (Array.isArray(value)) return value.map(jsonSafe);
		if (typeof value === "object") {
			return Object.fromEntries(
				Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]),
			);
		}
		return String(value);
	};

	const collectOpenDomElements = () => {
		const elements = [document.documentElement];

		const visitChildren = (container) => {
			for (const child of container.children) {
				elements.push(child);
				if (child.shadowRoot) visitChildren(child.shadowRoot);
				visitChildren(child);
			}
		};

		if (document.documentElement.shadowRoot) {
			visitChildren(document.documentElement.shadowRoot);
		}
		visitChildren(document.documentElement);
		return elements;
	};

	const liveElements = collectOpenDomElements();

	liveElements.forEach((element, index) => {
		originalCaptureAttributes.set(
			element,
			element.getAttribute(captureAttribute),
		);
		element.setAttribute(captureAttribute, String(index));
	});

	try {
		const clone = document.documentElement.cloneNode(true);
		const cloneDocument = document.implementation.createHTMLDocument("");
		cloneDocument.replaceChild(clone, cloneDocument.documentElement);
		const clonedElementsById = new Map();

		const indexClonedSubtree = (root) => {
			if (root instanceof Element && root.hasAttribute(captureAttribute)) {
				clonedElementsById.set(root.getAttribute(captureAttribute), root);
			}

			root.querySelectorAll(`[${captureAttribute}]`).forEach((element) => {
				clonedElementsById.set(element.getAttribute(captureAttribute), element);
			});
		};

		const cssTextFromStyleSheets = (styleSheets) =>
			[...styleSheets]
				.map((sheet) => {
					try {
						return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
					} catch {
						return "";
					}
				})
				.filter(Boolean)
				.join("\n");

		indexClonedSubtree(cloneDocument.documentElement);

		let capturedShadowRootCount = 0;
		const materializeOpenShadowRoot = (liveHost, clonedHost) => {
			const liveShadowRoot = liveHost.shadowRoot;
			if (!liveShadowRoot || !clonedHost) return;

			const template = cloneDocument.createElement("template");
			template.setAttribute("shadowrootmode", "open");
			if (liveShadowRoot.delegatesFocus) {
				template.setAttribute("shadowrootdelegatesfocus", "");
			}

			for (const child of liveShadowRoot.childNodes) {
				template.content.append(child.cloneNode(true));
			}

			const adoptedCss = cssTextFromStyleSheets(
				liveShadowRoot.adoptedStyleSheets || [],
			);
			if (adoptedCss) {
				const style = cloneDocument.createElement("style");
				style.dataset.capturedAdoptedShadowStyles = "true";
				style.textContent = rewriteCssUrls(adoptedCss, sourceUrl.href);
				template.content.append(style);
			}

			clonedHost.prepend(template);
			indexClonedSubtree(template.content);
			capturedShadowRootCount += 1;

			liveShadowRoot.querySelectorAll("*").forEach((nestedLiveHost) => {
				if (!nestedLiveHost.shadowRoot) return;
				const nestedId = nestedLiveHost.getAttribute(captureAttribute);
				materializeOpenShadowRoot(
					nestedLiveHost,
					clonedElementsById.get(nestedId),
				);
			});
		};

		[
			document.documentElement,
			...document.documentElement.querySelectorAll("*"),
		].forEach((liveHost) => {
			if (!liveHost.shadowRoot) return;
			const id = liveHost.getAttribute(captureAttribute);
			materializeOpenShadowRoot(liveHost, clonedElementsById.get(id));
		});

		cloneDocument
			.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]')
			.forEach((node) => {
				node.remove();
			});

		let base = cloneDocument.querySelector("base");
		if (!base) {
			base = cloneDocument.createElement("base");
			cloneDocument.head.prepend(base);
		}
		base.href = sourceUrl.href;

		const urlAttributes = [
			"src",
			"href",
			"action",
			"poster",
			"data",
			"cite",
			"formaction",
		];
		clonedElementsById.values().forEach((element) => {
			for (const attribute of urlAttributes) {
				if (element.hasAttribute(attribute)) {
					element.setAttribute(
						attribute,
						absoluteUrl(element.getAttribute(attribute)),
					);
				}
			}

			for (const attribute of ["srcset", "imagesrcset"]) {
				if (element.hasAttribute(attribute)) {
					element.setAttribute(
						attribute,
						rewriteSrcset(element.getAttribute(attribute)),
					);
				}
			}

			if (element.hasAttribute("style")) {
				element.setAttribute(
					"style",
					rewriteCssUrls(element.getAttribute("style"), sourceUrl.href),
				);
			}
		});

		// Preserve browser-resolved lazy image choices instead of relying on the
		// local page to make the same responsive-image decision.
		liveElements
			.filter((element) => element instanceof HTMLImageElement)
			.forEach((liveImage) => {
				const id = liveImage.getAttribute(captureAttribute);
				const clonedImage = clonedElementsById.get(id);
				if (clonedImage && liveImage.currentSrc) {
					clonedImage.setAttribute("src", liveImage.currentSrc);
				}
			});

		liveElements
			.filter((element) =>
				element.matches("input, textarea, select, option, details, dialog"),
			)
			.forEach((liveControl) => {
				const id = liveControl.getAttribute(captureAttribute);
				const clonedControl = clonedElementsById.get(id);
				if (!clonedControl) return;

				if (liveControl instanceof HTMLInputElement) {
					clonedControl.setAttribute("value", liveControl.value);
					if (["checkbox", "radio"].includes(liveControl.type)) {
						clonedControl.toggleAttribute("checked", liveControl.checked);
					}
				} else if (liveControl instanceof HTMLTextAreaElement) {
					clonedControl.textContent = liveControl.value;
				} else if (liveControl instanceof HTMLOptionElement) {
					clonedControl.toggleAttribute("selected", liveControl.selected);
				} else if (liveControl instanceof HTMLDetailsElement) {
					clonedControl.toggleAttribute("open", liveControl.open);
				} else if (liveControl instanceof HTMLDialogElement) {
					clonedControl.toggleAttribute("open", liveControl.open);
				}
			});

		if (options.captureCanvas) {
			liveElements
				.filter((element) => element instanceof HTMLCanvasElement)
				.forEach((liveCanvas) => {
					const id = liveCanvas.getAttribute(captureAttribute);
					const clonedCanvas = clonedElementsById.get(id);
					if (!clonedCanvas) return;

					try {
						const image = cloneDocument.createElement("img");
						image.src = liveCanvas.toDataURL("image/png");
						image.alt =
							liveCanvas.getAttribute("aria-label") || "Captured canvas";
						image.className = liveCanvas.className;
						image.setAttribute("style", liveCanvas.getAttribute("style") || "");
						image.setAttribute(captureAttribute, id);
						clonedCanvas.replaceWith(image);
						clonedElementsById.set(id, image);
					} catch (error) {
						console.warn(
							"Could not snapshot a canvas (it may be cross-origin-tainted).",
							error,
						);
					}
				});
		}

		const videoState = liveElements
			.filter((element) => element instanceof HTMLVideoElement)
			.map((video) => ({
				id: video.getAttribute(captureAttribute),
				currentTime: video.currentTime,
				muted: video.muted,
				volume: video.volume,
				playbackRate: video.playbackRate,
				shouldPlay: !video.paused && !video.ended,
			}));

		const scrollState = options.captureScrollPositions
			? liveElements
					.filter((element) => element.scrollTop || element.scrollLeft)
					.map((element) => ({
						id: element.getAttribute(captureAttribute),
						top: element.scrollTop,
						left: element.scrollLeft,
					}))
			: [];

		const animationState = document.getAnimations().flatMap((animation) => {
			const effect = animation.effect;
			if (
				!(effect instanceof KeyframeEffect) ||
				!(effect.target instanceof Element)
			)
				return [];

			const targetId = effect.target.getAttribute(captureAttribute);
			if (targetId == null) return [];

			try {
				return [
					jsonSafe({
						targetId,
						constructorName: animation.constructor?.name || "Animation",
						animationName: animation.animationName || null,
						transitionProperty: animation.transitionProperty || null,
						id: animation.id || null,
						currentTime: animation.currentTime,
						playbackRate: animation.playbackRate,
						playState: animation.playState,
						pending: animation.pending,
						replaceState: animation.replaceState,
						keyframes: effect.getKeyframes(),
						timing: effect.getTiming(),
						computedTiming: effect.getComputedTiming(),
					}),
				];
			} catch (error) {
				console.warn("Could not serialize one animation.", error);
				return [];
			}
		});

		const stylesheetResults = await Promise.all(
			liveElements
				.filter(
					(element) =>
						element instanceof HTMLLinkElement &&
						element.relList.contains("stylesheet"),
				)
				.map(async (liveLink) => {
					const id = liveLink.getAttribute(captureAttribute);
					const clonedLink = clonedElementsById.get(id);
					const stylesheetUrl = liveLink.href;

					if (!clonedLink || !stylesheetUrl) {
						return {
							url: stylesheetUrl,
							inlined: false,
							reason: "missing-link",
						};
					}

					try {
						const response = await fetch(stylesheetUrl, {
							mode: "cors",
							credentials: "omit",
							cache: "force-cache",
						});
						if (!response.ok) throw new Error(`HTTP ${response.status}`);

						const style = cloneDocument.createElement("style");
						style.setAttribute("data-captured-from", stylesheetUrl);
						style.setAttribute(captureAttribute, id);
						if (liveLink.media) style.media = liveLink.media;
						style.textContent = rewriteCssUrls(
							await response.text(),
							stylesheetUrl,
						);
						clonedLink.replaceWith(style);
						clonedElementsById.set(id, style);
						return { url: stylesheetUrl, inlined: true };
					} catch (error) {
						clonedLink.href = stylesheetUrl;
						clonedLink.removeAttribute("integrity");
						return {
							url: stylesheetUrl,
							inlined: false,
							reason: String(error),
						};
					}
				}),
		);

		clonedElementsById.values().forEach((element) => {
			if (
				element instanceof HTMLStyleElement &&
				!element.hasAttribute("data-captured-from")
			) {
				element.textContent = rewriteCssUrls(
					element.textContent,
					sourceUrl.href,
				);
			}
		});

		// Adopted stylesheets are invisible to outerHTML, so preserve any that can
		// be read from the CSSOM.
		const adoptedCss = cssTextFromStyleSheets(
			document.adoptedStyleSheets || [],
		);

		if (adoptedCss) {
			const adoptedStyle = cloneDocument.createElement("style");
			adoptedStyle.dataset.capturedAdoptedStyles = "true";
			adoptedStyle.textContent = rewriteCssUrls(adoptedCss, sourceUrl.href);
			cloneDocument.head.append(adoptedStyle);
		}

		const removedScripts = [];
		clonedElementsById.values().forEach((element) => {
			if (!(element instanceof HTMLScriptElement)) return;
			const script = element;
			if (["application/ld+json", "application/json"].includes(script.type))
				return;

			const scriptUrl = script.src ? new URL(script.src, sourceUrl.href) : null;
			const isTracker =
				(scriptUrl && trackerPattern.test(scriptUrl.href)) ||
				(!scriptUrl &&
					/(?:redditstatic|\brdt\s*\(|cloudflareinsights|securemet)/i.test(
						script.textContent,
					));
			const isInterfereRuntime =
				scriptUrl && runtimeHostPattern.test(scriptUrl.hostname);

			if (
				(options.stripTracking && isTracker) ||
				(options.runtimeMode === "snapshot" &&
					(script.src || script.type === "module")) ||
				(options.runtimeMode === "preserve" && scriptUrl && !isInterfereRuntime)
			) {
				removedScripts.push(script.src || "inline tracking/runtime script");
				script.remove();
				return;
			}

			if (script.src) {
				script.src = absoluteUrl(script.getAttribute("src"));
				script.removeAttribute("integrity");
			}
		});

		const manifest = {
			format: "opaline-reference-capture-v1",
			capturedAt: new Date().toISOString(),
			sourceUrl: sourceUrl.href,
			title: document.title,
			runtimeMode: options.runtimeMode,
			viewport: {
				width: window.innerWidth,
				height: window.innerHeight,
				devicePixelRatio: window.devicePixelRatio,
			},
			colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light",
			windowScroll: { top: window.scrollY, left: window.scrollX },
			stylesheetResults,
			removedScripts,
			capturedShadowRoots: capturedShadowRootCount,
			animations: animationState,
			scrollState,
			videoState,
		};

		const manifestNode = cloneDocument.createElement("script");
		manifestNode.id = "__OPALINE_REFERENCE_CAPTURE__";
		manifestNode.type = "application/json";
		manifestNode.textContent = jsonForScript(manifest);
		cloneDocument.body.append(manifestNode);

		const restoreScript = cloneDocument.createElement("script");
		restoreScript.setAttribute("data-opaline-capture-bootstrap", "true");
		restoreScript.textContent = `
      (() => {
        const captureAttribute = ${jsonForScript(captureAttribute)};
        const runtimeMode = ${jsonForScript(options.runtimeMode)};
        const manifest = JSON.parse(
          document.getElementById("__OPALINE_REFERENCE_CAPTURE__").textContent,
        );
        const revive = (value) => {
          if (value === "__CAPTURE_INFINITY__") return Infinity;
          if (value === "__CAPTURE_NEGATIVE_INFINITY__") return -Infinity;
          if (Array.isArray(value)) return value.map(revive);
          if (value && typeof value === "object") {
            return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, revive(item)]));
          }
          return value;
        };
        const hydrateDeclarativeShadowRoots = (root) => {
          const templates = [...root.querySelectorAll("template[shadowrootmode]")];
          for (const template of templates) {
            const host = template.parentElement;
            if (!host || host.shadowRoot) continue;
            try {
              const shadowRoot = host.attachShadow({
                mode: template.getAttribute("shadowrootmode") || "open",
                delegatesFocus: template.hasAttribute("shadowrootdelegatesfocus"),
              });
              shadowRoot.append(template.content);
              template.remove();
              hydrateDeclarativeShadowRoots(shadowRoot);
            } catch (error) {
              console.warn("Could not restore one captured shadow root.", error);
            }
          }
        };
        hydrateDeclarativeShadowRoots(document);

        const capturedElements = new Map();
        const indexCapturedRoot = (root) => {
          const elements = [...root.querySelectorAll("*")];
          if (root instanceof Element) elements.unshift(root);
          for (const element of elements) {
            const id = element.getAttribute(captureAttribute);
            if (id != null) capturedElements.set(id, element);
            if (element.shadowRoot) indexCapturedRoot(element.shadowRoot);
          }
        };
        indexCapturedRoot(document);
        const find = (id) => capturedElements.get(String(id));

        const pointerGlowsByOwner = new Map();
        for (const element of capturedElements.values()) {
          const transform = element.style.getPropertyValue("transform");
          if (!transform.includes("var(--glow-x") || !transform.includes("var(--glow-y")) {
            continue;
          }
          const owner = element.closest(".group") || element.parentElement;
          if (!owner) continue;
          const glows = pointerGlowsByOwner.get(owner) || [];
          glows.push(element);
          pointerGlowsByOwner.set(owner, glows);
        }
        for (const [owner, glows] of pointerGlowsByOwner) {
          owner.addEventListener(
            "pointermove",
            (event) => {
              const rect = owner.getBoundingClientRect();
              const x = event.clientX - (rect.left + rect.width / 2);
              const y = event.clientY - (rect.top + rect.height / 2);
              for (const glow of glows) {
                glow.style.setProperty("--glow-x", x + "px");
                glow.style.setProperty("--glow-y", y + "px");
              }
            },
            { passive: true },
          );
        }

        requestAnimationFrame(() => {
          for (const item of manifest.scrollState) {
            find(item.id)?.scrollTo({ top: item.top, left: item.left, behavior: "auto" });
          }
          window.scrollTo({
            top: manifest.windowScroll.top,
            left: manifest.windowScroll.left,
            behavior: "auto",
          });

          for (const state of manifest.videoState) {
            const video = find(state.id);
            if (!(video instanceof HTMLVideoElement)) continue;
            video.muted = state.muted;
            video.volume = state.volume;
            video.playbackRate = state.playbackRate;
            const seek = () => {
              if (Number.isFinite(state.currentTime)) video.currentTime = state.currentTime;
              if (state.shouldPlay) video.play().catch(() => {});
            };
            video.readyState >= 1 ? seek() : video.addEventListener("loadedmetadata", seek, { once: true });
          }

          if (runtimeMode === "snapshot") {
            for (const rawAnimation of manifest.animations) {
              const animation = revive(rawAnimation);
              const target = find(animation.targetId);
              if (!target || animation.constructorName !== "Animation") continue;
              try {
                const replay = target.animate(animation.keyframes, animation.timing);
                replay.playbackRate = animation.playbackRate;
                if (animation.currentTime != null) replay.currentTime = animation.currentTime;
                if (animation.playState === "paused") replay.pause();
              } catch (error) {
                console.warn("Could not replay a captured animation.", error);
              }
            }
          }
        });
      })();
    `;
		cloneDocument.body.append(restoreScript);

		const captureComment = cloneDocument.createComment(
			` Temporary Interfere reference captured for Opaline on ${manifest.capturedAt}. DELETE BEFORE MERGE. `,
		);
		cloneDocument.insertBefore(captureComment, cloneDocument.firstChild);

		const html = `<!doctype html>\n${cloneDocument.documentElement.outerHTML}`;
		let savedTo = null;
		let localSaveError = null;

		try {
			const response = await fetch(options.localSaveEndpoint, {
				method: "POST",
				mode: "cors",
				credentials: "omit",
				headers: { "content-type": "text/plain;charset=UTF-8" },
				body: html,
			});
			if (!response.ok)
				throw new Error(`Local receiver returned HTTP ${response.status}`);
			const result = await response.json();
			savedTo = result.path;
		} catch (error) {
			localSaveError = error;
			if (!options.fallbackToBrowserDownload) throw error;

			const blob = new Blob([html], { type: "text/html;charset=utf-8" });
			const downloadUrl = URL.createObjectURL(blob);
			const download = document.createElement("a");
			download.href = downloadUrl;
			download.download = options.outputName;
			download.style.display = "none";
			document.body.append(download);
			download.click();
			download.remove();
			window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 30_000);
		}

		console.group("Interfere reference capture complete");
		if (savedTo) {
			console.log(`Saved directly to ${savedTo}`);
		} else {
			console.log(`Downloaded ${options.outputName} through the browser.`);
			console.warn(
				"The local receiver was unavailable, so the absolute-path save could not be used.",
				localSaveError,
			);
		}
		console.log(`Runtime mode: ${options.runtimeMode}`);
		console.log(`Captured ${animationState.length} browser animations.`);
		console.table(stylesheetResults);
		if (removedScripts.length) console.log("Removed scripts:", removedScripts);
		console.log(
			"Serve the file over HTTP; do not open it directly with file://.",
		);
		console.groupEnd();
	} finally {
		for (const [element, previousValue] of originalCaptureAttributes) {
			if (previousValue == null) element.removeAttribute(captureAttribute);
			else element.setAttribute(captureAttribute, previousValue);
		}
	}
})().catch((error) => {
	console.error("Interfere reference capture failed.", error);
});
