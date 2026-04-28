import type { ReactNode } from "react";
import { useState } from "react";
import { WrappedAuthFlow } from "./WrappedAuthFlow";
import type { WrappedAuthFormCardYValues } from "./wrapped-auth-card-position";
import {
	readWrappedGuestPreviewSnapshot,
	type WrappedGuestPreviewProfile,
} from "./wrapped-guest-preview";

export function WrappedGuestPage(props: {
	authFormCardScale?: number;
	authFormCardYValues?: WrappedAuthFormCardYValues;
	authIntroCardScale?: number;
	debugControls?: ReactNode;
}) {
	const {
		authFormCardYValues,
		authFormCardScale,
		authIntroCardScale,
		debugControls,
	} = props;
	const [previewProfile] = useState<WrappedGuestPreviewProfile | null>(
		() => readWrappedGuestPreviewSnapshot()?.profile ?? null,
	);

	return (
		<WrappedAuthFlow
			authFormCardYValues={authFormCardYValues}
			authFormCardScale={authFormCardScale}
			authIntroCardScale={authIntroCardScale}
			debugControls={debugControls}
			previewProfile={previewProfile}
		/>
	);
}
