import { promisify } from "node:util";
import { gzip } from "node:zlib";

const gzipAsync = promisify(gzip);

const GZIP_SESSION_DETAIL_PATHS = new Set([
	"/rpc/analytics/sessions/detailSpine",
	"/rpc/analytics/sessions/detailSubagent",
	"/rpc/analytics/sessions/detailTurn",
	"/rpc/analytics/sessions/detailWindow",
]);

// Bodies below this size cost more CPU to compress than bytes they save.
export const GZIP_MIN_BODY_BYTES = 1_024;

function parseEncoding(value: string) {
	const [name, ...parameters] = value.trim().toLowerCase().split(";");
	let quality = 1;
	for (const parameter of parameters) {
		const match = parameter.trim().match(/^q=(0(?:\.\d+)?|1(?:\.0+)?)$/u);
		if (match?.[1]) {
			quality = Number(match[1]);
		}
	}
	return { name, quality };
}

export function requestAcceptsGzip(headers: Headers) {
	const acceptEncoding = headers.get("Accept-Encoding");
	if (!acceptEncoding) {
		return false;
	}
	const encodings = acceptEncoding.split(",").map(parseEncoding);
	const explicit = encodings.find((encoding) => encoding.name === "gzip");
	if (explicit) {
		return explicit.quality > 0;
	}
	return encodings.some(
		(encoding) => encoding.name === "*" && encoding.quality > 0,
	);
}

function appendVary(headers: Headers, value: string) {
	const values = (headers.get("Vary") ?? "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
	if (!values.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
		values.push(value);
	}
	headers.set("Vary", values.join(", "));
}

export async function maybeCompressSessionDetailRpcResponse(input: {
	pathname: string;
	requestHeaders: Headers;
	response: Response;
}) {
	const { pathname, requestHeaders, response } = input;
	if (
		!GZIP_SESSION_DETAIL_PATHS.has(pathname) ||
		response.status < 200 ||
		response.status >= 300 ||
		response.body === null
	) {
		return response;
	}
	appendVary(response.headers, "Accept-Encoding");
	if (
		response.headers.has("Content-Encoding") ||
		!requestAcceptsGzip(requestHeaders)
	) {
		return response;
	}

	const body = await response.arrayBuffer();
	if (body.byteLength < GZIP_MIN_BODY_BYTES) {
		return new Response(body, {
			headers: response.headers,
			status: response.status,
			statusText: response.statusText,
		});
	}

	// Async zlib: a multi-megabyte body must not block the event loop.
	const compressed = await gzipAsync(Buffer.from(body));
	const headers = new Headers(response.headers);
	headers.set("Content-Encoding", "gzip");
	headers.set("Content-Length", String(compressed.byteLength));
	return new Response(compressed, {
		headers,
		status: response.status,
		statusText: response.statusText,
	});
}
