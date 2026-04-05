import { PlusIcon } from "lucide-react"
import { Link } from "react-router-dom"
import { appRoutes } from "@/app/routes"
import { buttonVariants } from "@/app/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card"

export function WorkspaceEmptyStateCard() {
	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle>No workspace selected</CardTitle>
				<CardDescription>
					Create a workspace to start inviting people and configuring
					organization settings in the redesign.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Link
					to={appRoutes.settingsCreateWorkspace()}
					className={buttonVariants({ size: "sm" })}
				>
					<PlusIcon data-icon="inline-start" />
					Create workspace
				</Link>
			</CardContent>
		</Card>
	)
}
