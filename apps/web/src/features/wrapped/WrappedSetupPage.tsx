import { Button } from "@/app/ui/button";
import { UploadSetupPage } from "@/features/get-started/UploadSetupPage";

type WrappedSetupPageMode = "checking" | "setup" | "waiting";

interface WrappedSetupPageProps {
	mode: WrappedSetupPageMode;
	onBackToSetup?: () => void;
	onWaitForFirstSession?: () => void;
}

export function WrappedSetupPage(props: WrappedSetupPageProps) {
	const { mode, onBackToSetup, onWaitForFirstSession } = props;

	if (mode === "checking") {
		return (
			<UploadSetupPage
				description="Checking whether your first Geneva sessions already exist. Stay on this page for a moment."
				eyebrow="Wrapped setup"
				title="Checking your uploaded sessions"
			/>
		);
	}

	if (mode === "waiting") {
		return (
			<UploadSetupPage
				description="Leave this open after you run the commands. We will continue into the wrapped story as soon as your first session lands."
				eyebrow="Wrapped setup"
				footer={
					<div className="flex flex-col gap-3">
						<div className="rounded-3xl border border-border bg-background px-4 py-3 font-mono text-sm text-foreground">
							rudel upload
						</div>
						<Button
							className="w-full"
							onClick={onBackToSetup}
							size="lg"
							variant="outline"
						>
							Back to setup
						</Button>
					</div>
				}
				title="Waiting for your first session"
			/>
		);
	}

	return (
		<UploadSetupPage
			description="Run these commands on desktop. When your first session lands, we will continue into the wrapped story automatically."
			eyebrow="Wrapped setup"
			footer={
				<Button className="w-full" onClick={onWaitForFirstSession} size="lg">
					I ran the commands. Wait for my first session
				</Button>
			}
			title="Connect Rudel first"
		/>
	);
}
