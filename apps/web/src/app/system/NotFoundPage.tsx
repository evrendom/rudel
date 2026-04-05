import { Link } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { buttonVariants } from "@/app/ui/button";

export function NotFoundPage() {
	return (
		<div className="flex min-h-screen items-center justify-center px-6 py-12">
			<div className="flex max-w-md flex-col items-center gap-4 text-center">
				<div className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
					404
				</div>
				<h1 className="text-3xl font-semibold tracking-tight text-foreground">
					Page not found
				</h1>
				<p className="text-sm leading-6 text-muted-foreground">
					This route is no longer part of the reduced redesign surface.
				</p>
				<Link to={appRoutes.dashboard()} className={buttonVariants()}>
					Go to dashboard
				</Link>
			</div>
		</div>
	);
}
