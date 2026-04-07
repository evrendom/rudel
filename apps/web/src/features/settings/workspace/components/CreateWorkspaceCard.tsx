import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { Field, FieldLabel } from "@/app/ui/field";
import { Input } from "@/app/ui/input";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
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
	const { actions } = useOrganization();
	const { trackOrganizationAction } = useAnalyticsTracking({
		pageName: "organization_create",
	});
	const [name, setName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		const trimmedName = name.trim();
		const slug = slugify(trimmedName);

		if (!trimmedName || !slug) {
			return;
		}

		trackOrganizationAction({
			actionName: "create_organization",
			targetType: "organization",
			sourceComponent: "create_workspace_card",
			targetId: slug,
		});
		setIsCreating(true);
		setError(null);

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
			await actions.switchOrganization(response.data.id);
			navigate(appRoutes.settingsWorkspace());
		}

		setIsCreating(false);
	};

	const slugPreview = slugify(name.trim());

	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<Field className="gap-2">
						<FieldLabel htmlFor="workspace-name">Workspace name</FieldLabel>
						<Input
							id="workspace-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Farmerville team"
							disabled={isCreating}
						/>
					</Field>

					<div className="rounded-3xl border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
						<span className="font-medium text-foreground">Slug preview:</span>{" "}
						{slugPreview ? `/${slugPreview}` : "Generated from the name"}
					</div>

					{error ? <p className="text-sm text-destructive">{error}</p> : null}

					<Button
						type="submit"
						disabled={isCreating || name.trim().length === 0}
					>
						{isCreating ? "Creating workspace…" : submitLabel}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
