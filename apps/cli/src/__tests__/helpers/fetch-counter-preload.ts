import { appendFileSync } from "node:fs";

const logPath = process.env.OPALINE_TEST_FETCH_LOG;
if (!logPath) throw new Error("OPALINE_TEST_FETCH_LOG is required");

appendFileSync(logPath, "preloaded\n");
globalThis.fetch = (input) => {
	const url = input instanceof Request ? input.url : input.toString();
	appendFileSync(logPath, `request ${url}\n`);
	return Promise.reject(
		new Error(`Unexpected test transport request to ${url}`),
	);
};
