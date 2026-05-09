import * as p from "@clack/prompts";
import { buildCommand } from "@stricli/core";
import { createApiClient } from "../lib/api-client.js";
import { loadCredentials } from "../lib/credentials.js";
import { getProjectOrgId, setProjectOrgId } from "../lib/project-config.js";

async function runSetOrg(): Promise<void> {
	p.intro("rudel set-org");

	const credentials = loadCredentials();
	if (!credentials) {
		p.log.error("Not authenticated.");
		p.outro("Run `rudel login` first.");
		process.exitCode = 1;
		return;
	}

	let orgs: { id: string; name: string; slug: string }[];
	if (credentials.authType === "api-key") {
		orgs = credentials.organizations ?? [];
	} else {
		const client = createApiClient(credentials);
		try {
			orgs = await client.listMyOrganizations();
		} catch {
			p.log.error("Failed to fetch organizations. Check your connection.");
			process.exitCode = 1;
			return;
		}
	}

	if (orgs.length === 0) {
		p.log.error("No organizations found.");
		p.outro("Create one in the desktop app first.");
		process.exitCode = 1;
		return;
	}

	const cwd = process.cwd();
	const currentOrgId = await getProjectOrgId(cwd);

	const selected = await p.select({
		message: "Select an organization for this repository",
		options: orgs.map((org) => ({
			value: org.id,
			label: org.name,
			hint: org.id === currentOrgId ? `${org.slug} (current)` : org.slug,
		})),
		initialValue: currentOrgId ?? undefined,
	});

	if (p.isCancel(selected)) {
		p.cancel("Cancelled.");
		return;
	}

	await setProjectOrgId(cwd, selected);
	const selectedOrg = orgs.find((o) => o.id === selected);
	p.log.success(`Organization set to: ${selectedOrg?.name}`);
	p.outro("Done!");
}

export const setOrgCommand = buildCommand({
	loader: async () => ({ default: runSetOrg }),
	parameters: {},
	docs: {
		brief: "Set the organization for the current repository",
	},
});
