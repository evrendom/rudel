import { ArrowRight, ImagePlus, RotateCcw } from "lucide-react";
import { type ChangeEvent, type ReactNode, useState } from "react";
import { Button } from "@/app/ui/button";
import { WrappedPrimaryAction } from "./actions";
import {
	WrappedDebugControlStack,
	WrappedRouteStageShell,
} from "./route-stage-shell";
import { WrappedGuestPreviewCard } from "./WrappedGuestPreviewCard";
import type { WrappedGuestPreviewProfile } from "./wrapped-guest-preview";

const WRAPPED_CARD_PROFILE_TITLE = (
	<span className="mymind-wrapped-auth-intro-title">
		<span className="mymind-wrapped-auth-intro-title__line">
			Make the card yours
		</span>
	</span>
);

interface WrappedCardProfileStepProps {
	debugControls?: ReactNode;
	displayName: string;
	imageUrl: string | null;
	isComplete: boolean;
	onBack: () => void;
	onContinue: () => void;
	onDisplayNameChange: (value: string) => void;
	onImageChange: (imageUrl: string | null) => void;
	previewProfile: WrappedGuestPreviewProfile | null;
}

export function WrappedCardProfileStep(props: WrappedCardProfileStepProps) {
	const {
		debugControls,
		displayName,
		imageUrl,
		isComplete,
		onBack,
		onContinue,
		onDisplayNameChange,
		onImageChange,
		previewProfile,
	} = props;
	const [isNameEditing, setIsNameEditing] = useState(true);

	function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = "";

		if (!file) {
			return;
		}

		const reader = new FileReader();
		reader.addEventListener("load", () => {
			if (typeof reader.result === "string") {
				onImageChange(reader.result);
			}
		});
		reader.readAsDataURL(file);
	}

	function handleSaveDisplayName() {
		if (!displayName.trim()) {
			return;
		}

		setIsNameEditing(false);
	}

	return (
		<WrappedRouteStageShell
			backLabel="Back to auth"
			objectClassName="mymind-wrapped-entry-stage__object--auth-profile"
			onBack={onBack}
			stage={
				<div className="mymind-wrapped-auth-panel mymind-wrapped-auth-panel--profile">
					<div className="mymind-wrapped-card-profile-step__card">
						<WrappedGuestPreviewCard
							appearance="unknown"
							editableDisplayName={
								isNameEditing
									? {
											autoSelect: true,
											onChange: onDisplayNameChange,
											onSave: handleSaveDisplayName,
											placeholder: "Your name",
											value: displayName,
										}
									: undefined
							}
							profile={previewProfile}
							size="profile"
						/>
					</div>
					<div className="mymind-wrapped-card-profile-step__body">
						<div className="mymind-wrapped-auth-form mymind-wrapped-card-profile-step__form">
							<div className="mymind-wrapped-card-profile-step__image-row">
								<label className="mymind-wrapped-card-profile-step__image-action">
									<ImagePlus className="mymind-wrapped-card-profile-step__image-icon" />
									<span>{imageUrl ? "Change photo" : "Add photo"}</span>
									<input
										aria-label="Profile picture"
										type="file"
										accept="image/*"
										className="sr-only"
										onChange={handleImageUpload}
									/>
								</label>
								{imageUrl ? (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="mymind-wrapped-card-profile-step__reset"
										onClick={() => onImageChange(null)}
									>
										<RotateCcw className="mymind-wrapped-card-profile-step__reset-icon" />
										Remove
									</Button>
								) : null}
							</div>
						</div>
					</div>
					<div className="mymind-wrapped-auth-panel__footer">
						{debugControls ? (
							<WrappedDebugControlStack>
								{debugControls}
							</WrappedDebugControlStack>
						) : null}
						<WrappedPrimaryAction
							kind="button"
							disabled={!isComplete}
							icon={<ArrowRight className="size-4" />}
							onClick={onContinue}
						>
							Continue
						</WrappedPrimaryAction>
					</div>
				</div>
			}
			stageClassName="mymind-wrapped-entry-stage--auth"
			title={WRAPPED_CARD_PROFILE_TITLE}
			titleClassName="mymind-wrapped-entry-stage__headline--auth-intro"
			useReferenceTopChrome
		/>
	);
}
