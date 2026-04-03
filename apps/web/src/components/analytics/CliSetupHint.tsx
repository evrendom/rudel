import { Terminal } from "lucide-react";
import { AnalyticsCard } from "./AnalyticsCard";

interface CommandBlockProps {
	label: string;
	command: string;
	hint?: string;
}

function CommandBlock({ label, command, hint }: CommandBlockProps) {
	return (
		<div>
			<p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
			<pre className="bg-background rounded-md border border-border px-4 py-3 text-sm font-mono text-foreground">
				{command}
			</pre>
			{hint && (
				<p className="text-xs text-muted-foreground/60 mt-1.5">{hint}</p>
			)}
		</div>
	);
}

export function CliSetupHint() {
	return (
		<AnalyticsCard className="mt-4">
			<div className="flex flex-col items-center justify-center py-20 px-4 text-center">
				<div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6">
					<Terminal className="w-8 h-8 text-muted-foreground" />
				</div>
				<h3 className="text-lg font-semibold text-foreground mb-3">
					No sessions yet
				</h3>
				<p className="text-sm text-muted-foreground max-w-lg mb-6">
					Install the Rudel CLI and enable automatic uploads to start tracking
					your team's Claude Code / Codex sessions.
				</p>
				<div className="w-full max-w-md text-left space-y-4">
					<CommandBlock
						label="1. Install the CLI globally"
						command="npm install -g rudel"
					/>
					<CommandBlock
						label="2. Log in to your account"
						command="rudel login"
					/>
					<CommandBlock
						label="3. Enable auto-upload in your repository"
						command="rudel enable"
						hint="Sessions will appear here automatically after your next Claude Code / Codex session ends. The enable command will also ask you if you want to upload previous sessions"
					/>
					<CommandBlock
						label="4. Or upload sessions manually"
						command="rudel upload"
						hint="Upload previous sessions at any time."
					/>
				</div>
			</div>
		</AnalyticsCard>
	);
}
