import { Building2Icon, CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { Field, FieldError, FieldLabel } from "@/app/ui/field";
import { Input } from "@/app/ui/input";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { authClient } from "@/lib/auth-client";

export function WorkspaceIdentityCard({
	canManage,
	onInvalidate,
	organization,
}: {
	canManage: boolean;
	onInvalidate: () => void;
	organization: { id: string; name: string; slug: string };
}) {
	const { trackOrganizationAction } = useAnalyticsTracking({
		organizationId: organization.id,
		pageName: "organization",
	});
	const [editedName, setEditedName] = useState("");
	const [isEditingName, setIsEditingName] = useState(false);
	const [isSavingName, setIsSavingName] = useState(false);
	const [renameError, setRenameError] = useState<string | null>(null);

	function startEditing() {
		trackOrganizationAction({
			actionName: "start_rename_organization",
			sourceComponent: "workspace_identity_card",
			targetId: organization.id,
			targetType: "organization",
		});
		setEditedName(organization.name);
		setRenameError(null);
		setIsEditingName(true);
	}

	function cancelEditing() {
		trackOrganizationAction({
			actionName: "cancel_rename_organization",
			sourceComponent: "workspace_identity_card",
			targetId: organization.id,
			targetType: "organization",
		});
		setIsEditingName(false);
		setRenameError(null);
	}

	async function saveName() {
		const trimmedName = editedName.trim();
		if (!trimmedName) {
			return;
		}

		if (trimmedName === organization.name) {
			setIsEditingName(false);
			return;
		}

		trackOrganizationAction({
			actionName: "rename_organization",
			sourceComponent: "workspace_identity_card",
			targetId: organization.id,
			targetType: "organization",
		});
		setIsSavingName(true);
		setRenameError(null);

		const response = await authClient.organization.update({
			data: { name: trimmedName },
			organizationId: organization.id,
		});

		if (response.error) {
			setRenameError(response.error.message ?? "Failed to rename workspace");
			setIsSavingName(false);
			return;
		}

		onInvalidate();
		setIsEditingName(false);
		setIsSavingName(false);
	}

	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<div className="flex items-start gap-3">
					<div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
						<Building2Icon />
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-1">
						<CardTitle>Workspace identity</CardTitle>
						<CardDescription>
							Rename the active workspace and review its slug.
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{isEditingName ? (
					<Field className="gap-2">
						<FieldLabel htmlFor="workspace-name">Workspace name</FieldLabel>
						<div className="flex flex-col gap-2 sm:flex-row">
							<Input
								autoFocus
								disabled={isSavingName}
								id="workspace-name"
								onChange={(event) => setEditedName(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										void saveName();
									}

									if (event.key === "Escape") {
										cancelEditing();
									}
								}}
								value={editedName}
							/>
							<div className="flex gap-2">
								<Button
									disabled={isSavingName || editedName.trim().length === 0}
									onClick={() => void saveName()}
									size="sm"
									type="button"
								>
									<CheckIcon data-icon="inline-start" />
									{isSavingName ? "Saving…" : "Save"}
								</Button>
								<Button
									disabled={isSavingName}
									onClick={cancelEditing}
									size="sm"
									type="button"
									variant="outline"
								>
									<XIcon data-icon="inline-start" />
									Cancel
								</Button>
							</div>
						</div>
						<FieldError>{renameError}</FieldError>
					</Field>
				) : (
					<div className="flex items-start justify-between gap-3">
						<div className="flex min-w-0 flex-col gap-1">
							<span className="truncate text-lg font-semibold text-foreground">
								{organization.name}
							</span>
							<span className="text-sm text-muted-foreground">
								/{organization.slug}
							</span>
						</div>
						{canManage ? (
							<Button
								onClick={startEditing}
								size="sm"
								type="button"
								variant="outline"
							>
								<PencilIcon data-icon="inline-start" />
								Rename
							</Button>
						) : null}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
