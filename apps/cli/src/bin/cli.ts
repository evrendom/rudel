#!/usr/bin/env node
import { runCli } from "../run-cli.js";

await runCli(process.argv.slice(2));
