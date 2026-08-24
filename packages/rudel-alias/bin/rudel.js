#!/usr/bin/env node
import { runCli } from "@opalinehq/cli/run";

process.stderr.write("rudel is now opaline\n");
await runCli(process.argv.slice(2));
