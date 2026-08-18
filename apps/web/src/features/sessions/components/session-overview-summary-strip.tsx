import type { SessionDetailOverview } from "@rudel/api-routes";
import { Bot, CircleAlert, type LucideIcon, Sparkles } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/ui/popover";
import {
	ClaudeModelIcon,
	CodexModelIcon,
} from "@/features/dashboard/components/DashboardModelBadges";
import {
	formatModelDisplayLabel,
	getModelBadgeTone,
	getModelIdentityIconClassName,
} from "@/features/dashboard/components/dashboard-model-brand";
import { cn } from "@/lib/utils";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;
type SessionDetailContext = SessionDetailOverview["context"];
type SessionDetailContextFile = SessionDetailContext["files"][number];

const tagClassName =
	"inline-flex h-8 max-w-80 shrink-0 items-center rounded-lg border border-black/7 bg-(--session-overview-surface) text-base font-medium text-(--session-overview-text) shadow-none sm:h-6 sm:text-xs dark:border-white/8";
const tagIconClassName = "size-4 shrink-0 stroke-(--session-overview-subtle)";

function humanizeIdentifier(value: string) {
	return value
		.replaceAll(/[_-]+/gu, " ")
		.replace(/\b\w/gu, (character) => character.toUpperCase());
}

function SessionContextTag({
	icon,
	label,
	mono = false,
	title,
	tone = "default",
	value,
}: {
	icon: ReactNode;
	label: string;
	mono?: boolean;
	title?: string;
	tone?: "default" | "error";
	value: string;
}) {
	return (
		<li
			className={cn(
				tagClassName,
				"gap-1.5 py-1 pr-2 pl-1",
				tone === "error" &&
					"border-red-500/20 bg-red-500/7 text-red-700 dark:border-red-400/20 dark:bg-red-400/8 dark:text-red-300",
			)}
			title={`${label}: ${title ?? value}`}
		>
			{icon}
			<span className="shrink-0 text-(--session-overview-subtle)">{label}</span>
			<span className={cn("min-w-0 truncate", mono && "font-mono")}>
				{value}
			</span>
		</li>
	);
}

function getFileExtensionLabel(path: string) {
	const fileName = getFileName(path);
	const extensionIndex = fileName.lastIndexOf(".");
	if (extensionIndex < 0 || extensionIndex === fileName.length - 1) {
		return "extensionless";
	}
	return fileName.slice(extensionIndex).toLocaleLowerCase();
}

function getFileName(path: string) {
	return path.replaceAll("\\", "/").split("/").at(-1) ?? path;
}

function groupSessionFilesByExtension(
	files: readonly SessionDetailContextFile[],
) {
	const groupedFiles = new Map<string, SessionDetailContextFile[]>();
	for (const file of files) {
		const extension = getFileExtensionLabel(file.path);
		const group = groupedFiles.get(extension);
		if (group) {
			group.push(file);
		} else {
			groupedFiles.set(extension, [file]);
		}
	}
	return Array.from(groupedFiles, ([extension, grouped]) => ({
		extension,
		files: grouped,
	}));
}

