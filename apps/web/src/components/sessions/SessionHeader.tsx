import {
	Check,
	Clock,
	Copy,
	DollarSign,
	FolderOpen,
	GitBranch,
	Timer,
	User,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { calculateCost } from "@/lib/format";
import { formatRelativeTime } from "@/lib/time-utils";

interface SessionHeaderProps {
	session: {
		session_id: string;
		project_path: string;
		repository: string | null;
		session_date: string;
		user_id: string;
		skills: Array<string>;
		slash_commands: Array<string>;
		subagents: Record<string, string>;
		git_branch: string | null;
		model_used?: string;
		duration_min?: number;
		total_interactions?: number;
		input_tokens: number;
		output_tokens: number;
		success_score?: number;
		session_archetype?: string;
	};
}

const archetypeStyles: Record<
	string,
	{ bg: string; text: string; label: string }
> = {
	quick_win: { bg: "bg-green-100", text: "text-green-800", label: "Quick Win" },
	deep_work: { bg: "bg-blue-100", text: "text-blue-800", label: "Deep Work" },
	struggle: { bg: "bg-red-100", text: "text-red-800", label: "Struggle" },
	exploration: {
		bg: "bg-purple-100",
		text: "text-purple-800",
		label: "Exploration",
	},
	abandoned: { bg: "bg-gray-100", text: "text-gray-600", label: "Abandoned" },
	standard: {
		bg: "bg-secondary",
		text: "text-secondary-foreground",
		label: "Standard",
	},
};

export function SessionHeader({ session }: SessionHeaderProps) {
	const [copied, setCopied] = useState(false);

	const uniqueSkills = [...new Set(session.skills)];
	const uniqueCommands = [...new Set(session.slash_commands)];
	const uniqueAgents = [...new Set(Object.keys(session.subagents))];

	function handleCopy() {
		navigator.clipboard.writeText(session.session_id);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	const cost = calculateCost(
		session.input_tokens,
		session.output_tokens,
		session.model_used,
	);

	return (
		<div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
			<div className="px-4 py-2 space-y-1.5">
				{/* Session ID + archetype */}
				<div className="flex items-center gap-2">
					<h1 className="text-base font-semibold truncate font-mono">
						{session.session_id}
					</h1>
					<Button
						variant="ghost"
						size="sm"
						className="h-6 w-6 p-0"
						onClick={handleCopy}
					>
						{copied ? (
							<Check className="h-3.5 w-3.5 text-green-500" />
						) : (
							<Copy className="h-3.5 w-3.5 text-muted-foreground" />
						)}
					</Button>
					{session.session_archetype &&
						(() => {
							const style =
								archetypeStyles[session.session_archetype] ??
								archetypeStyles.standard;
							return (
								<span
									className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${style.bg} ${style.text}`}
								>
									{style.label}
								</span>
							);
						})()}
				</div>

				{/* Metadata row */}
				<div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
					{session.repository && (
						<div className="flex items-center gap-1">
							<GitBranch className="h-4 w-4" />
							<span
								className="truncate max-w-[200px]"
								title={session.repository}
							>
								{session.repository}
							</span>
						</div>
					)}
					{session.git_branch && (
						<div className="flex items-center gap-1">
							<GitBranch className="h-4 w-4" />
							<span className="truncate max-w-[200px]">
								{session.git_branch}
							</span>
						</div>
					)}
					<div className="flex items-center gap-1">
						<FolderOpen className="h-4 w-4" />
						<span
							className="truncate max-w-[300px]"
							title={session.project_path}
						>
							{session.project_path}
						</span>
					</div>
					<div className="flex items-center gap-1">
						<Clock className="h-4 w-4" />
						<span>{formatRelativeTime(session.session_date)}</span>
					</div>
					<div className="flex items-center gap-1">
						<User className="h-4 w-4" />
						<span>{session.user_id.slice(0, 8)}...</span>
					</div>
					{session.duration_min !== undefined && (
						<div className="flex items-center gap-1">
							<Timer className="h-4 w-4" />
							<span>{session.duration_min} min</span>
						</div>
					)}
					<div className="flex items-center gap-1">
						<DollarSign className="h-4 w-4" />
						<span>${cost.toFixed(4)}</span>
					</div>
					{session.model_used && (
						<span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
							{session.model_used}
						</span>
					)}
					{session.success_score !== undefined && (
						<span
							className={`text-xs font-semibold ${
								session.success_score >= 70
									? "text-green-600"
									: session.success_score >= 40
										? "text-yellow-600"
										: "text-red-600"
							}`}
						>
							Score: {session.success_score.toFixed(0)}/100
							<InfoTooltip text="Session quality score (0–100): earns points for a git commit (+20), high output ratio (+15), and skills used (+5 each, max 3); loses points for errors (−2 each) and abandoned sessions." />
						</span>
					)}
				</div>

				{/* Primitives row */}
				{(uniqueSkills.length > 0 ||
					uniqueCommands.length > 0 ||
					uniqueAgents.length > 0) && (
					<div className="flex flex-wrap gap-1">
						{uniqueSkills.map((skill) => (
							<Badge
								key={`skill-${skill}`}
								variant="secondary"
								className="text-xs"
							>
								skill:{skill}
							</Badge>
						))}
						{uniqueCommands.map((cmd) => (
							<Badge key={`cmd-${cmd}`} variant="outline" className="text-xs">
								/{cmd}
							</Badge>
						))}
						{uniqueAgents.map((type) => (
							<Badge
								key={`agent-${type}`}
								variant="default"
								className="text-xs"
							>
								agent:{type}
							</Badge>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
