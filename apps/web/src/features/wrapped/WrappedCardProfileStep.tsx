import {
	ArrowRight,
	Download,
	ImagePlus,
	RotateCcw,
	Share2,
} from "lucide-react";
import { type ChangeEvent, type ReactNode, useRef, useState } from "react";
import { Button } from "@/app/ui/button";
import { Input } from "@/app/ui/input";
import { WrappedPrimaryAction } from "./actions";
import {
	WrappedDebugControlStack,
	WrappedRouteStageShell,
} from "./route-stage-shell";
import { createWrappedImageShareActions } from "./share-image";
import {
	WrappedGuestPreviewCard,
	WrappedGuestShareImagePreview,
} from "./WrappedGuestPreviewCard";
import type { WrappedGuestPreviewProfile } from "./wrapped-guest-preview";

const WRAPPED_CARD_PROFILE_TITLE = (
	<span className="mymind-wrapped-auth-intro-title">
		<span className="mymind-wrapped-auth-intro-title__line">
			Make the card yours
		</span>
	</span>
);
const WRAPPED_PROFILE_SHARE_IMAGE_FILE_NAME = "rudel-wrapped-card.png";
const WRAPPED_PROFILE_SHARE_IMAGE_CAPTURE_OPTIONS = {
	padding: 0,
	pixelRatio: 4,
};

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
	const sharePostRef = useRef<HTMLDivElement>(null);
	const [pendingShareAction, setPendingShareAction] = useState<
		"download" | "share" | null
	>(null);
	const shareDisplayName =
		displayName.trim() || previewProfile?.displayName.trim() || "Your";
	const shareActions = createWrappedImageShareActions({
		captureOptions: WRAPPED_PROFILE_SHARE_IMAGE_CAPTURE_OPTIONS,
		fileName: WRAPPED_PROFILE_SHARE_IMAGE_FILE_NAME,
		imageRef: sharePostRef,
		messages: {
			captureError: "Could not prepare the 4K card image.",
			copyFallbackSuccess:
				"Card copied. Paste it into the app you want to share to.",
			downloadSuccess: "4K card downloaded",
			missingElementError: "Could not find the card image to share.",
			shareDownloadSuccess:
				"4K card downloaded. Share the PNG from your downloads.",
		},
		shareText: `${shareDisplayName}'s Rudel card, made with rudel.ai.`,
		shareTitle: `${shareDisplayName}'s Rudel card`,
		shareUrlLabel: "rudel.ai/wrapped",
	});
	const isShareActionPending = pendingShareAction !== null;

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

	async function runProfileShareAction(
		action: "download" | "share",
		handler: () => Promise<void>,
	) {
		if (isShareActionPending) {
			return;
		}

		setPendingShareAction(action);
		try {
			await handler();
		} finally {
			setPendingShareAction(null);
		}
	}

	return (
		<WrappedRouteStageShell
			backLabel="Back to auth"
			objectClassName="mymind-wrapped-entry-stage__object--auth-profile"
			onBack={onBack}
			stage={
				<div className="mymind-wrapped-auth-panel mymind-wrapped-auth-panel--profile">
					<div className="mymind-wrapped-card-profile-step__card">
						<WrappedGuestPreviewCard profile={previewProfile} size="profile" />
					</div>
					<div className="mymind-wrapped-card-profile-step__body">
						<div className="mymind-wrapped-auth-form mymind-wrapped-card-profile-step__form">
							<div className="mymind-wrapped-auth-form__field">
								<label
									htmlFor="wrapped-profile-name"
									className="mymind-wrapped-auth-form__label"
								>
									Name on card
								</label>
								<Input
									aria-label="Name on card"
									autoComplete="name"
									id="wrapped-profile-name"
									placeholder="Your name"
									value={displayName}
									onChange={(event) =>
										onDisplayNameChange(event.currentTarget.value)
									}
									className="mymind-wrapped-auth-form__input"
								/>
							</div>

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
							<fieldset
								aria-label="Card image export actions"
								className="mymind-wrapped-card-profile-step__export-row"
							>
								<Button
									type="button"
									variant="outline"
									size="lg"
									disabled={!isComplete || isShareActionPending}
									className="mymind-wrapped-card-profile-step__export-action"
									onClick={() =>
										void runProfileShareAction(
											"share",
											shareActions.handleShareImage,
										)
									}
								>
									<Share2 className="size-4" />
									{pendingShareAction === "share" ? "Preparing" : "Share card"}
								</Button>
								<Button
									type="button"
									variant="outline"
									size="lg"
									disabled={!isComplete || isShareActionPending}
									className="mymind-wrapped-card-profile-step__export-action"
									onClick={() =>
										void runProfileShareAction(
											"download",
											shareActions.handleDownloadImage,
										)
									}
								>
									<Download className="size-4" />
									{pendingShareAction === "download" ? "Preparing" : "Download"}
								</Button>
							</fieldset>
						</div>
					</div>
					<div
						aria-hidden="true"
						className="mymind-wrapped-card-profile-step__export-source"
					>
						<WrappedGuestShareImagePreview
							profile={previewProfile}
							sharePostRef={sharePostRef}
						/>
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
