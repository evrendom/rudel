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
	variant?: "default" | "wrapped-story";
}

function CommandBlock({
	label,
	command,
	isComplete = false,
	variant = "default",
}: CommandBlockProps) {
	const isWrappedStory = variant === "wrapped-story";

	return (
		<div
			data-complete={isComplete ? "true" : "false"}
			className={cn(
				isWrappedStory
					? "mymind-wrapped-setup-command"
					: "rounded-[1.75rem] border border-border/60 bg-card px-5 py-5 shadow-none transition-colors",
				isComplete
					? isWrappedStory
						? "is-complete"
						: "border-status-success-border bg-status-success-bg text-status-success-text"
					: null,
			)}
		>
			<p
				className={cn(
					isWrappedStory
						? "mymind-wrapped-setup-command__label"
						: "[font-family:var(--app-font-heading)] text-lg font-extrabold tracking-[-0.02em] text-foreground transition-colors",
					isComplete
						? isWrappedStory
							? "is-complete"
							: "text-status-success-text"
						: null,
				)}
			>
				{label}
			</p>
			<code
				className={cn(
					isWrappedStory
						? "mymind-wrapped-setup-command__code"
						: "mt-4 block rounded-2xl border border-border/60 bg-background px-3 py-3 font-mono text-[13px] text-foreground transition-colors",
					isComplete
						? isWrappedStory
							? "is-complete"
							: "border-status-success-border bg-status-success-bg text-status-success-text"
						: null,
				)}
			>
				{command}
			</code>
		</div>
	);
}

export function CliSetupHint({
	completedStepIds = [],
	variant = "default",
}: {
	completedStepIds?: readonly CliSetupStepId[];
	variant?: "default" | "wrapped-story";
}) {
	const completedSteps = new Set(completedStepIds);
	const isWrappedStory = variant === "wrapped-story";

	return (
		<div
			className={cn(
				isWrappedStory
					? "mymind-wrapped-setup-steps"
					: "mt-4 mx-auto grid w-full max-w-xl gap-3",
			)}
		>
			{setupCommands.map((step) => (
				<CommandBlock
					key={step.command}
					label={step.title}
					command={step.command}
					isComplete={completedSteps.has(step.id)}
					variant={variant}
				/>
			))}
		</div>
	);
}
