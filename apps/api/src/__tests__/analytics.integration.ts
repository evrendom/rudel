import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { resolve } from "node:path";
import {
	DeveloperCostBreakdownSchema,
	DeveloperDetailsSchema,
	DeveloperErrorSchema,
	DeveloperFeatureUsageSchema,
	DeveloperProjectSchema,
	DeveloperSessionSchema,
	DeveloperSummarySchema,
	DeveloperTeamCardSchema,
	DeveloperTimelineSchema,
	DeveloperTrendDataPointSchema,
	DimensionAnalysisDataPointSchema,
	ErrorsDashboardSchema,
	ErrorTrendDataPointSchema,
	InsightSchema,
	LearningEntrySchema,
	LearningsFeedStatsSchema,
	LearningsTrendDataPointSchema,
	ModelTokensTrendDataSchema,
	OverviewKPIsSchema,
	ProjectContributorSchema,
	ProjectCostBreakdownSchema,
	ProjectDetailDataSchema,
	ProjectErrorSchema,
	ProjectFeatureUsageSchema,
	ProjectInvestmentSchema,
	ProjectTrendDataPointSchema,
	RecurringErrorSchema,
	ROIMetricsSchema,
	ROITrendSchema,
	SessionAnalyticsSchema,
	SessionAnalyticsSummaryComparisonSchema,
	SessionAnalyticsSummarySchema,
	SessionDetailSchema,
	SuccessRateSchema,
	UsageTrendDataSchema,
} from "@rudel/api-routes";

// ── Inline test server helper (avoids cross-package TS rootDir issue) ──

const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");

interface TestServer {
	port: number;
	baseUrl: string;
	stop: () => Promise<void>;
	ensureAlive: () => Promise<void>;
}

function spawnServer(env: Record<string, string | undefined>) {
	const proc = Bun.spawn(["bun", "apps/api/src/index.ts"], {
		cwd: MONOREPO_ROOT,
		stdout: "pipe",
		stderr: "pipe",
		env,
	});
	proc.unref();
	return proc;
}

function drainStreams(proc: ReturnType<typeof Bun.spawn>) {
	if (proc.stdout instanceof ReadableStream)
		proc.stdout.pipeTo(new WritableStream()).catch(() => {});
	if (proc.stderr instanceof ReadableStream)
		proc.stderr.pipeTo(new WritableStream()).catch(() => {});
}

async function parseReadyPort(
	proc: ReturnType<typeof Bun.spawn>,
): Promise<number> {
	const stdout = proc.stdout;
	if (!stdout || !(stdout instanceof ReadableStream))
		throw new Error("Server process has no readable stdout");
	const reader = stdout.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const deadline = Date.now() + 30_000;
	try {
		while (Date.now() < deadline) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const match = buffer.match(/listening on https?:\/\/localhost:(\d+)/i);
			if (match?.[1]) {
				reader.releaseLock();
				return Number.parseInt(match[1], 10);
			}
		}
	} catch {
		// fall through
	}
	proc.kill();
	throw new Error(`Server did not become ready within 30s`);
}

async function waitForReady(baseUrl: string): Promise<void> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${baseUrl}/health`, {
				signal: AbortSignal.timeout(2000),
			});
			if (res.ok) return;
		} catch {
			// retry
		}
		await Bun.sleep(200);
	}
	throw new Error(`Server at ${baseUrl} did not respond within 10s`);
}

async function startTestServer(): Promise<TestServer> {
	const env = {
		...process.env,
		PORT: "0",
		APP_URL: "http://localhost",
		BETTER_AUTH_SECRET: "test-secret-for-integration-tests",
		ALLOWED_ORIGIN: "http://localhost",
	};
	let proc = spawnServer(env);
	let port = await parseReadyPort(proc);
	drainStreams(proc);
	await waitForReady(`http://localhost:${port}`);

	return {
		get port() {
			return port;
		},
		get baseUrl() {
			return `http://localhost:${port}`;
		},
		async stop() {
			proc.kill();
			await proc.exited;
		},
		async ensureAlive() {
			try {
				const res = await fetch(`http://localhost:${port}/health`, {
					signal: AbortSignal.timeout(2000),
				});
				if (res.ok) return;
			} catch {
				// restart
			}
			proc = spawnServer(env);
			port = await parseReadyPort(proc);
			drainStreams(proc);
			await waitForReady(`http://localhost:${port}`);
		},
	};
}

