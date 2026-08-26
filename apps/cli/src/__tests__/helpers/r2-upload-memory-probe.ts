import { createHash } from "node:crypto";
import { codexAdapter } from "../../internal/agent-adapters/index.js";
import { R2_INGEST_PART_SIZE_BYTES } from "../../lib/r2-ingest-contract.js";
import { buildFilePartRanges } from "../../lib/r2-multipart-upload.js";
import { uploadSession } from "../../lib/uploader.js";

const [transcriptPath, endpoint, token, sessionId] = process.argv.slice(2);
if (!transcriptPath || !endpoint || !token || !sessionId) {
	throw new Error(
		"Expected transcript path, endpoint, token, and session ID arguments",
	);
}

const probeMode = process.env.OPALINE_R2_PROBE_MODE;
const requestPaths: string[] = [];
let initByteLength = 0;
let initSha256 = "";
let uploadedBytes = 0;
let uploadedPartCount = 0;
let uploadedPrefix = "";
const uploadedHash = createHash("sha256");

if (probeMode === "success" || probeMode === "failed-init") {
	globalThis.fetch = async (input, init) => {
		const request = new Request(input, init);
		const pathname = new URL(request.url).pathname;
		requestPaths.push(pathname);
		if (probeMode === "failed-init") {
			return Response.json(
				{
					json: {
						code: "SERVICE_UNAVAILABLE",
						defined: false,
						message: "R2 initialization temporarily unavailable",
						status: 503,
					},
				},
				{ status: 503 },
			);
		}
		if (pathname.startsWith("/r2/probe/part/")) {
			uploadedPartCount += 1;
			if (request.body) {
				for await (const chunk of request.body) {
					uploadedBytes += chunk.byteLength;
					uploadedHash.update(chunk);
					if (uploadedPrefix.length < 4 * 1024) {
						uploadedPrefix += Buffer.from(chunk).toString("utf8");
						uploadedPrefix = uploadedPrefix.slice(0, 4 * 1024);
					}
				}
			}
			return new Response(null, {
				headers: { etag: `"probe-${uploadedPartCount}"` },
			});
		}
		const parsed = (await request.json()) as {
			json: Record<string, unknown>;
		};
		if (pathname === "/rpc/ingest/init") {
			const objects = parsed.json.objects;
			if (!Array.isArray(objects)) throw new Error("Missing probe objects");
			const main = objects.find(
				(object) =>
					typeof object === "object" &&
					object !== null &&
					"kind" in object &&
					object.kind === "main",
			) as Record<string, unknown> | undefined;
			if (
				!main ||
				typeof main.byteLength !== "number" ||
				typeof main.sha256 !== "string"
			) {
				throw new Error("Missing probe main object");
			}
			initByteLength = main.byteLength;
			initSha256 = main.sha256;
			const parts = buildFilePartRanges(
				initByteLength,
				R2_INGEST_PART_SIZE_BYTES,
			).map((range) => ({
				byteLength: range.byteLength,
				headers: { "Content-Length": range.byteLength.toString() },
				partNumber: range.partNumber,
				uploadUrl: `http://127.0.0.1/r2/probe/part/${range.partNumber}`,
			}));
			return Response.json({
				json: {
					expiresAt: "2026-08-25T12:15:00.000Z",
					jobId: "00000000-0000-4000-8000-000000000001",
					objects: [
						{
							byteLength: initByteLength,
							kind: "main",
							objectKey: "ingest/probe/main.jsonl",
							parts,
							sha256: initSha256,
							uploadId: "probe-upload",
						},
					],
					partSizeBytes: R2_INGEST_PART_SIZE_BYTES,
					protocol: "r2_multipart_v1",
				},
			});
		}
		const success = {
			redacted: {},
			redactedBytes: 0,
			sessionId,
			success: true,
		};
		if (pathname === "/rpc/ingest/commit") {
			return Response.json({
				json: {
					jobId: "00000000-0000-4000-8000-000000000001",
					protocol: "r2_multipart_v1",
					result: success,
					status: "completed",
				},
			});
		}
		if (pathname === "/rpc/ingest/status") {
			return Response.json({
				json: {
					attempts: 1,
					availableAt: "2026-08-25T12:00:00.000Z",
					error: null,
					jobId: "00000000-0000-4000-8000-000000000001",
					leaseExpiresAt: null,
					protocol: "r2_multipart_v1",
					result: success,
					status: "completed",
					updatedAt: "2026-08-25T12:00:01.000Z",
				},
			});
		}
		return new Response("not found", { status: 404 });
	};
}

Bun.gc(true);
const baseline = process.memoryUsage();
let peakHeapUsed = baseline.heapUsed;
let peakRss = baseline.rss;
const sampleMemory = () => {
	const usage = process.memoryUsage();
	peakHeapUsed = Math.max(peakHeapUsed, usage.heapUsed);
	peakRss = Math.max(peakRss, usage.rss);
};
const interval = setInterval(sampleMemory, 2);

const result = await (async () => {
	const request = await codexAdapter.buildUploadRequest(
		{
			projectPath: "/test/large-r2-project",
			sessionId,
			transcriptPath,
		},
		{ gitInfo: {}, uploadMode: "manual" },
	);
	sampleMemory();
	return uploadSession(request, {
		allowInsecureEndpoint: false,
		authType: "api-key",
		endpoint,
		onProgress: sampleMemory,
		r2MultipartBaseDelayMs: 0,
		r2StatusPollIntervalMs: 0,
		token,
	});
})().finally(() => clearInterval(interval));
sampleMemory();

process.stdout.write(
	JSON.stringify({
		attempts: result.attempts,
		awsRedactions: result.redacted?.["aws-access-key-id"] ?? 0,
		baselineHeapUsed: baseline.heapUsed,
		baselineRss: baseline.rss,
		heapDelta: peakHeapUsed - baseline.heapUsed,
		initByteLength,
		initSha256,
		error: result.success ? null : result.error,
		peakHeapUsed,
		peakRss,
		redactedBytes: result.redactedBytes,
		retryable: result.retryable ?? null,
		rssDelta: peakRss - baseline.rss,
		success: result.success,
		uploadedBytes,
		uploadedHash: uploadedPartCount > 0 ? uploadedHash.digest("hex") : "",
		uploadedPartCount,
		uploadedPrefix,
		requestPaths,
	}),
);
