import { useState } from "react";
import { Building2Icon, Loader2Icon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageViewTrackingMount } from "@/features/analytics/tracking/PageViewTrackingMount";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { authClient } from "@/lib/auth-client";
import { appRoutes } from "@/app/routes";
import { Badge } from "@/app/ui/badge";
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
import { SettingsSectionIntro } from "@/features/settings/components/SettingsSectionIntro";
import { useOrganization } from "@/features/workspace/organization/useOrganization";

function slugify(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.slice(0, 48);
}

export function CreateWorkspaceSettingsSection() {
	const navigate = useNavigate();
	const { actions } = useOrganization();
	const { trackOrganizationAction } = useAnalyticsTracking({
		pageName: "organization_create",
	});
	const [name, setName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		const trimmedName = name.trim();
		const slug = slugify(trimmedName);

		if (!trimmedName || !slug) {
			return;
		}

		trackOrganizationAction({
			actionName: "create_organization",
			targetType: "organization",
			sourceComponent: "create_workspace_settings_section",
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
		<>
			<PageViewTrackingMount isLoading={false} hasData />
			<div className="px-4 lg:px-6">
				<SettingsSectionIntro
					title="Create workspace"
					description="Set up a new team space directly inside the redesign."
					action={<Badge variant="outline">Workspace</Badge>}
				/>
			</div>

			<div className="px-4 lg:px-6">
				<div className="max-w-xl">
					<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
						<CardHeader>
							<div className="flex items-center gap-3">
								<div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
									<Building2Icon />
								</div>
								<div className="flex flex-col gap-1">
									<CardTitle>Workspace identity</CardTitle>
									<CardDescription>
										The URL slug is generated automatically from the name.
									</CardDescription>
								</div>
							</div>
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

								<Card size="sm" className="bg-muted/20 shadow-none ring-1 ring-border/60">
									<CardContent className="text-sm text-muted-foreground">
										<span className="font-medium text-foreground">Slug preview:</span>{" "}
										{slugPreview ? `/${slugPreview}` : "Generated from the name"}
									</CardContent>
								</Card>

								{error ? (
									<p className="text-sm text-destructive">{error}</p>
								) : null}

								<Button
									type="submit"
									disabled={isCreating || name.trim().length === 0}
								>
									{isCreating ? (
										<Loader2Icon data-icon="inline-start" className="animate-spin" />
									) : null}
									{isCreating ? "Creating workspace…" : "Create workspace"}
								</Button>
							</form>
						</CardContent>
					</Card>
				</div>
			</div>
		</>
	);
}
