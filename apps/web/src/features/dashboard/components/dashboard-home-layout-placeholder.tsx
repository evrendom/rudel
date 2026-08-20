const COMPACT_WINDOW_KEYS: readonly string[] = [
	"compact-window-a",
	"compact-window-b",
	"compact-window-c",
	"compact-window-d",
	"compact-window-e",
];

const SUPPORTING_WINDOW_KEYS: readonly string[] = [
	"supporting-window-a",
	"supporting-window-b",
];

const WIDE_WINDOW_KEYS: readonly string[] = [
	"wide-window-a",
	"wide-window-b",
	"wide-window-c",
];

function DashboardPlaceholderSectionMarker() {
	return (
		<div className="flex h-5 items-center px-2" aria-hidden="true">
			<div className="h-2.5 w-24 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
		</div>
	);
}

export function DashboardHomeLayoutPlaceholder() {
	return (
		<section
			aria-labelledby="dashboard-layout-preview-heading"
			className="@container/dashboard-home flex min-h-full w-full flex-col"
		>
			<h1 id="dashboard-layout-preview-heading" className="sr-only">
				Dashboard layout preview
			</h1>

			<div className="mx-auto flex w-full max-w-[56.25rem] flex-col gap-8 pb-14 pt-10 @xl/dashboard-home:gap-10 @xl/dashboard-home:pt-14">
				<div
					aria-hidden="true"
					className="flex min-h-16 items-center justify-center"
				>
					<div className="h-7 w-48 rounded-lg bg-[color:var(--dashboardy-subsurface-strong)]" />
				</div>

				<div className="flex flex-col gap-3">
					<DashboardPlaceholderSectionMarker />
					<div className="grid grid-cols-2 gap-3 @md/dashboard-home:grid-cols-3 @3xl/dashboard-home:grid-cols-5">
						{COMPACT_WINDOW_KEYS.map((key) => (
							<div
								key={key}
								aria-hidden="true"
								className="flex aspect-[9/8] min-w-0 flex-col overflow-hidden rounded-xl border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]"
							>
								<div className="h-10 shrink-0 border-b border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)]" />
								<div className="flex min-h-0 flex-1 flex-col justify-end gap-2 p-4">
									<div className="h-2.5 w-2/3 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
									<div className="h-2 w-2/5 rounded-full bg-[color:var(--dashboardy-subsurface)]" />
								</div>
							</div>
						))}
					</div>
				</div>

				<div className="flex flex-col gap-3">
					<DashboardPlaceholderSectionMarker />
					<div
						aria-hidden="true"
						className="flex h-56 min-h-0 flex-col overflow-hidden rounded-xl border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]"
					>
						<div className="flex h-10 shrink-0 items-center border-b border-[color:var(--dashboardy-border)] px-4">
							<div className="h-2.5 w-28 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
						</div>
						<div className="grid min-h-0 flex-1 grid-cols-[2fr_1fr]">
							<div className="min-w-0 p-4">
								<div className="h-full rounded-lg bg-[color:var(--dashboardy-subsurface)]" />
							</div>
							<div className="min-w-0 border-l border-[color:var(--dashboardy-border)] p-4">
								<div className="h-full rounded-lg bg-[color:var(--dashboardy-subsurface)]" />
							</div>
						</div>
					</div>
				</div>

				<div className="flex flex-col gap-3">
					<DashboardPlaceholderSectionMarker />
					<div className="grid gap-3 @xl/dashboard-home:grid-cols-2">
						{SUPPORTING_WINDOW_KEYS.map((key) => (
							<div
								key={key}
								aria-hidden="true"
								className="flex h-32 min-w-0 flex-col overflow-hidden rounded-xl border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]"
							>
								<div className="h-9 shrink-0 border-b border-[color:var(--dashboardy-border)]" />
								<div className="min-h-0 flex-1 bg-[color:var(--dashboardy-subsurface)]" />
							</div>
						))}
					</div>
				</div>

				<div className="flex flex-col gap-3">
					<DashboardPlaceholderSectionMarker />
					<div className="grid gap-3 @md/dashboard-home:grid-cols-2 @2xl/dashboard-home:grid-cols-3">
						{WIDE_WINDOW_KEYS.map((key) => (
							<div
								key={key}
								aria-hidden="true"
								className="flex h-32 min-w-0 flex-col overflow-hidden rounded-xl border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]"
							>
								<div className="flex h-11 shrink-0 items-center px-4">
									<div className="h-2.5 w-24 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
								</div>
								<div className="min-h-0 flex-1 bg-[color:var(--dashboardy-subsurface)]" />
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