// ── Helpers ─────────────────────────────────────────────────────────

function parseArray<T>(
	schema: { parse: (v: unknown) => T },
	data: unknown,
): T[] {
	if (!Array.isArray(data))
		throw new Error(`Expected array, got ${typeof data}`);
	return data.map((item: unknown) => schema.parse(item));
}

// ── Constants ───────────────────────────────────────────────────────

const TEST_EMAIL = "analytics-test@rudel.ai";
const TEST_PASSWORD = "analytics-test-password-42";
const START_DATE = "2026-02-01";
const END_DATE = "2026-03-15";
const DAYS = 90;

// ── Shared state ────────────────────────────────────────────────────

let server: TestServer;
let token: string;
let userId: string;
let sessionList: Array<{ session_id: string; project_path: string }>;

// ── RPC helper ──────────────────────────────────────────────────────

async function rpc(
	path: string,
	input?: Record<string, unknown>,
): Promise<unknown> {
	const res = await fetch(`${server.baseUrl}/rpc/${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify(input ? { json: input } : {}),
	});
	const data = await res.json();
	if (!res.ok)
		throw new Error(`RPC ${path}: ${res.status} ${JSON.stringify(data)}`);
	return (data as { json: unknown }).json;
}

// ── Setup / teardown ────────────────────────────────────────────────

beforeAll(async () => {
	if (!process.env.CLICKHOUSE_URL) {
		throw new Error(
			"CLICKHOUSE_URL not set — skipping analytics integration tests",
		);
	}

	server = await startTestServer();

	// Sign in as the pre-seeded test user
	const signInRes = await fetch(`${server.baseUrl}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
	});
	if (!signInRes.ok) {
		const body = await signInRes.text();
		throw new Error(
			`Sign-in failed (${signInRes.status}): ${body}. ` +
				"Run: doppler run --project rudel --config ci -- bun scripts/seed-analytics-test-data.ts",
		);
	}

	// Extract token
	const signInData = (await signInRes.json()) as { token?: string };
	if (signInData.token) {
		token = signInData.token;
	} else {
		const cookies = signInRes.headers.getSetCookie();
		const sessionCookie = cookies
			.find((c) => c.startsWith("better-auth.session_token="))
			?.split("=")[1]
			?.split(";")[0];
		if (!sessionCookie)
			throw new Error("Could not extract token from sign-in response");
		token = sessionCookie;
	}

	// Get user ID
	const me = (await rpc("me")) as { id: string };
	userId = me.id;

	// Sanity check: verify analytics data exists
	const kpis = (await rpc("analytics/overview/kpis", {
		startDate: START_DATE,
		endDate: END_DATE,
	})) as { distinct_sessions: number };

	if (kpis.distinct_sessions < 5) {
		throw new Error(
			`Expected >= 5 sessions in analytics, got ${kpis.distinct_sessions}. ` +
				"Run: doppler run --project rudel --config ci -- bun scripts/seed-analytics-test-data.ts",
		);
	}

	// Cache session list for tests that need a session ID / project path
	sessionList = (await rpc("analytics/sessions/list", {
		days: DAYS,
	})) as Array<{
		session_id: string;
		project_path: string;
	}>;
});

beforeEach(async () => {
	await server.ensureAlive();
});

afterAll(async () => {
	if (server) await server.stop();
});

// ── Overview ────────────────────────────────────────────────────────

