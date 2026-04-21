import { RotateCcw } from "lucide-react";
import {
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useRef,
} from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import "@/features/walk-in/card-reference.css";

const ART_HOLO_OPACITY_ACTIVE = 0.96;
const ART_HOLO_OPACITY_REST = 0;
const ART_HOLO_ROTATION_REST = 14.5092;
const ART_HOLO_STREAK_ROTATION_REST = 29.8246;
const CARD_SCALE_ACTIVE = 1.012;
const MAX_ROTATE_X_DEGREES = 12;
const MAX_ROTATE_Y_DEGREES = 14;
const SHELL_SHINE_OPACITY_ACTIVE = 1;
const SHELL_SHINE_ROTATION_REST = 61.2612;
const SHELL_SPOT_X_REST = 90.3034;
const SHELL_SPOT_Y_REST = 8.28258;

const NOISE_TEXTURE_URL = buildSvgDataUri(`
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <filter id="noise">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/>
  </filter>
  <rect width="100%" height="100%" filter="url(#noise)"/>
</svg>
`);

interface ReferenceCardSurfaceStyle extends CSSProperties {
	"--reference-card-noise-image"?: string;
}

interface ReferenceCardMotionController {
	cardRef: RefObject<HTMLDivElement | null>;
	handlePointerLeave: () => void;
	handlePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
	resetMotion: () => void;
}

const referenceCardSurfaceStyle: ReferenceCardSurfaceStyle = {
	"--reference-card-noise-image": NOISE_TEXTURE_URL,
};

export function CardReferencePage() {
	const motionController = useReferenceCardMotion();

	return (
		<main className="card-reference-page">
			<section className="card-reference-page__stage">
				<div className="card-reference-page__card-wrap">
					<div className="reference-gift-card-preview-scale">
						<div className="reference-gift-card-preview-frame">
							<canvas
								className="reference-gift-card-preview-canvas"
								width={400}
								height={200}
							/>

							<div className="reference-gift-card-stage">
								<div
									ref={motionController.cardRef}
									className="reference-gift-card"
									onPointerMove={motionController.handlePointerMove}
									onPointerLeave={motionController.handlePointerLeave}
									onPointerCancel={motionController.handlePointerLeave}
									style={referenceCardSurfaceStyle}
								>
									<div
										aria-hidden="true"
										className="reference-gift-card__shell-shine"
									>
										<div className="reference-gift-card__shell-spot" />
										<div className="reference-gift-card__shell-streak" />
									</div>

									<div className="reference-gift-card__content">
										<header className="reference-gift-card__header">
											<div className="reference-gift-card__wordmark-wrap">
												<V0WordmarkIcon />
											</div>
											<div className="reference-gift-card__recipient">
												For Josh
											</div>
										</header>

										<div className="reference-gift-card__art-zone">
											<div className="reference-gift-card__amount-wrap">
												<div className="reference-gift-card__amount">$25</div>
											</div>

											<div className="reference-gift-card__art-surface">
												<div
													aria-hidden="true"
													className="reference-gift-card__art-base"
												/>
												<div
													aria-hidden="true"
													className="reference-gift-card__art-triangles-static"
												>
													<ReferenceTriangleField />
												</div>
												<div
													aria-hidden="true"
													className="reference-gift-card__art-triangles"
												>
													<ReferenceTriangleField />
												</div>
												<div
													aria-hidden="true"
													className="reference-gift-card__art-noise"
												/>
												<div
													aria-hidden="true"
													className="reference-gift-card__art-holo"
												>
													<div className="reference-gift-card__art-holo-base" />
													<div className="reference-gift-card__art-holo-rainbow" />
													<div className="reference-gift-card__art-holo-spot" />
													<div className="reference-gift-card__art-holo-streak" />
												</div>
												<div
													aria-hidden="true"
													className="reference-gift-card__art-noise reference-gift-card__art-noise--dense"
												/>

												<div className="reference-gift-card__art-overlay">
													<div className="reference-gift-card__art-icon-wrap">
														<div className="reference-gift-card__art-icon">
															<HandCardIcon />
														</div>
													</div>

													<div className="reference-gift-card__metadata">
														<div>
															<div>MODEL ICF-001</div>
															<div>200K CTX · TSX OUT</div>
														</div>
														<div className="reference-gift-card__metadata-right">
															<div>GENERATED</div>
															<div>2026-04-20T19:10:01Z</div>
														</div>
													</div>
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>

							<div className="card-reference-page__controls">
								<button
									type="button"
									className="card-reference-page__reset"
									onClick={motionController.resetMotion}
								>
									<RotateCcw size={16} strokeWidth={2.5} />
								</button>
							</div>
						</div>
					</div>
				</div>
			</section>
		</main>
	);
}

