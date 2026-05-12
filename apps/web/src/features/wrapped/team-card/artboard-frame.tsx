import type { ReactNode } from "react";

export function WrappedTeamCardArtboardFrame(props: { children: ReactNode }) {
	const { children } = props;

	return (
		<div className="rudel-wrapped-team-card-scale-frame">
			<div className="rudel-wrapped-team-card-scale-transform">
				<div
					className="rudel-wrapped-team-card-artboard"
					data-wrapped-team-card-artboard=""
				>
					{children}
				</div>
			</div>
		</div>
	);
}