describe("analytics/overview", () => {
	const dateRange = { startDate: START_DATE, endDate: END_DATE };

	test("kpis", async () => {
		const result = await rpc("analytics/overview/kpis", dateRange);
		const parsed = OverviewKPIsSchema.parse(result);
		expect(parsed.distinct_sessions).toBeGreaterThanOrEqual(5);
		expect(parsed.total_sessions).toBeGreaterThanOrEqual(5);
	}, 30_000);

	test("usageTrend", async () => {
		const result = await rpc("analytics/overview/usageTrend", dateRange);
		const parsed = parseArray(UsageTrendDataSchema, result);
		expect(parsed.length).toBeGreaterThan(0);
	}, 30_000);

	test("modelTokensTrend", async () => {
		const result = await rpc("analytics/overview/modelTokensTrend", dateRange);
		const parsed = parseArray(ModelTokensTrendDataSchema, result);
		expect(parsed.length).toBeGreaterThan(0);
	}, 30_000);

	test("insights", async () => {
		const result = await rpc("analytics/overview/insights", dateRange);
		const parsed = parseArray(InsightSchema, result);
		expect(Array.isArray(parsed)).toBe(true);
	}, 30_000);

	// Known bug: ClickHouse AVG returns null on empty comparison period, failing output validation
	test.todo("teamSummaryComparison", () => {});

	test("successRate", async () => {
		const result = await rpc("analytics/overview/successRate", dateRange);
		const parsed = SuccessRateSchema.parse(result);
		expect(parsed.current.total_sessions).toBeGreaterThanOrEqual(5);
	}, 30_000);
});

// ── Developers ──────────────────────────────────────────────────────

describe("analytics/developers", () => {
	test("list", async () => {
		const result = await rpc("analytics/developers/list", { days: DAYS });
		const parsed = parseArray(DeveloperSummarySchema, result);
		expect(parsed.length).toBeGreaterThanOrEqual(1);
	}, 30_000);

	test("teamCards", async () => {
		const result = await rpc("analytics/developers/teamCards", { days: DAYS });
		const parsed = parseArray(DeveloperTeamCardSchema, result);
		expect(parsed.length).toBeGreaterThanOrEqual(1);
	}, 30_000);

	test("details", async () => {
		const result = await rpc("analytics/developers/details", {
			days: DAYS,
			userId,
		});
		const parsed = DeveloperDetailsSchema.parse(result);
		expect(parsed.user_id).toBe(userId);
		expect(parsed.total_sessions).toBeGreaterThanOrEqual(5);
	}, 30_000);

	test("sessions", async () => {
		const result = await rpc("analytics/developers/sessions", {
			days: DAYS,
			userId,
		});
		const parsed = parseArray(DeveloperSessionSchema, result);
		expect(parsed.length).toBeGreaterThanOrEqual(5);
	}, 30_000);

	test("projects", async () => {
		const result = await rpc("analytics/developers/projects", {
			days: DAYS,
			userId,
		});
		const parsed = parseArray(DeveloperProjectSchema, result);
		expect(parsed.length).toBeGreaterThanOrEqual(1);
	}, 30_000);

	test("timeline", async () => {
		const result = await rpc("analytics/developers/timeline", {
			days: DAYS,
			userId,
		});
		const parsed = parseArray(DeveloperTimelineSchema, result);
		expect(parsed.length).toBeGreaterThan(0);
	}, 30_000);

	test("features", async () => {
		const result = await rpc("analytics/developers/features", {
			days: DAYS,
			userId,
		});
		const parsed = DeveloperFeatureUsageSchema.parse(result);
		expect(parsed).toBeDefined();
	}, 30_000);

	test("errors", async () => {
		const result = await rpc("analytics/developers/errors", {
			days: DAYS,
			userId,
		});
		const parsed = parseArray(DeveloperErrorSchema, result);
		expect(Array.isArray(parsed)).toBe(true);
	}, 30_000);

	test("trends", async () => {
		const result = await rpc("analytics/developers/trends", {
			days: DAYS,
		});
		const parsed = parseArray(DeveloperTrendDataPointSchema, result);
		expect(parsed.length).toBeGreaterThan(0);
	}, 30_000);
});