function SessionFileTypeTag({
	extension,
	files,
	label,
}: {
	extension: string;
	files: readonly SessionDetailContextFile[];
	label: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const closeTimeoutRef = useRef<number | undefined>(undefined);
	const fileCount = files.length;
	const fileLabel = fileCount === 1 ? "file" : "files";

	function keepOpen() {
		if (closeTimeoutRef.current !== undefined) {
			window.clearTimeout(closeTimeoutRef.current);
		}
		setIsOpen(true);
	}

	function scheduleClose() {
		if (closeTimeoutRef.current !== undefined) {
			window.clearTimeout(closeTimeoutRef.current);
		}
		closeTimeoutRef.current = window.setTimeout(() => {
			setIsOpen(false);
		}, 120);
	}

	return (
		<li className="shrink-0">
			<Popover onOpenChange={setIsOpen} open={isOpen}>
				<PopoverTrigger
					aria-label={`${fileCount} ${extension} ${fileLabel}`}
					className={cn(
						tagClassName,
						"gap-1.5 px-2 py-1 text-left hover:bg-(--session-overview-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--session-overview-accent)",
					)}
					onMouseEnter={keepOpen}
					onMouseLeave={scheduleClose}
				>
					<span className="min-w-0 truncate">
						{extension} {fileLabel}
					</span>
					<span className="shrink-0 text-(--session-overview-subtle) tabular-nums">
						{fileCount}x
					</span>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-max max-w-[min(20rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-xl p-0"
					onMouseEnter={keepOpen}
					onMouseLeave={scheduleClose}
					side="bottom"
					sideOffset={2}
				>
					<section
						aria-label={`${label} ${extension} files`}
						className="min-w-0 max-w-full"
						data-session-file-list
					>
						<ul className="grid max-h-64 min-w-0 max-w-full gap-0.5 overflow-x-hidden overflow-y-auto p-1.5">
							{files.map((file) => (
								<li className="min-w-0" key={file.path}>
									<p className="max-w-72 truncate rounded-lg px-2.5 py-1.5 text-base font-medium text-popover-foreground sm:text-xs">
										{getFileName(file.path)}
									</p>
								</li>
							))}
						</ul>
					</section>
				</PopoverContent>
			</Popover>
		</li>
	);
}

function SessionContextLucideTag({
	Icon,
	...props
}: Omit<Parameters<typeof SessionContextTag>[0], "icon"> & {
	Icon: LucideIcon;
}) {
	return (
		<SessionContextTag
			{...props}
			icon={<Icon aria-hidden="true" className={tagIconClassName} />}
		/>
	);
}

function SessionContextRow({
	children,
	emptyLabel,
	isEmpty = false,
	label,
	stackFiles = false,
}: {
	children: ReactNode;
	emptyLabel: string;
	isEmpty?: boolean;
	label: string;
	stackFiles?: boolean;
}) {
	return (
		<div
			className="grid min-w-30 flex-[1_1.5_0%] grid-rows-[auto_1fr] gap-1.5 overflow-hidden"
			data-session-context-group={label.toLowerCase()}
		>
			<p className="truncate px-2 text-base font-medium text-(--session-overview-subtle) sm:text-xs">
				{label}
			</p>
			<ul
				aria-label={`${label} items`}
				className={cn(
					"max-h-17.5 min-w-0 items-center overflow-hidden whitespace-nowrap sm:max-h-13.5",
					stackFiles
						? "isolate grid auto-cols-max grid-flow-col grid-rows-2 gap-x-1.5 gap-y-1.5 [&>li]:relative [&>li:hover]:z-10"
						: "flex flex-wrap gap-1.5",
					// Temporarily disabled: stackFiles && "[&>li:nth-child(n+3)]:-ml-4",
				)}
				data-session-context-overflow={stackFiles ? "stack" : "wrap"}
			>
				{isEmpty ? (
					<li className="text-base text-(--session-overview-subtle) sm:text-xs">
						{emptyLabel}
					</li>
				) : (
					children
				)}
			</ul>
		</div>
	);
}

function SessionContextModelIcon({ model }: { model: string | undefined }) {
	const icon = model ? getModelBadgeTone(model).icon : null;
	if (icon === "claude") {
		return (
			<ClaudeModelIcon
				className={cn("size-4 shrink-0", getModelIdentityIconClassName(model))}
			/>
		);
	}
	if (icon === "codex") {
		return (
			<CodexModelIcon
				className={cn("size-4 shrink-0", getModelIdentityIconClassName(model))}
			/>
		);
	}
	return (
		<Bot aria-hidden="true" className={tagIconClassName} strokeWidth={1.75} />
	);
}

function getSubagentModels(viewModel: SessionDetailViewModel) {
	const counts = new Map<string, number>();
	for (const subagent of viewModel.subagentSummaries) {
		const model = subagent.model ?? "Unknown model";
		counts.set(model, (counts.get(model) ?? 0) + 1);
	}
	return Array.from(counts, ([model, count]) => ({ count, model }));
}

export function SessionOverviewSummaryStrip({
	context,
	viewModel,
}: {
	context: SessionDetailContext;
	viewModel: SessionDetailViewModel;
}) {
	const subagentModels = getSubagentModels(viewModel);
	const readFiles = context.files.filter((file) => file.operation === "read");
	const writtenFiles = context.files.filter(
		(file) => file.operation === "created",
	);
	const editedFiles = context.files.filter(
		(file) => file.operation === "edited",
	);
	const readFileGroups = groupSessionFilesByExtension(readFiles);
	const writtenFileGroups = groupSessionFilesByExtension(writtenFiles);
	const editedFileGroups = groupSessionFilesByExtension(editedFiles);

	return (
		<section
			aria-label="Session context"
			className="@container flex shrink-0 items-start gap-4 overflow-x-auto bg-(--session-overview-surface) px-3 py-2"
			data-session-context-layout="horizontal"
		>
			<SessionContextRow emptyLabel="No session information" label="Info">
				{viewModel.safeSkills.map((skill) => (
					<SessionContextLucideTag
						key={`skill:${skill}`}
						Icon={Sparkles}
						label="Skill"
						value={skill}
					/>
				))}
				{subagentModels.map(({ count, model }) => {
					const modelLabel = formatModelDisplayLabel(model);
					return (
						<SessionContextTag
							key={`subagent:${model}`}
							icon={
								<SessionContextModelIcon
									model={model === "Unknown model" ? undefined : model}
								/>
							}
							label="Subagent"
							title={modelLabel}
							value={`${modelLabel}${count > 1 ? ` ×${count}` : ""}`}
						/>
					);
				})}
			</SessionContextRow>
			<SessionContextRow
				emptyLabel="No files read"
				isEmpty={readFiles.length === 0}
				label="Read"
				stackFiles
			>
				{readFileGroups.map(({ extension, files }) => (
					<SessionFileTypeTag
						extension={extension}
						files={files}
						key={extension}
						label="Read"
					/>
				))}
			</SessionContextRow>
			<SessionContextRow
				emptyLabel="No files written"
				isEmpty={writtenFiles.length === 0}
				label="Wrote"
				stackFiles
			>
				{writtenFileGroups.map(({ extension, files }) => (
					<SessionFileTypeTag
						extension={extension}
						files={files}
						key={extension}
						label="Wrote"
					/>
				))}
			</SessionContextRow>
			<SessionContextRow
				emptyLabel="No files edited"
				isEmpty={editedFiles.length === 0}
				label="Edited"
				stackFiles
			>
				{editedFileGroups.map(({ extension, files }) => (
					<SessionFileTypeTag
						extension={extension}
						files={files}
						key={extension}
						label="Edited"
					/>
				))}
			</SessionContextRow>
			<SessionContextRow
				emptyLabel="No errors"
				isEmpty={context.errors.length === 0}
				label="Errors"
			>
				{context.errors.map((error) => (
					<SessionContextLucideTag
						key={`error:${error.label}`}
						Icon={CircleAlert}
						label="Error"
						tone="error"
						value={`${humanizeIdentifier(error.label)}${error.count > 1 ? ` ×${error.count}` : ""}`}
					/>
				))}
			</SessionContextRow>
		</section>
	);
}