function useReferenceCardMotion(): ReferenceCardMotionController {
	const cardRef = useRef<HTMLDivElement | null>(null);

	useMountEffect(() => {
		resetReferenceCardMotion(cardRef.current);

		return () => {
			resetReferenceCardMotion(cardRef.current);
		};
	});

	function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		if (event.pointerType !== "mouse") {
			return;
		}

		const bounds = event.currentTarget.getBoundingClientRect();
		const offsetX = (event.clientX - bounds.left) / bounds.width - 0.5;
		const offsetY = (event.clientY - bounds.top) / bounds.height - 0.5;
		const rotateX = clamp(
			-offsetY * 18,
			-MAX_ROTATE_X_DEGREES,
			MAX_ROTATE_X_DEGREES,
		);
		const rotateY = clamp(
			offsetX * 20,
			-MAX_ROTATE_Y_DEGREES,
			MAX_ROTATE_Y_DEGREES,
		);
		const shineX = clamp((offsetX + 0.5) * 100, 4, 96);
		const shineY = clamp((offsetY + 0.5) * 100, 4, 96);
		const parallaxX = offsetX * 9;
		const parallaxY = offsetY * 7;

		applyReferenceCardMotion(cardRef.current, {
			artHoloOpacity: ART_HOLO_OPACITY_ACTIVE,
			artShineX: clamp(shineX + rotateY * 0.55, 4, 98),
			artShineY: clamp(shineY - rotateX * 0.55, 4, 98),
			foilRotation: ART_HOLO_ROTATION_REST + rotateY * 0.4,
			handRotate: rotateY * 2.1,
			handX: offsetX * 38,
			handY: offsetY * 18,
			parallaxX,
			parallaxY,
			rotateX,
			rotateY,
			scale: CARD_SCALE_ACTIVE,
			shellShineOpacity: SHELL_SHINE_OPACITY_ACTIVE,
			shellShineRotation: SHELL_SHINE_ROTATION_REST + rotateY * 0.75,
			shellSpotX: shineX,
			shellSpotY: shineY,
			streakRotation: ART_HOLO_STREAK_ROTATION_REST + rotateY * 0.55,
		});
	}

	function handlePointerLeave() {
		resetReferenceCardMotion(cardRef.current);
	}

	function resetMotion() {
		resetReferenceCardMotion(cardRef.current);
	}

	return {
		cardRef,
		handlePointerLeave,
		handlePointerMove,
		resetMotion,
	};
}

interface ReferenceCardMotionValues {
	artHoloOpacity: number;
	artShineX: number;
	artShineY: number;
	foilRotation: number;
	handRotate: number;
	handX: number;
	handY: number;
	parallaxX: number;
	parallaxY: number;
	rotateX: number;
	rotateY: number;
	scale: number;
	shellShineOpacity: number;
	shellShineRotation: number;
	shellSpotX: number;
	shellSpotY: number;
	streakRotation: number;
}