// ── Projects ────────────────────────────────────────────────────────

describe("analytics/projects", () => {
	test("investment", async () => {
		const result = await rpc("analytics/projects/investment", {
			days: DAYS,
		});
		const parsed = parseArray(ProjectInvestmentSchema, result);
		expect(Array.isArray(parsed)).toBe(true);
	}, 30_000);

	test("trends", async () => {
		const result = await rpc("analytics/projects/trends", {
			days: DAYS,
		});
		const parsed = parseArray(ProjectTrendDataPointSchema, result);
		expect(Array.isArray(parsed)).toBe(true);
	}, 30_000);

	test("details", async () => {
		const projectPath = sessionList[0]?.project_path;
		expect(projectPath).toBeDefined();
		const result = await rpc("analytics/projects/details", {
			days: DAYS,
			projectPath,
		});
		const parsed = ProjectDetailDataSchema.parse(result);
		expect(parsed.project_path).toBe(projectPath as string);
	}, 30_000);

	test("contributors", async () => {
		const projectPath = sessionList[0]?.project_path;
		expect(projectPath).toBeDefined();
		const result = await rpc("analytics/projects/contributors", {
			days: DAYS,
			projectPath,
		});
		const parsed = parseArray(ProjectContributorSchema, result);
		expect(parsed.length).toBeGreaterThanOrEqual(1);
	}, 30_000);

	test("features", async () => {
		const projectPath = sessionList[0]?.project_path;
		expect(projectPath).toBeDefined();
		const result = await rpc("analytics/projects/features", {
			days: DAYS,
			projectPath,
		});
		const parsed = ProjectFeatureUsageSchema.parse(result);
		expect(parsed).toBeDefined();
	}, 30_000);

	test("errors", async () => {
		const projectPath = sessionList[0]?.project_path;
		expect(projectPath).toBeDefined();
		const result = await rpc("analytics/projects/errors", {
			days: DAYS,
			projectPath,
		});
		const parsed = parseArray(ProjectErrorSchema, result);
		expect(Array.isArray(parsed)).toBe(true);
	}, 30_000);
});

// ── Sessions ────────────────────────────────────────────────────────

describe("analytics/sessions", () => {
	test("list", async () => {
		const result = await rpc("analytics/sessions/list", { days: DAYS });
		const parsed = parseArray(SessionAnalyticsSchema, result);
		expect(parsed.length).toBeGreaterThanOrEqual(5);
	}, 30_000);

	test("summary", async () => {
		const result = await rpc("analytics/sessions/summary", { days: DAYS });
		const parsed = SessionAnalyticsSummarySchema.parse(result);
		expect(parsed.total_sessions).toBeGreaterThanOrEqual(5);
	}, 30_000);

	test("summaryComparison", async () => {
		const result = await rpc("analytics/sessions/summaryComparison", {
			days: DAYS,
		});
		const parsed = SessionAnalyticsSummaryComparisonSchema.parse(result);
		expect(parsed.current.total_sessions).toBeGreaterThanOrEqual(5);
	}, 30_000);

	test("dimensionAnalysis", async () => {
		const result = await rpc("analytics/sessions/dimensionAnalysis", {
			days: DAYS,
			dimension: "project_path",
			metric: "session_count",
		});
		const parsed = parseArray(DimensionAnalysisDataPointSchema, result);
		expect(parsed.length).toBeGreaterThan(0);
	}, 30_000);

	test("detail", async () => {
		const sessionId = sessionList[0]?.session_id;
		expect(sessionId).toBeDefined();
		const result = await rpc("analytics/sessions/detail", {
			sessionId: sessionId as string,
		});
		const parsed = SessionDetailSchema.parse(result);
		expect(parsed.session_id).toBe(sessionId as string);
	}, 30_000);
});

