import { useState } from "react"
import {
	Building2Icon,
	CheckIcon,
	PencilIcon,
	XIcon,
} from "lucide-react"
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/app/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card"
import { Field, FieldLabel } from "@/app/ui/field"
import { Input } from "@/app/ui/input"

export function WorkspaceIdentityCard({
	organization,
	canManage,
	onInvalidate,
}: {
	organization: { id: string; name: string; slug: string }
	canManage: boolean
	onInvalidate: () => void
}) {
	const { trackOrganizationAction } = useAnalyticsTracking({
		pageName: "organization",
	})
	const [isEditingName, setIsEditingName] = useState(false)
	const [editedName, setEditedName] = useState("")
	const [isSavingName, setIsSavingName] = useState(false)
	const [renameError, setRenameError] = useState<string | null>(null)

	const startEditing = () => {
		trackOrganizationAction({
			actionName: "start_rename_organization",
			targetType: "organization",
			sourceComponent: "workspace_settings_section",
			targetId: organization.id,
		})
		setEditedName(organization.name)
		setRenameError(null)
		setIsEditingName(true)
	}

	const cancelEditing = () => {
		trackOrganizationAction({
			actionName: "cancel_rename_organization",
			targetType: "organization",
			sourceComponent: "workspace_settings_section",
			targetId: organization.id,
		})
		setIsEditingName(false)
		setRenameError(null)
	}

	const saveName = async () => {
		const trimmedName = editedName.trim()
		if (!trimmedName) {
			return
		}

		if (trimmedName === organization.name) {
			setIsEditingName(false)
			return
		}

		trackOrganizationAction({
			actionName: "rename_organization",
			targetType: "organization",
			sourceComponent: "workspace_settings_section",
			targetId: organization.id,
		})
		setIsSavingName(true)
		setRenameError(null)

		const response = await authClient.organization.update({
			data: { name: trimmedName },
			organizationId: organization.id,
		})

		if (response.error) {
			setRenameError(response.error.message ?? "Failed to rename workspace")
			setIsSavingName(false)
			return
		}

		onInvalidate()
		setIsEditingName(false)
		setIsSavingName(false)
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
								id="workspace-name"
								value={editedName}
								onChange={(event) => setEditedName(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										void saveName()
									}
									if (event.key === "Escape") {
										cancelEditing()
									}
								}}
								disabled={isSavingName}
								autoFocus
							/>
							<div className="flex gap-2">
								<Button
									type="button"
									size="sm"
									onClick={() => void saveName()}
									disabled={isSavingName || editedName.trim().length === 0}
								>
									<CheckIcon data-icon="inline-start" />
									{isSavingName ? "Saving…" : "Save"}
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={cancelEditing}
									disabled={isSavingName}
								>
									<XIcon data-icon="inline-start" />
									Cancel
								</Button>
							</div>
						</div>
						{renameError ? (
							<p className="text-sm text-destructive">{renameError}</p>
						) : null}
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
								type="button"
								variant="outline"
								size="sm"
								onClick={startEditing}
							>
								<PencilIcon data-icon="inline-start" />
								Rename
							</Button>
						) : null}
					</div>
				)}
			</CardContent>
		</Card>
	)
}
