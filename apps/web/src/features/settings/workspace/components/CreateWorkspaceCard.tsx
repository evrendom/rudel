import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@/app/ui/field";
import { Input } from "@/app/ui/input";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { authClient } from "@/lib/auth-client";

function slugify(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.slice(0, 48);
}

export function CreateWorkspaceCard({
	description = "Create a separate workspace for another team or client.",
	submitLabel = "Create workspace",
	title = "Create workspace",
}: {
	description?: string;
	submitLabel?: string;
	title?: string;
}) {
	const navigate = useNavigate();
	const { switchOrg } = useOrganization();
	const { trackOrganizationAction } = useAnalyticsTracking({
		pageName: "organization_create",
	});
	const [error, setError] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [name, setName] = useState("");

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		const trimmedName = name.trim();
		const slug = slugify(trimmedName);
		if (!trimmedName || !slug) {
			return;
		}

		trackOrganizationAction({
			actionName: "create_organization",
			sourceComponent: "create_workspace_card",
			targetId: slug,
			targetType: "organization",
		});
		setError(null);
		setIsCreating(true);

		const response = await authClient.organization.create({
			name: trimmedName,
			slug,
		});

		if (response.error) {
			setError(response.error.message ?? "Failed to create workspace");
			setIsCreating(false);
			return;
		}

		if (response.data) {
			await switchOrg(response.data.id);
			navigate("/dashboard/organization");
		}

		setIsCreating(false);
	}

	const slugPreview = slugify(name.trim());

	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void handleSubmit(event)}
				>
					<Field className="gap-2">
						<FieldLabel htmlFor="workspace-name">Workspace name</FieldLabel>
						<Input
							disabled={isCreating}
							id="workspace-name"
							onChange={(event) => setName(event.target.value)}
							placeholder="Farmerville team"
							value={name}
						/>
					</Field>
					<Field className="gap-2">
						<FieldLabel>Slug preview</FieldLabel>
						<div className="rounded-3xl border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
							{slugPreview ? `/${slugPreview}` : "Generated from the name"}
						</div>
						<FieldDescription>
							Lowercase letters, numbers, and hyphens only.
						</FieldDescription>
					</Field>
					<FieldError>{error}</FieldError>
					<Button
						disabled={isCreating || name.trim().length === 0}
						type="submit"
					>
						{isCreating ? "Creating workspace…" : submitLabel}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
