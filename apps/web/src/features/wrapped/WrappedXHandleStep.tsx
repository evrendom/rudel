import { ArrowRight, AtSign } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/app/ui/button";
import { Input } from "@/app/ui/input";
import {
	WrappedDebugControlStack,
	WrappedRouteStageShell,
} from "./route-stage-shell";
import { WrappedGuestPreviewCard } from "./WrappedGuestPreviewCard";
import type { WrappedGuestPreviewProfile } from "./wrapped-guest-preview";

const WRAPPED_X_HANDLE_TITLE = (
	<span className="rudel-wrapped-auth-intro-title">
		<span className="rudel-wrapped-auth-intro-title__line">
			Drop in your X handle
		</span>
		<span className="rudel-wrapped-auth-intro-title__line">
			We&apos;ll tune the card first
		</span>
	</span>
);

interface WrappedXHandleStepProps {
	debugControls?: ReactNode;
	handleValue: string;
	isHandleValid: boolean;
	onContinue: () => void;
	onHandleChange: (value: string) => void;
	previewProfile: WrappedGuestPreviewProfile | null;
}

export function WrappedXHandleStep(props: WrappedXHandleStepProps) {
	const {
		debugControls,
		handleValue,
		isHandleValid,
		onContinue,
		onHandleChange,
		previewProfile,
	} = props;

	return (
		<WrappedRouteStageShell
			description="This only shapes the preview card before auth. If live profile lookup is configured, we will enrich it in the background once you continue."
			objectClassName="rudel-wrapped-entry-stage__object--auth-intro"
			stage={
				<div className="rudel-wrapped-auth-panel rudel-wrapped-auth-panel--intro">
					<WrappedGuestPreviewCard profile={previewProfile} />
					<p className="rudel-wrapped-x-handle-step__debug-comment">
						DEBUG: To be continued. This X-card preview was scrapped because of
						time constraints.
					</p>
					<div className="rudel-wrapped-auth-panel__body">
						<div className="rudel-wrapped-auth-form">
							<div className="rudel-wrapped-auth-form__field">
								<label
									htmlFor="wrapped-x-handle"
									className="rudel-wrapped-auth-form__label"
								>
									X handle
								</label>
								<div className="rudel-wrapped-auth-form__email-row">
									<Input
										aria-label="X handle"
										id="wrapped-x-handle"
										type="text"
										autoCapitalize="none"
										autoComplete="off"
										autoCorrect="off"
										inputMode="text"
										placeholder="@username"
										value={handleValue}
										onChange={(event) => onHandleChange(event.target.value)}
										className="rudel-wrapped-auth-form__input rudel-wrapped-auth-form__email-input h-11"
									/>
									{isHandleValid ? (
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="rudel-wrapped-auth-form__email-button"
											onClick={onContinue}
										>
											Continue
										</Button>
									) : null}
								</div>
							</div>
						</div>
						<p className="rudel-wrapped-x-handle-step__hint">
							<AtSign className="rudel-wrapped-x-handle-step__hint-icon" />
							Public profile only. No ownership check on this step.
						</p>
					</div>
					<div className="rudel-wrapped-auth-panel__footer">
						{debugControls ? (
							<WrappedDebugControlStack>
								{debugControls}
							</WrappedDebugControlStack>
						) : null}
						<Button
							type="button"
							className="rudel-wrapped-entry-action rudel-wrapped-x-handle-step__action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold"
							onClick={onContinue}
							disabled={!isHandleValid}
						>
							Use this handle
							<ArrowRight className="rudel-wrapped-x-handle-step__action-icon" />
						</Button>
					</div>
				</div>
			}
			stageClassName="rudel-wrapped-entry-stage--auth"
			title={WRAPPED_X_HANDLE_TITLE}
			titleClassName="rudel-wrapped-entry-stage__headline--auth-intro"
		/>
	);
}
