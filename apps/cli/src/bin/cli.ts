#!/usr/bin/env node
import { run } from "@stricli/core";
import { app } from "../app.js";
import { shutdownCliProductAnalytics } from "../lib/product-analytics.js";

try {
	await run(app, process.argv.slice(2), { process });
} finally {
	await shutdownCliProductAnalytics();
}
