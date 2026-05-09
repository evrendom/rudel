import type { ReactNode } from "react";

export function WrappedTeamCardArtboardFrame(props: { children: ReactNode }) {
	const { children } = props;

	return (
		<div className="mymind-wrapped-team-card-scale-frame">
			<div className="mymind-wrapped-team-card-scale-transform">
				<div
					className="mymind-wrapped-team-card-artboard"
					data-wrapped-team-card-artboard=""
				>
					{children}
				</div>
			</div>
		</div>
	);
}
