import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { DeleteUserDialog } from "../../components/admin/DeleteUserDialog";
import { AnalyticsCard } from "../../components/analytics/AnalyticsCard";
import { PageHeader } from "../../components/analytics/PageHeader";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { client } from "../../lib/orpc";

interface AdminUser {
	id: string;
	name: string;
	email: string;
	image: string | null;
	createdAt: string;
	organizationCount: number;
}

export function AdminPage() {
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	const { data, isLoading, refetch } = useQuery({
		queryKey: ["admin", "users", debouncedSearch],
		queryFn: () =>
			client.admin.listUsers({
				search: debouncedSearch || undefined,
				limit: 50,
				offset: 0,
			}),
	});

	const handleSearchKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			setDebouncedSearch(search);
		}
	};

	const handleDeleteClick = (user: AdminUser) => {
		setDeleteTarget(user);
		setDeleteDialogOpen(true);
	};

	const handleDeleted = () => {
		setDeleteDialogOpen(false);
		setDeleteTarget(null);
		refetch();
	};

	return (
		<div className="px-8 py-6">
			<PageHeader title="Admin" description="Manage platform users and data" />

			<AnalyticsCard>
				<div className="flex items-center gap-4 mb-6">
					<div className="relative flex-1">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
						<Input
							placeholder="Search by name or email..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							onKeyDown={handleSearchKeyDown}
							className="pl-9"
						/>
					</div>
					<Button variant="outline" onClick={() => setDebouncedSearch(search)}>
						Search
					</Button>
				</div>

				{isLoading ? (
					<div className="flex items-center justify-center py-12">
						<Loader2 className="h-6 w-6 animate-spin text-muted" />
					</div>
				) : (
					<>
						<div className="text-sm text-muted mb-4">
							{data?.total ?? 0} user{(data?.total ?? 0) !== 1 ? "s" : ""} found
						</div>

						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-border text-left">
										<th className="pb-3 pr-4 font-medium text-muted">Name</th>
										<th className="pb-3 pr-4 font-medium text-muted">Email</th>
										<th className="pb-3 pr-4 font-medium text-muted">
											Created
										</th>
										<th className="pb-3 pr-4 font-medium text-muted">Orgs</th>
										<th className="pb-3 font-medium text-muted">Actions</th>
									</tr>
								</thead>
								<tbody>
									{data?.users.map((user) => (
										<tr
											key={user.id}
											className="border-b border-border last:border-0"
										>
											<td className="py-3 pr-4 text-foreground">{user.name}</td>
											<td className="py-3 pr-4 text-foreground">
												{user.email}
											</td>
											<td className="py-3 pr-4 text-muted">
												{new Date(user.createdAt).toLocaleDateString()}
											</td>
											<td className="py-3 pr-4 text-muted">
												{user.organizationCount}
											</td>
											<td className="py-3">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => handleDeleteClick(user)}
													className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</td>
										</tr>
									))}
									{data?.users.length === 0 && (
										<tr>
											<td colSpan={5} className="py-8 text-center text-muted">
												No users found
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
					</>
				)}
			</AnalyticsCard>

			<DeleteUserDialog
				open={deleteDialogOpen}
				onOpenChange={setDeleteDialogOpen}
				user={deleteTarget}
				onDeleted={handleDeleted}
			/>
		</div>
	);
}
