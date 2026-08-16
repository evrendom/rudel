import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserSession, wait } from "./driver.mjs";

const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const outputPath = path.resolve(
	marketingRoot,
	"../../.context/extractions/canvas/program-trace.json",
);
const sourceUrl =
	process.env.OPALINE_CANVAS_SOURCE_URL ??
	"http://127.0.0.1:4175/__lens-atoms/hero?opaline-layer=canvas";

const instrumentation = `(() => {
	const install = (Context) => {
	const prototype = Context.prototype;
	const originalDrawElements = prototype.drawElements;
	const originalDrawArrays = prototype.drawArrays;

	const serializeUniform = (value) => {
		if (value === null || typeof value === "number" || typeof value === "boolean") {
			return value;
		}
		if (ArrayBuffer.isView(value)) return Array.from(value);
		return String(value);
	};

	const readBuffer = (gl, target, buffer, componentType) => {
		if (!buffer) return null;
		const binding = target === gl.ARRAY_BUFFER
			? gl.ARRAY_BUFFER_BINDING
			: gl.ELEMENT_ARRAY_BUFFER_BINDING;
		const previous = gl.getParameter(binding);
		gl.bindBuffer(target, buffer);
		const byteLength = gl.getBufferParameter(target, gl.BUFFER_SIZE);
		const bytes = new Uint8Array(byteLength);
		gl.getBufferSubData(target, 0, bytes);
		gl.bindBuffer(target, previous);
		let values;
		if (componentType === gl.FLOAT) values = Array.from(new Float32Array(bytes.buffer));
		else if (componentType === gl.UNSIGNED_INT) values = Array.from(new Uint32Array(bytes.buffer));
		else if (componentType === gl.UNSIGNED_SHORT) values = Array.from(new Uint16Array(bytes.buffer));
		else values = Array.from(bytes);
		return { byteLength, values };
	};

	const capture = (gl, draw) => {
		if (
			gl.canvas.width !== 1280 ||
			gl.canvas.height !== 800 ||
			document.getElementById("opaline-line-bg-trace")
		) return;
		const program = gl.getParameter(gl.CURRENT_PROGRAM);
		if (!program) return;
		const shaders = gl.getAttachedShaders(program) ?? [];
		const shaderSources = shaders.map((shader) => ({
			type: gl.getShaderParameter(shader, gl.SHADER_TYPE),
			source: gl.getShaderSource(shader),
		}));
		if (!shaderSources.some(({ source }) => source?.includes("rainbowMask"))) return;

		const uniforms = {};
		const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
		for (let index = 0; index < uniformCount; index += 1) {
			const info = gl.getActiveUniform(program, index);
			if (!info) continue;
			const location = gl.getUniformLocation(program, info.name);
			uniforms[info.name] = {
				type: info.type,
				size: info.size,
				value: serializeUniform(gl.getUniform(program, location)),
			};
		}

		const attributes = [];
		const attributeCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
		for (let index = 0; index < attributeCount; index += 1) {
			const info = gl.getActiveAttrib(program, index);
			if (!info) continue;
			const location = gl.getAttribLocation(program, info.name);
			const buffer = gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);
			const componentType = gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_TYPE);
			attributes.push({
				name: info.name,
				location,
				type: info.type,
				size: gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_SIZE),
				componentType,
				normalized: gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_NORMALIZED),
				stride: gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_STRIDE),
				offset: gl.getVertexAttribOffset(location, gl.VERTEX_ATTRIB_ARRAY_POINTER),
				buffer: readBuffer(gl, gl.ARRAY_BUFFER, buffer, componentType),
			});
		}

		const indexBuffer = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
		const trace = {
			capturedAt: performance.now(),
			canvas: {
				width: gl.canvas.width,
				height: gl.canvas.height,
				clientWidth: gl.canvas.clientWidth,
				clientHeight: gl.canvas.clientHeight,
			},
			viewport: Array.from(gl.getParameter(gl.VIEWPORT)),
			draw,
			shaderSources,
			uniforms,
			attributes,
			indices: readBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, indexBuffer, draw.type),
		};
		window.__opalineLineBgTrace = trace;
		const output = document.createElement("script");
		output.id = "opaline-line-bg-trace";
		output.type = "application/json";
		output.textContent = JSON.stringify(trace);
		document.documentElement.append(output);
	};

	prototype.drawElements = function(mode, count, type, offset) {
		const result = originalDrawElements.call(this, mode, count, type, offset);
		try {
			capture(this, { kind: "elements", mode, count, type, offset });
		} catch (error) {
			window.__opalineLineBgTraceError = error?.stack ?? String(error);
			document.documentElement.dataset.opalineLineBgTraceError = window.__opalineLineBgTraceError;
		}
		return result;
	};
	prototype.drawArrays = function(mode, first, count) {
		const result = originalDrawArrays.call(this, mode, first, count);
		try {
			capture(this, { kind: "arrays", mode, first, count, type: null, offset: null });
		} catch (error) {
			window.__opalineLineBgTraceError = error?.stack ?? String(error);
			document.documentElement.dataset.opalineLineBgTraceError = window.__opalineLineBgTraceError;
		}
		return result;
	};
	};
	for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
		if (Context) install(Context);
	}
	window.__opalineLineBgInstrumented = true;
	document.documentElement.dataset.opalineLineBgInstrumented = "true";
})();`;

const session = await createBrowserSession({ width: 1280, height: 800 });
try {
	await session.client.call("Page.addScriptToEvaluateOnNewDocument", {
		source: instrumentation,
	});
	await session.evaluate(instrumentation);
	await session.navigate(sourceUrl);
	let result = null;
	const observations = [];
	for (let attempt = 0; attempt < 80 && !result; attempt += 1) {
		for (const frame of await session.frameTree()) {
			const observation = await session.evaluate(
				"(() => { const node = document.getElementById('opaline-line-bg-trace'); return { trace: node?.textContent ? JSON.parse(node.textContent) : null, error: document.documentElement.dataset.opalineLineBgTraceError ?? null }; })()",
				{ frameId: frame.id },
			);
			const trace = observation.trace;
			if (trace || observation.error) {
				observations.push({
					frame,
					canvas: trace?.canvas ?? null,
					error: observation.error,
				});
			}
			if (trace?.canvas?.width === 1280 && trace?.canvas?.height === 800) {
				result = { frame, trace };
				break;
			}
		}
		if (!result) await wait(100);
	}
	if (!result) {
		const diagnostics = [];
		for (const frame of await session.frameTree()) {
			diagnostics.push({
				frame,
				state: await session.evaluate(
					"({ instrumented: document.documentElement.dataset.opalineLineBgInstrumented === 'true', error: document.documentElement.dataset.opalineLineBgTraceError ?? null, canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, clientWidth: c.clientWidth, clientHeight: c.clientHeight })) })",
					{ frameId: frame.id },
				),
			});
		}
		console.error(JSON.stringify(observations.slice(-20), null, 2));
		console.error(JSON.stringify(diagnostics, null, 2));
		throw new Error("The isolated 1280x800 LineBg draw was not observed");
	}
	await mkdir(path.dirname(outputPath), { recursive: true });
	await writeFile(
		outputPath,
		`${JSON.stringify({ sourceUrl, viewport: { width: 1280, height: 800, dpr: 1 }, ...result }, null, 2)}\n`,
	);
	console.log(outputPath);
} finally {
	await session.close();
}