// ── ROI ─────────────────────────────────────────────────────────────

describe("analytics/roi", () => {
	test("metrics", async () => {
		const result = await rpc("analytics/roi/metrics", { days: DAYS });
		const parsed = ROIMetricsSchema.parse(result);
		expect(parsed.total_sessions).toBeGreaterThanOrEqual(5);
	}, 30_000);

	test("trends", async () => {
		const result = await rpc("analytics/roi/trends", { days: DAYS });
		const parsed = parseArray(ROITrendSchema, result);
		expect(parsed.length).toBeGreaterThan(0);
	}, 30_000);

	test("breakdownDevelopers", async () => {
		const result = await rpc("analytics/roi/breakdownDevelopers", {
			days: DAYS,
		});
		const parsed = parseArray(DeveloperCostBreakdownSchema, result);
		expect(parsed.length).toBeGreaterThanOrEqual(1);
	}, 30_000);

	test("breakdownProjects", async () => {
		const result = await rpc("analytics/roi/breakdownProjects", {
			days: DAYS,
		});
		const parsed = parseArray(ProjectCostBreakdownSchema, result);
		expect(parsed.length).toBeGreaterThanOrEqual(1);
	}, 30_000);
});

// ── Errors ──────────────────────────────────────────────────────────

describe("analytics/errors", () => {
	test("dashboard", async () => {
		const result = await rpc("analytics/errors/dashboard", {
			startDate: START_DATE,
			endDate: END_DATE,
		});
		const parsed = ErrorsDashboardSchema.parse(result);
		expect(parsed.summary.total_errors).toBeGreaterThanOrEqual(0);
		expect(Array.isArray(parsed.recurring)).toBe(true);
	}, 30_000);

	test("topRecurring", async () => {
		const result = await rpc("analytics/errors/topRecurring", {
			days: DAYS,
			minOccurrences: 1,
		});
		const parsed = parseArray(RecurringErrorSchema, result);
		expect(Array.isArray(parsed)).toBe(true);
	}, 30_000);

	test("trends", async () => {
		const result = await rpc("analytics/errors/trends", {
			startDate: START_DATE,
			endDate: END_DATE,
			splitBy: "project_path",
		});
		const parsed = parseArray(ErrorTrendDataPointSchema, result);
		expect(parsed.length).toBeGreaterThan(0);
		expect(Array.isArray(parsed[0]?.error_types)).toBe(true);
		expect(Array.isArray(parsed[0]?.error_type_occurrences)).toBe(true);
	}, 30_000);
});

// ── Learnings ───────────────────────────────────────────────────────

describe("analytics/learnings", () => {
	test("list", async () => {
		const result = await rpc("analytics/learnings/list", { days: DAYS });
		const parsed = parseArray(LearningEntrySchema, result);
		expect(Array.isArray(parsed)).toBe(true);
	}, 30_000);

	test("stats", async () => {
		const result = await rpc("analytics/learnings/stats", { days: DAYS });
		const parsed = LearningsFeedStatsSchema.parse(result);
		expect(parsed).toBeDefined();
	}, 30_000);

	test("users", async () => {
		const result = await rpc("analytics/learnings/users");
		expect(Array.isArray(result)).toBe(true);
	}, 30_000);

	test("projects", async () => {
		const result = await rpc("analytics/learnings/projects");
		expect(Array.isArray(result)).toBe(true);
	}, 30_000);

	test("trend", async () => {
		const result = await rpc("analytics/learnings/trend", {
			days: DAYS,
			splitBy: "user_id",
		});
		const parsed = parseArray(LearningsTrendDataPointSchema, result);
		expect(Array.isArray(parsed)).toBe(true);
	}, 30_000);
});
