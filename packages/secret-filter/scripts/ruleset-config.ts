export const GITLEAKS_VERSION = "v8.30.1";
export const GITLEAKS_CONFIG_SHA256 =
	"e163e53b9e7e8a8511e77271e2b323ed057759542a6d988258afe3a1fa329caf";
export const GITLEAKS_CONFIG_URL = `https://raw.githubusercontent.com/gitleaks/gitleaks/${GITLEAKS_VERSION}/config/gitleaks.toml`;

export interface SelectedRule {
	readonly sourceId: string;
	readonly ruleId: string;
	readonly secretGroup: number;
	readonly regexOverride?: string;
}

export const SELECTED_RULES: readonly SelectedRule[] = [
	{
		sourceId: "anthropic-admin-api-key",
		ruleId: "anthropic-admin-api-key",
		secretGroup: 1,
	},
	{
		sourceId: "anthropic-api-key",
		ruleId: "anthropic-api-key",
		secretGroup: 1,
	},
	{
		sourceId: "aws-access-token",
		ruleId: "aws-access-key-id",
		secretGroup: 1,
	},
	{
		sourceId: "gcp-api-key",
		ruleId: "google-api-key",
		secretGroup: 1,
	},
	{
		sourceId: "github-app-token",
		ruleId: "github-app-token",
		secretGroup: 0,
	},
	{
		sourceId: "github-fine-grained-pat",
		ruleId: "github-fine-grained-pat",
		secretGroup: 0,
	},
	{
		sourceId: "github-oauth",
		ruleId: "github-oauth",
		secretGroup: 0,
	},
	{
		sourceId: "github-pat",
		ruleId: "github-pat",
		secretGroup: 0,
	},
	{
		sourceId: "gitlab-pat",
		ruleId: "gitlab-pat",
		secretGroup: 0,
	},
	{
		sourceId: "npm-access-token",
		ruleId: "npm-access-token",
		secretGroup: 1,
	},
	{
		sourceId: "openai-api-key",
		ruleId: "openai-api-key",
		secretGroup: 1,
	},
	{
		sourceId: "private-key",
		ruleId: "private-key",
		secretGroup: 0,
		regexOverride:
			"(?i)-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----[A-Za-z0-9+/=\\s-]{64,7000}?KEY(?: BLOCK)?-----",
	},
	{
		sourceId: "sendgrid-api-token",
		ruleId: "sendgrid-api-token",
		secretGroup: 1,
	},
	{
		sourceId: "slack-bot-token",
		ruleId: "slack-bot-token",
		secretGroup: 0,
	},
	{
		sourceId: "slack-user-token",
		ruleId: "slack-user-token",
		secretGroup: 0,
	},
	{
		sourceId: "slack-webhook-url",
		ruleId: "slack-webhook-url",
		secretGroup: 0,
	},
	{
		sourceId: "stripe-access-token",
		ruleId: "stripe-access-token",
		secretGroup: 1,
	},
	{
		sourceId: "twilio-api-key",
		ruleId: "twilio-api-key",
		secretGroup: 0,
	},
];