function applyReferenceCardMotion(
	node: HTMLDivElement | null,
	values: ReferenceCardMotionValues,
) {
	if (!node) {
		return;
	}

	node.dataset.tiltActive = "true";
	node.style.setProperty(
		"--reference-card-rotate-x",
		`${values.rotateX.toFixed(2)}deg`,
	);
	node.style.setProperty(
		"--reference-card-rotate-y",
		`${values.rotateY.toFixed(2)}deg`,
	);
	node.style.setProperty("--reference-card-scale", values.scale.toFixed(3));
	node.style.setProperty(
		"--reference-card-shell-shine-opacity",
		values.shellShineOpacity.toFixed(3),
	);
	node.style.setProperty(
		"--reference-card-shell-x",
		`${values.shellSpotX.toFixed(2)}%`,
	);
	node.style.setProperty(
		"--reference-card-shell-y",
		`${values.shellSpotY.toFixed(2)}%`,
	);
	node.style.setProperty(
		"--reference-card-shell-rotation",
		`${values.shellShineRotation.toFixed(2)}deg`,
	);
	node.style.setProperty(
		"--reference-card-art-shine-opacity",
		values.artHoloOpacity.toFixed(3),
	);
	node.style.setProperty(
		"--reference-card-art-shine-x",
		`${values.artShineX.toFixed(2)}%`,
	);
	node.style.setProperty(
		"--reference-card-art-shine-y",
		`${values.artShineY.toFixed(2)}%`,
	);
	node.style.setProperty(
		"--reference-card-art-foil-rotation",
		`${values.foilRotation.toFixed(2)}deg`,
	);
	node.style.setProperty(
		"--reference-card-art-streak-rotation",
		`${values.streakRotation.toFixed(2)}deg`,
	);
	node.style.setProperty(
		"--reference-card-art-parallax-x",
		`${values.parallaxX.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--reference-card-art-parallax-y",
		`${values.parallaxY.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--reference-card-hand-x",
		`${values.handX.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--reference-card-hand-y",
		`${values.handY.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--reference-card-hand-rotate",
		`${values.handRotate.toFixed(2)}deg`,
	);
}

function resetReferenceCardMotion(node: HTMLDivElement | null) {
	if (!node) {
		return;
	}

	node.dataset.tiltActive = "false";
	node.style.setProperty("--reference-card-rotate-x", "0deg");
	node.style.setProperty("--reference-card-rotate-y", "0deg");
	node.style.setProperty("--reference-card-scale", "1");
	node.style.setProperty("--reference-card-shell-shine-opacity", "0");
	node.style.setProperty("--reference-card-shell-x", `${SHELL_SPOT_X_REST}%`);
	node.style.setProperty("--reference-card-shell-y", `${SHELL_SPOT_Y_REST}%`);
	node.style.setProperty(
		"--reference-card-shell-rotation",
		`${SHELL_SHINE_ROTATION_REST}deg`,
	);
	node.style.setProperty(
		"--reference-card-art-shine-opacity",
		ART_HOLO_OPACITY_REST.toFixed(3),
	);
	node.style.setProperty(
		"--reference-card-art-shine-x",
		`${SHELL_SPOT_X_REST}%`,
	);
	node.style.setProperty(
		"--reference-card-art-shine-y",
		`${SHELL_SPOT_Y_REST}%`,
	);
	node.style.setProperty(
		"--reference-card-art-foil-rotation",
		`${ART_HOLO_ROTATION_REST}deg`,
	);
	node.style.setProperty(
		"--reference-card-art-streak-rotation",
		`${ART_HOLO_STREAK_ROTATION_REST}deg`,
	);
	node.style.setProperty("--reference-card-art-parallax-x", "0px");
	node.style.setProperty("--reference-card-art-parallax-y", "0px");
	node.style.setProperty("--reference-card-hand-x", "0px");
	node.style.setProperty("--reference-card-hand-y", "0px");
	node.style.setProperty("--reference-card-hand-rotate", "0deg");
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function buildSvgDataUri(svg: string) {
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function V0WordmarkIcon() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 252 120"
			className="reference-gift-card__wordmark"
		>
			<path
				d="M96 86.0625V24H120V103.125C120 112.445 112.445 120 103.125 120C98.6751 120 94.2826 118.284 91.125 115.127L0 24H33.9375L96 86.0625Z"
				fill="currentColor"
			/>
			<path
				d="M218.25 0C236.89 0 252 15.1104 252 33.75V96H228V41.0625L173.062 96H228V120H165.75C147.11 120 132 104.89 132 86.25V24H156V79.125L211.125 24H156V0H218.25Z"
				fill="currentColor"
			/>
		</svg>
	);
}

function HandCardIcon() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			className="reference-gift-card__hand-icon"
		>
			<path
				fill="currentColor"
				fillRule="evenodd"
				clipRule="evenodd"
				d="M9.32881 2.09961C8.41754 2.09961 7.67881 2.83834 7.67881 3.74961V11.4496C7.67881 11.6721 7.54481 11.8726 7.33929 11.9577C7.13377 12.0429 6.8972 11.9958 6.7399 11.8385L5.72796 10.8266C5.03258 10.1312 3.88714 10.1946 3.2728 10.9626L2.82812 11.5184L6.00987 17.8819C7.23943 20.341 9.79966 21.8996 12.5562 21.8996C16.5118 21.8996 19.7788 18.6918 19.7788 14.7496V13.3746C19.7788 11.2483 18.0551 9.52461 15.9288 9.52461H11.5288C11.2251 9.52461 10.9788 9.27837 10.9788 8.97461C10.9788 8.92713 10.9848 8.88106 10.9961 8.83711C10.9848 8.79316 10.9788 8.74709 10.9788 8.69961V3.74961C10.9788 2.83834 10.2401 2.09961 9.32881 2.09961Z"
			/>
		</svg>
	);
}

function ReferenceTriangleField() {
	const polygons = [];
	const width = 400;
	const height = 300;
	const rowStep = 5.4;
	const columnStep = 10.8;

	for (let rowIndex = 0, y = 0; y < height + 12; rowIndex += 1, y += rowStep) {
		const progress = Math.min(y / height, 1);
		const triangleWidth = 0.9 + progress * 5.1;
		const triangleHeight = 0.78 + progress * 4.25;
		const offset = rowIndex % 2 === 0 ? 0 : columnStep / 2;

		for (let x = -columnStep; x < width + columnStep * 2; x += columnStep) {
			const left = x + offset;
			const right = left + triangleWidth;
			const apexX = left + triangleWidth / 2;
			const baseY = y + triangleHeight;

			polygons.push(
				<polygon
					key={`${rowIndex}-${x}`}
					points={`${left},${baseY} ${right},${baseY} ${apexX},${y}`}
					fill="white"
				/>,
			);
		}
	}

	return (
		<svg
			aria-hidden="true"
			className="reference-gift-card__triangle-svg"
			viewBox="0 0 400 300"
			preserveAspectRatio="xMidYMid slice"
		>
			{polygons}
		</svg>
	);
}
