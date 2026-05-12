import {
	AVATAR_ACCEPTED_MIME_TYPES,
	type AvatarMimeType,
	type AvatarUploadErrorBody,
	isAvatarUploadErrorCode,
} from "@rudel/api-routes";
import { ArrowRight, ImagePlus } from "lucide-react";
import { type ChangeEvent, type ReactNode, useRef, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { WrappedPrimaryAction } from "./actions";
import { WrappedRouteStageShell } from "./route-stage-shell";
import { WrappedGuestPreviewCard } from "./WrappedGuestPreviewCard";
import type { WrappedGuestPreviewProfile } from "./wrapped-guest-preview";

const WRAPPED_CARD_PROFILE_TITLE = (
	<span className="rudel-wrapped-auth-intro-title">
		<span className="rudel-wrapped-auth-intro-title__line">
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

// iPhones save photos as HEIC/HEIF by default. Browsers know the MIME, but
// neither <canvas> decoding nor our server's magic-byte sniff handles them.
// Detect early so we can give a specific message instead of the generic one.
const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);

const ERROR_MESSAGES = {
	heic: "iPhone HEIC photos aren't supported. In your iPhone, open Settings → Camera → Formats and pick 'Most Compatible', or share the photo as JPEG and try again.",
	wrongType: "Pick a PNG, JPEG, or WEBP image for your card.",
	tooLargePreResize: "Image is too large. Pick something under 5 MB.",
	resizeFailed:
		"We couldn't read that image. Try a different file or save it as PNG or JPEG first.",
	network: "Couldn't reach the server. Check your connection and try again.",
	generic: "We could not upload your image. Try again.",
} as const;

const SERVER_ERROR_MESSAGES: Record<AvatarUploadErrorBody["error"], string> = {
	unauthorized:
		"Your session expired. Refresh the page and sign in, then try again.",
	length_required: "Couldn't read the upload — try selecting the file again.",
	request_too_large:
		"Image was too large to upload. Try a smaller picture (under 2 MB after resize).",
	invalid_multipart: "Couldn't read the upload — try selecting the file again.",
	missing_file: "No file was attached. Try selecting it again.",
	file_too_large:
		"Image must be under 2 MB after we resize it. Try a smaller picture.",
	unsupported_image_type:
		"We couldn't read that image. Save it as PNG or JPEG and try again.",
	server_error: "Something broke on our side. Try again in a moment.",
};

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

		// HEIC/HEIF first: iPhone default. The generic "pick PNG/JPEG/WEBP"
		// message doesn't help users who don't know their iPhone is saving HEIC.
		if (HEIC_MIME_TYPES.has(file.type)) {
			setUploadError(ERROR_MESSAGES.heic);
			return;
		}

		// Reject only when the browser KNOWS the type and it's outside our
		// allowlist. An empty file.type happens on drag-and-drop and certain
		// download paths — let resize + server sniff decide for those, since
		// the bytes may still be a valid PNG/JPEG/WEBP.
		const declaredType = file.type;
		if (
			declaredType !== "" &&
			!(AVATAR_ACCEPTED_MIME_TYPES as readonly string[]).includes(declaredType)
		) {
			setUploadError(ERROR_MESSAGES.wrongType);
			return;
		}

		if (file.size > PRE_RESIZE_MAX_BYTES) {
			setUploadError(ERROR_MESSAGES.tooLargePreResize);
			return;
		}

		setUploadError(null);
		setUploadingState(true);

		// Resize separately so a decoder/encoder failure produces a different
		// message than an upload failure.
		let resized: Blob;
		try {
			resized = await resizeImage(file);
		} catch {
			setPreviewBlobUrl((current) => {
				if (current) URL.revokeObjectURL(current);
				return null;
			});
			setUploadError(ERROR_MESSAGES.resizeFailed);
			setUploadingState(false);
			return;
		}

		const localPreviewUrl = URL.createObjectURL(resized);
		setPreviewBlobUrl((current) => {
			if (current) URL.revokeObjectURL(current);
			return localPreviewUrl;
		});

		try {
			const formData = new FormData();
			formData.append("file", resized, "avatar.webp");
			const response = await fetch("/api/profile/avatar", {
				method: "POST",
				body: formData,
				credentials: "include",
			});

			if (!response.ok) {
				const message = await readUploadErrorMessage(response);
				URL.revokeObjectURL(localPreviewUrl);
				setPreviewBlobUrl(null);
				setUploadError(message);
				return;
			}

			const payload = (await response.json()) as {
				user?: { image?: string | null };
			};
			const persistedImageUrl = payload.user?.image ?? null;

			URL.revokeObjectURL(localPreviewUrl);
			setPreviewBlobUrl(null);
			onImageChange(persistedImageUrl);
		} catch {
			// fetch() rejection — network failure, CORS issue, server unreachable.
			URL.revokeObjectURL(localPreviewUrl);
			setPreviewBlobUrl(null);
			setUploadError(ERROR_MESSAGES.network);
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
			objectClassName="rudel-wrapped-entry-stage__object--auth-profile"
			onBack={onBack}
			progressStepId="card-profile"
			stage={
				<div className="rudel-wrapped-auth-panel rudel-wrapped-auth-panel--profile">
					<div className="rudel-wrapped-card-profile-step__card">
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
										className="rudel-wrapped-card-profile-step__image-edit"
										title={imageEditLabel}
										onClick={(event) => {
											event.stopPropagation();
											handleOpenImagePicker();
										}}
										onPointerDown={(event) => event.stopPropagation()}
									>
										<ImagePlus className="rudel-wrapped-card-profile-step__image-edit-icon" />
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
								className="rudel-wrapped-card-profile-step__error"
							>
								{uploadError}
							</p>
						) : null}
					</div>
				</div>
			}
			stageClassName="rudel-wrapped-entry-stage--auth rudel-wrapped-entry-stage--auth-profile"
			title={WRAPPED_CARD_PROFILE_TITLE}
			titleClassName="rudel-wrapped-entry-stage__headline--auth-intro"
			useReferenceTopChrome
		/>
	);
}

async function readUploadErrorMessage(response: Response): Promise<string> {
	let body: unknown = null;
	try {
		body = await response.json();
	} catch {
		return ERROR_MESSAGES.generic;
	}

	if (!body || typeof body !== "object") {
		return ERROR_MESSAGES.generic;
	}

	const errorCode = (body as { error?: unknown }).error;
	if (!isAvatarUploadErrorCode(errorCode)) {
		return ERROR_MESSAGES.generic;
	}

	return SERVER_ERROR_MESSAGES[errorCode];
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
