import { Building2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnalyticsCard } from "../../components/analytics/AnalyticsCard";
import { PageHeader } from "../../components/analytics/PageHeader";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useOrganization } from "../../contexts/OrganizationContext";
import { useUiControlTracking } from "../../hooks/useDashboardAnalytics";
import { useTrackDashboardView } from "../../hooks/useTrackDashboardView";
import { authClient } from "../../lib/auth-client";

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.slice(0, 48);
}

export function CreateOrgPage() {
	const navigate = useNavigate();
	const { switchOrg } = useOrganization();
	const { trackUiControl } = useUiControlTracking();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugManual, setSlugManual] = useState(false);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useTrackDashboardView({
		isLoading: false,
		hasData: true,
	});

	const handleNameChange = (value: string) => {
		setName(value);
		if (!slugManual) {
			setSlug(slugify(value));
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim() || !slug.trim()) return;
		trackUiControl({
			controlName: "organization_create_submit",
			controlType: "button",
			interactionType: "submit",
			value: slug.trim(),
		});

		setCreating(true);
		setError(null);

		const res = await authClient.organization.create({
			name: name.trim(),
			slug: slug.trim(),
		});

		if (res.error) {
			setError(res.error.message ?? "Failed to create organization");
			setCreating(false);
			return;
		}

		if (res.data) {
			await switchOrg(res.data.id);
			navigate("/dashboard");
		}
		setCreating(false);
	};

	return (
		<div className="px-8 py-6">
			<PageHeader
				title="Create Organization"
				description="Set up a new organization for your team"
			/>

			<div className="max-w-lg">
				<AnalyticsCard>
					<div className="flex items-center gap-3 mb-6">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-hover">
							<Building2 className="h-5 w-5 text-accent" />
						</div>
						<p className="text-sm text-muted">
							Organizations let you share analytics with your team.
						</p>
					</div>

					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<div>
							<Label htmlFor="org-name">Organization name</Label>
							<Input
								id="org-name"
								placeholder="My Team"
								value={name}
								onChange={(e) => handleNameChange(e.target.value)}
							/>
						</div>

						<div>
							<Label htmlFor="org-slug">URL slug</Label>
							<Input
								id="org-slug"
								placeholder="my-team"
								value={slug}
								onChange={(e) => {
									setSlug(e.target.value);
									setSlugManual(true);
								}}
							/>
							<p className="mt-1 text-xs text-muted">
								Used in URLs. Lowercase letters, numbers, and hyphens only.
							</p>
						</div>

						{error && <p className="text-sm text-red-500">{error}</p>}

						<Button
							type="submit"
							disabled={creating || !name.trim() || !slug.trim()}
						>
							{creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
							Create Organization
						</Button>
					</form>
				</AnalyticsCard>
			</div>
		</div>
	);
}
