import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { DeleteUserDialog } from "../../components/admin/DeleteUserDialog";
import { AnalyticsCard } from "../../components/analytics/AnalyticsCard";
import { PageHeader } from "../../components/analytics/PageHeader";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../../components/ui/table";
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
				<div className="mb-6 flex items-center gap-4">
					<div className="relative flex-1">
						<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
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
						<div className="mb-4 text-sm text-muted">
							{data?.total ?? 0} user{(data?.total ?? 0) !== 1 ? "s" : ""} found
						</div>

						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Email</TableHead>
									<TableHead>Created</TableHead>
									<TableHead>Orgs</TableHead>
									<TableHead>Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data?.users.map((user) => (
									<TableRow key={user.id}>
										<TableCell className="font-medium text-foreground">
											{user.name}
										</TableCell>
										<TableCell>{user.email}</TableCell>
										<TableCell className="text-muted-foreground">
											{new Date(user.createdAt).toLocaleDateString()}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{user.organizationCount}
										</TableCell>
										<TableCell>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleDeleteClick(user)}
												className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</TableCell>
									</TableRow>
								))}
								{data?.users.length === 0 && (
									<TableRow>
										<TableCell
											colSpan={5}
											className="py-8 text-center text-muted-foreground"
										>
											No users found
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
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
