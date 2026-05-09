import { CheckCircle2, Circle, Loader2 } from "lucide-react";

interface Todo {
	content: string;
	status: "pending" | "in_progress" | "completed";
	activeForm: string;
}

interface TodoWriteContentProps {
	todos: Array<Todo>;
}

export function TodoWriteContent({ todos }: TodoWriteContentProps) {
	const completed = todos.filter((t) => t.status === "completed").length;
	const inProgress = todos.filter((t) => t.status === "in_progress").length;

	return (
		<div className="space-y-1">
			<div className="text-xs text-muted-foreground mb-1.5">
				{completed}/{todos.length} completed
				{inProgress > 0 && ` \u00b7 ${inProgress} in progress`}
			</div>
			<ul className="space-y-0.5">
				{todos.map((todo) => (
					<li key={todo.content} className="flex items-start gap-1.5 text-xs">
						<span className="flex-shrink-0 mt-0.5">
							{todo.status === "completed" ? (
								<CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
							) : todo.status === "in_progress" ? (
								<Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
							) : (
								<Circle className="h-3.5 w-3.5 text-muted-foreground" />
							)}
						</span>
						<span
							className={
								todo.status === "completed"
									? "text-muted-foreground line-through"
									: todo.status === "in_progress"
										? "text-foreground"
										: "text-muted-foreground"
							}
						>
							{todo.content}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export function parseTodoWriteInput(
	input: Record<string, unknown>,
): Array<Todo> | null {
	if (!input.todos || !Array.isArray(input.todos)) {
		return null;
	}

	return input.todos.filter(
		(todo): todo is Todo =>
			typeof todo === "object" &&
			todo !== null &&
			typeof todo.content === "string" &&
			typeof todo.status === "string" &&
			["pending", "in_progress", "completed"].includes(todo.status),
	);
}
