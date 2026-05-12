import { cn } from "@/lib/utils";
import { type CliSetupStepId, cliSetupCommands } from "./cli-setup-commands";
import { WrappedCliSetupCommand } from "./WrappedCliSetupCommand";

export { cliSetupCommands };
export type { CliSetupStepId };

export function CliSetupHint({
	completedStepIds = [],
	currentStepId,
	hideAlternateCommandCaption = false,
	variant = "default",
}: {
	completedStepIds?: readonly CliSetupStepId[];
	currentStepId?: CliSetupStepId | null;
	hideAlternateCommandCaption?: boolean;
	variant?: "default" | "wrapped-story";
}) {
	const completedSteps = new Set(completedStepIds);
	const isWrappedStory = variant === "wrapped-story";
	const currentStepIndex =
		currentStepId === undefined || currentStepId === null
			? null
			: cliSetupCommands.findIndex((step) => step.id === currentStepId);
	const containerClassName = cn(
		isWrappedStory
			? "rudel-wrapped-setup-steps"
			: "mt-4 mx-auto grid w-full max-w-xl gap-3",
	);

	if (!isWrappedStory) {
		return (
			<div className={containerClassName}>
				{cliSetupCommands.map((step) => (
					<DefaultCliSetupCommand
						key={step.command}
						label={step.title}
						command={step.command}
						isComplete={completedSteps.has(step.id)}
					/>
				))}
			</div>
		);
	}

	return (
		<ol className={containerClassName}>
			{cliSetupCommands.map((step, index) => (
				<WrappedCliSetupCommand
					key={step.command}
					label={step.title}
					alternateCommand={step.alternateCommand}
					alternateCommandCaption={
						hideAlternateCommandCaption
							? undefined
							: step.alternateCommandCaption
					}
					command={step.command}
					commandCaption={step.commandCaption}
					description={step.description}
					index={index}
					isActive={currentStepId === step.id}
					isComplete={completedSteps.has(step.id)}
					isUpcoming={
						currentStepIndex !== null &&
						currentStepId !== step.id &&
						index > currentStepIndex &&
						!completedSteps.has(step.id)
					}
				/>
			))}
		</ol>
	);
}

function DefaultCliSetupCommand(props: {
	command: string;
	isComplete: boolean;
	label: string;
}) {
	const { command, isComplete, label } = props;

	return (
		<div
			data-complete={isComplete ? "true" : "false"}
			className={cn(
				"rounded-[1.75rem] border border-border/60 bg-card px-5 py-5 shadow-none transition-colors",
				isComplete
					? "border-status-success-border bg-status-success-bg text-status-success-text"
					: null,
			)}
		>
			<p
				className={cn(
					"[font-family:var(--app-font-heading)] text-lg font-extrabold tracking-[-0.02em] text-foreground transition-colors",
					isComplete ? "text-status-success-text" : null,
				)}
			>
				{label}
			</p>
			<code
				className={cn(
					"mt-4 block rounded-2xl border border-border/60 bg-background px-3 py-3 font-mono text-[13px] text-foreground transition-colors",
					isComplete
						? "border-status-success-border bg-status-success-bg text-status-success-text"
						: null,
				)}
			>
				{command}
			</code>
		</div>
	);
}
