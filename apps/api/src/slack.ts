import { getLogger } from "@logtape/logtape";

const logger = getLogger(["rudel", "api", "slack"]);

export async function fetchGitHubHandle(
	accountId: string,
): Promise<string | null> {
	try {
		const res = await fetch(`https://api.github.com/user/${accountId}`, {
			headers: { Accept: "application/vnd.github.v3+json" },
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { login?: string };
		return data.login ?? null;
	} catch (err) {
		logger.error(
			"Failed to fetch GitHub handle for account {accountId}: {error}",
			{ accountId, error: err },
		);
		return null;
	}
}

export async function notifySignup(
	webhookUrl: string,
	user: { name: string; email: string },
	githubHandle?: string | null,
): Promise<void> {
	try {
		const lines = [
			`*New signup* on Rudel AI`,
			`*Name:* ${user.name}`,
			`*Email:* ${user.email}`,
		];
		if (githubHandle) {
			lines.push(`*GitHub:* ${githubHandle}`);
		}

		await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text: lines.join("\n") }),
		});
	} catch (err) {
		logger.error("Failed to send Slack signup notification: {error}", {
			error: err,
		});
	}
}

export async function notifyAccountDeletion(
	webhookUrl: string,
	user: { id: string; name: string; email: string },
	deletedOrganizationIds: string[],
): Promise<void> {
	try {
		const orgList =
			deletedOrganizationIds.length > 0
				? deletedOrganizationIds.map((id) => `\`${id}\``).join(", ")
				: "_(none — user had no sole-member orgs)_";

		const lines = [
			`*Account deleted* — user self-deleted via settings`,
			`*User ID:* \`${user.id}\``,
			`*Name:* ${user.name}`,
			`*Email:* ${user.email}`,
			`*Deleted org IDs:* ${orgList}`,
			`_ClickHouse session data keyed by these IDs may still exist and require manual cleanup._`,
		];

		await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text: lines.join("\n") }),
		});
	} catch (err) {
		logger.error(
			"Failed to send Slack account deletion notification: {error}",
			{ error: err },
		);
	}
}
