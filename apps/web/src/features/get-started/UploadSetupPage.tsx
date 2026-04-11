import { CliSetupHint } from "@/components/analytics/CliSetupHint";

export function UploadSetupPage() {
	return (
		<div className="flex min-h-screen items-center bg-background px-4 py-6 sm:px-6 lg:px-8">
			<div className="mx-auto w-full max-w-4xl space-y-10">
				<div className="px-2 py-1 text-center sm:px-0">
					<h1 className="mx-auto max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-foreground">
						Run these commands first so your dashboard isn't empty
					</h1>
				</div>

				<CliSetupHint />
			</div>
		</div>
	);
}
