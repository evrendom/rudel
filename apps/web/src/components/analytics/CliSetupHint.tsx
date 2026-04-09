const setupCommands = [
	{
		command: "npm install -g rudel",
		title: "Install CLI",
	},
	{
		command: "rudel login",
		title: "Log in",
	},
	{
		command: "rudel enable",
		title: "Enable auto-upload",
	},
	{
		command: "rudel upload",
		title: "Upload sessions",
	},
] as const;

interface CommandBlockProps {
	label: string;
	command: string;
}

function CommandBlock({ label, command }: CommandBlockProps) {
	return (
		<div className="rounded-[1.75rem] border border-border/60 bg-card px-5 py-5 shadow-none">
			<p className="[font-family:var(--app-font-heading)] text-lg font-extrabold tracking-[-0.02em] text-foreground">
				{label}
			</p>
			<code className="mt-4 block rounded-2xl border border-border/60 bg-background px-3 py-3 font-mono text-[13px] text-foreground">
				{command}
			</code>
		</div>
	);
}

export function CliSetupHint() {
	return (
		<div className="mt-4 mx-auto grid w-full max-w-xl gap-3">
			{setupCommands.map((step) => (
				<CommandBlock
					key={step.command}
					label={step.title}
					command={step.command}
				/>
			))}
		</div>
	);
}
