import { ArrowRight, ImagePlus } from "lucide-react";
import { type ChangeEvent, type ReactNode, useRef, useState } from "react";
import { WrappedPrimaryAction } from "./actions";
import { WrappedRouteStageShell } from "./route-stage-shell";
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
	backLabel?: string;
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
		backLabel = "Back to auth",
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
	const imageInputRef = useRef<HTMLInputElement | null>(null);
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

	const imageEditLabel = imageUrl
		? "Change profile picture"
		: "Add profile picture";
	const canContinue = isComplete && !isNameEditing;

	function handleOpenImagePicker() {
		imageInputRef.current?.click();
	}

	return (
		<WrappedRouteStageShell
			backLabel={backLabel}
			footer={
				<WrappedPrimaryAction
					kind="button"
					disabled={!canContinue}
					icon={<ArrowRight className="size-4" />}
					onClick={onContinue}
				>
					Continue
				</WrappedPrimaryAction>
			}
			footerDebugControls={debugControls}
			leadingControl={null}
			objectClassName="mymind-wrapped-entry-stage__object--auth-profile"
			onBack={onBack}
			progressStepId="card-profile"
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
							disablePerspective
							mediaOverlayContent={
								<>
									<button
										type="button"
										aria-label={imageEditLabel}
										className="mymind-wrapped-card-profile-step__image-edit"
										title={imageEditLabel}
										onClick={(event) => {
											event.stopPropagation();
											handleOpenImagePicker();
										}}
										onPointerDown={(event) => event.stopPropagation()}
									>
										<ImagePlus className="mymind-wrapped-card-profile-step__image-edit-icon" />
									</button>
									<input
										ref={imageInputRef}
										aria-label="Profile picture"
										type="file"
										accept="image/*"
										className="sr-only"
										onChange={handleImageUpload}
									/>
								</>
							}
							profile={previewProfile}
							size="profile"
						/>
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
