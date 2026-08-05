import { Agentation, type Annotation } from "agentation";
import React from "react";
import { createRoot } from "react-dom/client";

const site = new URL(import.meta.url).searchParams.get("site") || "unknown";

const record = (type: string, payload: unknown) => {
	void fetch("/__agentation/events", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ type, payload, pageUrl: window.location.href }),
		keepalive: true,
	}).catch(() => {});
};

const mount = () => {
	if (document.getElementById("__opaline-agentation-root")) return;

	const host = document.createElement("div");
	host.id = "__opaline-agentation-root";
	host.dataset.site = site;
	host.style.display = "contents";
	document.body.append(host);

	const annotationEvent = (type: string) => (annotation: Annotation) => {
		record(type, annotation);
	};

	createRoot(host).render(
		<Agentation
			copyToClipboard
			onAnnotationAdd={annotationEvent("annotation.created")}
			onAnnotationDelete={annotationEvent("annotation.deleted")}
			onAnnotationUpdate={annotationEvent("annotation.updated")}
			onAnnotationsClear={(annotations) =>
				record("annotations.cleared", annotations)
			}
			onCopy={(markdown) => record("annotations.copied", { markdown })}
			onSubmit={(output, annotations) =>
				record("annotations.submitted", { output, annotations })
			}
		/>,
	);
};

const mountAfterHydration = () => window.setTimeout(mount, 750);
if (document.readyState === "complete") mountAfterHydration();
else window.addEventListener("load", mountAfterHydration, { once: true });
