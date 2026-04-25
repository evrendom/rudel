import type { ReactNode } from "react";
import { useState } from "react";
import { WrappedAuthFlow } from "./WrappedAuthFlow";
import {
	readWrappedGuestPreviewSnapshot,
	type WrappedGuestPreviewProfile,
} from "./wrapped-guest-preview";

export function WrappedGuestPage(props: {
	authFormCardScale?: number;
	authIntroCardScale?: number;
	debugControls?: ReactNode;
}) {
	const { authFormCardScale, authIntroCardScale, debugControls } = props;
	const [previewProfile] = useState<WrappedGuestPreviewProfile | null>(
		() => readWrappedGuestPreviewSnapshot()?.profile ?? null,
	);

	return (
		<WrappedAuthFlow
			authFormCardScale={authFormCardScale}
			authIntroCardScale={authIntroCardScale}
			debugControls={debugControls}
			previewProfile={previewProfile}
		/>
	);
}
