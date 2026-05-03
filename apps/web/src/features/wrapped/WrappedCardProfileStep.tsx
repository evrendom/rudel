import {
	AVATAR_ACCEPTED_MIME_TYPES,
	type AvatarMimeType,
} from "@rudel/api-routes";
import { ArrowRight, ImagePlus } from "lucide-react";
import { type ChangeEvent, type ReactNode, useRef, useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
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

// Allow file picker to be permissive (accept="image/*"), then enforce the
// real allowlist after the user selects a file.
const PRE_RESIZE_MAX_BYTES = 5 * 1024 * 1024;
const RESIZE_LONG_EDGE_PX = 768;
const ENCODED_TYPE: AvatarMimeType = "image/webp";
const ENCODED_FALLBACK_TYPE: AvatarMimeType = "image/jpeg";

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
	onUploadingChange?: (isUploading: boolean) => void;
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
		onUploadingChange,
		previewProfile,
	} = props;
	const imageInputRef = useRef<HTMLInputElement | null>(null);
	const [isNameEditing, setIsNameEditing] = useState(true);
	const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
	const previewBlobUrlRef = useRef<string | null>(null);
	previewBlobUrlRef.current = previewBlobUrl;
	const [isUploading, setIsUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);

	// Revoke any in-flight preview blob URL when the component unmounts so we
	// don't leak object URLs if the user navigates away mid-upload.
	useMountEffect(() => () => {
		if (previewBlobUrlRef.current) {
			URL.revokeObjectURL(previewBlobUrlRef.current);
		}
	});

	function setUploadingState(next: boolean) {
		setIsUploading(next);
		onUploadingChange?.(next);
	}

	async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = "";

		if (!file) {
			return;
		}

		if (isUploading) {
			return;
		}

		if (
			!(AVATAR_ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)
		) {
			setUploadError("Pick a PNG, JPEG, or WEBP image for your card.");
			return;
		}

		if (file.size > PRE_RESIZE_MAX_BYTES) {
			setUploadError("Image is too large. Maximum size is 5 MB.");
			return;
		}

		setUploadError(null);
		setUploadingState(true);

		try {
			const resized = await resizeImage(file);
			const localPreviewUrl = URL.createObjectURL(resized);
			if (previewBlobUrl) {
				URL.revokeObjectURL(previewBlobUrl);
			}
			setPreviewBlobUrl(localPreviewUrl);

			const formData = new FormData();
			formData.append("file", resized, "avatar.webp");
			const response = await fetch("/api/profile/avatar", {
				method: "POST",
				body: formData,
				credentials: "include",
			});

			if (!response.ok) {
				throw new Error(`Avatar upload failed: ${response.status}`);
			}

			const payload = (await response.json()) as {
				user?: { image?: string | null };
			};
			const persistedImageUrl = payload.user?.image ?? null;

			URL.revokeObjectURL(localPreviewUrl);
			setPreviewBlobUrl(null);
			onImageChange(persistedImageUrl);
		} catch {
			if (previewBlobUrl) {
				URL.revokeObjectURL(previewBlobUrl);
			}
			setPreviewBlobUrl(null);
			setUploadError("We could not upload your image. Try again.");
		} finally {
			setUploadingState(false);
		}
	}

	function handleSaveDisplayName() {
		if (!displayName.trim()) {
			return;
		}

		setIsNameEditing(false);
	}

	function handleEditDisplayName() {
		setIsNameEditing(true);
	}

	const renderedImageUrl = previewBlobUrl ?? imageUrl;
	const renderedPreviewProfile: WrappedGuestPreviewProfile | null =
		previewProfile && previewBlobUrl
			? { ...previewProfile, imageUrl: previewBlobUrl }
			: previewProfile;
	const imageEditLabel = renderedImageUrl
		? "Change profile picture"
		: "Add profile picture";
	const canContinue = isComplete && !isNameEditing && !isUploading;

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
										name="wrapped-profile-picture"
										accept="image/*"
										className="sr-only"
										onChange={handleImageUpload}
									/>
								</>
							}
							onDisplayNameEditStart={handleEditDisplayName}
							profile={renderedPreviewProfile}
							size="profile"
						/>
						{uploadError ? (
							<p
								role="alert"
								className="mymind-wrapped-card-profile-step__error"
							>
								{uploadError}
							</p>
						) : null}
					</div>
				</div>
			}
			stageClassName="mymind-wrapped-entry-stage--auth mymind-wrapped-entry-stage--auth-profile"
			title={WRAPPED_CARD_PROFILE_TITLE}
			titleClassName="mymind-wrapped-entry-stage__headline--auth-intro"
			useReferenceTopChrome
		/>
	);
}

async function resizeImage(file: File): Promise<Blob> {
	const bitmap = await loadImageBitmap(file);
	const longEdge = Math.max(bitmap.width, bitmap.height);
	const scale =
		longEdge > RESIZE_LONG_EDGE_PX ? RESIZE_LONG_EDGE_PX / longEdge : 1;
	const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
	const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

	const canvas = createOffscreenLikeCanvas(targetWidth, targetHeight);
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("Canvas 2D context unavailable");
	}
	context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
	if ("close" in bitmap && typeof bitmap.close === "function") {
		bitmap.close();
	}

	const blob = await canvasToBlob(canvas, ENCODED_TYPE, 0.85);
	if (blob) {
		return blob;
	}

	const fallback = await canvasToBlob(canvas, ENCODED_FALLBACK_TYPE, 0.85);
	if (!fallback) {
		throw new Error("Could not encode image");
	}
	return fallback;
}

async function loadImageBitmap(
	file: File,
): Promise<ImageBitmap | HTMLImageElement> {
	if (typeof createImageBitmap === "function") {
		return createImageBitmap(file, {
			imageOrientation: "from-image",
		});
	}

	const image = new Image();
	const objectUrl = URL.createObjectURL(file);
	const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
		image.addEventListener("load", () => resolve(image), { once: true });
		image.addEventListener(
			"error",
			() => reject(new Error("Image load failed")),
			{ once: true },
		);
	});
	image.src = objectUrl;
	try {
		return await loaded;
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
}

function createOffscreenLikeCanvas(width: number, height: number) {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

function canvasToBlob(
	canvas: HTMLCanvasElement,
	type: string,
	quality: number,
): Promise<Blob | null> {
	return new Promise((resolve) => {
		canvas.toBlob((blob) => resolve(blob), type, quality);
	});
}
