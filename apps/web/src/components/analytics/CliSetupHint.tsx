import { cn } from "@/lib/utils";

const setupCommands = [
	{
		command: "npm install -g rudel",
		id: "install-cli",
		title: "Install CLI",
	},
	{
		command: "rudel login",
		id: "log-in",
		title: "Log in",
	},
	{
		command: "rudel enable",
		id: "enable-auto-upload",
		title: "Enable auto-upload",
	},
	{
		command: "rudel upload",
		id: "upload-sessions",
		title: "Upload sessions",
	},
] as const;

export type CliSetupStepId = (typeof setupCommands)[number]["id"];

interface CommandBlockProps {
	label: string;
	command: string;
	isComplete?: boolean;
}

function CommandBlock({
	label,
	command,
	isComplete = false,
}: CommandBlockProps) {
	return (
		<div
			data-complete={isComplete ? "true" : "false"}
			className={cn(
				"rounded-[1.75rem] border border-border/60 bg-card px-5 py-5 shadow-none transition-colors",
				isComplete &&
					"border-status-success-border bg-status-success-bg text-status-success-text",
			)}
		>
			<p
				className={cn(
					"[font-family:var(--app-font-heading)] text-lg font-extrabold tracking-[-0.02em] text-foreground transition-colors",
					isComplete && "text-status-success-text",
				)}
			>
				{label}
			</p>
			<code
				className={cn(
					"mt-4 block rounded-2xl border border-border/60 bg-background px-3 py-3 font-mono text-[13px] text-foreground transition-colors",
					isComplete &&
						"border-status-success-border bg-status-success-bg text-status-success-text",
				)}
			>
				{command}
			</code>
		</div>
	);
}

export function CliSetupHint({
	completedStepIds = [],
}: {
	completedStepIds?: readonly CliSetupStepId[];
}) {
	const completedSteps = new Set(completedStepIds);

	return (
		<div className="mt-4 mx-auto grid w-full max-w-xl gap-3">
			{setupCommands.map((step) => (
				<CommandBlock
					key={step.command}
					label={step.title}
					command={step.command}
					isComplete={completedSteps.has(step.id)}
				/>
			))}
		</div>
	);
}
