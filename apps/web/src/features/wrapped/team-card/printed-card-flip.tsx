import { toPng } from "html-to-image";
import {
	type CSSProperties,
	type ReactNode,
	// biome-ignore lint/style/noRestrictedImports: card capture and flip animation are imperative storyboard bridges.
	useEffect,
	useRef,
	useState,
} from "react";

const TRANSPARENT_IMAGE_PLACEHOLDER =
	"data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";
const FLIP_DURATION_MS = 680;
const FACE_SWAP_START_DEG = 88;
const FACE_SWAP_END_DEG = 92;

interface WrappedPrintedCardFlipProps {
	back: ReactNode;
	captureKey: string;
	front: ReactNode;
	isFrontVisible: boolean;
	reduceMotion?: boolean;
}

export function WrappedPrintedCardFlip(props: WrappedPrintedCardFlipProps) {
	const {
		back,
		captureKey,
		front,
		isFrontVisible,
		reduceMotion = false,
	} = props;
	const backSourceRef = useRef<HTMLDivElement | null>(null);
	const animationFrameRef = useRef<number | null>(null);
	const angleRef = useRef(isFrontVisible ? 0 : 180);
	const [backUrl, setBackUrl] = useState<string | null>(null);
	const [angle, setAngle] = useState(() => (isFrontVisible ? 0 : 180));
	const visualState = resolvePrintedCardVisualState(angle);

	// biome-ignore lint/correctness/useExhaustiveDependencies: captureKey intentionally invalidates the rendered back texture.
	useEffect(() => {
		let isCancelled = false;

		async function captureBackSurface() {
			setBackUrl(null);

			const backSource = backSourceRef.current;
			if (!backSource) {
				return;
			}

			try {
				const nextBackUrl = await capturePrintedCardSurface(backSource);
				if (isCancelled || !nextBackUrl) {
					return;
				}

				setBackUrl(nextBackUrl);
			} catch (error) {
				if (!isCancelled) {
					console.warn("Failed to prepare wrapped card back surface", error);
				}
			}
		}

		void captureBackSurface();

		return () => {
			isCancelled = true;
		};
	}, [captureKey]);

	useEffect(() => {
		const targetAngle = isFrontVisible ? 0 : 180;

		if (animationFrameRef.current !== null) {
			cancelAnimationFrame(animationFrameRef.current);
			animationFrameRef.current = null;
		}

		if (reduceMotion) {
			angleRef.current = targetAngle;
			setAngle(targetAngle);
			return;
		}

		const startAngle = angleRef.current;
		const deltaAngle = targetAngle - startAngle;
		if (Math.abs(deltaAngle) < 0.1) {
			angleRef.current = targetAngle;
			setAngle(targetAngle);
			return;
		}

		const startTime = performance.now();

		function tick(now: number) {
			const progress = Math.min((now - startTime) / FLIP_DURATION_MS, 1);
			const nextAngle = startAngle + deltaAngle * easeWrappedCardFlip(progress);
			angleRef.current = nextAngle;
			setAngle(nextAngle);

			if (progress < 1) {
				animationFrameRef.current = requestAnimationFrame(tick);
				return;
			}

			angleRef.current = targetAngle;
			setAngle(targetAngle);
			animationFrameRef.current = null;
		}

		animationFrameRef.current = requestAnimationFrame(tick);

		return () => {
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = null;
			}
		};
	}, [isFrontVisible, reduceMotion]);

	return (
		<>
			<div
				aria-hidden="true"
				className="mymind-wrapped-printed-card-flip__source-stage"
			>
				<div
					ref={backSourceRef}
					className="mymind-wrapped-printed-card-flip__source-side"
					data-card-back-texture-source=""
				>
					{back}
				</div>
			</div>

			<div
				className="mymind-wrapped-final-stage__flip-shell"
				data-back-texture-ready={backUrl ? "true" : "false"}
				style={
					{
						"--wrapped-card-back-opacity": visualState.backOpacity,
						"--wrapped-card-dynamic-shadow": visualState.shadow,
						"--wrapped-card-edge-opacity": visualState.edgeOpacity,
						"--wrapped-card-flip-rotate-y": `${angle}deg`,
						"--wrapped-card-front-opacity": visualState.frontOpacity,
						"--wrapped-card-shadow-opacity": visualState.shadowOpacity,
						"--wrapped-card-shadow-transform": visualState.shadowTransform,
					} as CSSProperties
				}
			>
				<div className="mymind-wrapped-printed-card-flip__rotator">
					<div className="mymind-wrapped-printed-card-flip__plane mymind-wrapped-printed-card-flip__plane--front">
						{front}
					</div>
					<div className="mymind-wrapped-printed-card-flip__plane mymind-wrapped-printed-card-flip__plane--back">
						{backUrl ? (
							<img
								alt="Rudel"
								className="mymind-wrapped-printed-card-flip__image"
								draggable={false}
								src={backUrl}
							/>
						) : (
							<div
								aria-label="Rudel"
								className="mymind-wrapped-printed-card-flip__placeholder"
								data-card-face="back"
								role="img"
							/>
						)}
					</div>
				</div>
			</div>
		</>
	);
}

function resolvePrintedCardVisualState(angle: number) {
	const clampedAngle = Math.min(180, Math.max(0, angle));
	const radians = (clampedAngle / 180) * Math.PI;
	const edgeAmount = Math.sin(radians);
	const faceAmount = Math.abs(Math.cos(radians));
	const frontOpacity =
		clampedAngle <= FACE_SWAP_START_DEG
			? 1
			: clampedAngle >= FACE_SWAP_END_DEG
				? 0
				: (FACE_SWAP_END_DEG - clampedAngle) /
					(FACE_SWAP_END_DEG - FACE_SWAP_START_DEG);
	const backOpacity =
		clampedAngle >= FACE_SWAP_END_DEG
			? 1
			: clampedAngle <= FACE_SWAP_START_DEG
				? 0
				: (clampedAngle - FACE_SWAP_START_DEG) /
					(FACE_SWAP_END_DEG - FACE_SWAP_START_DEG);
	const shadowX = (0.5 - clampedAngle / 180) * 18;
	const shadowYOffset = 18 + edgeAmount * 14;
	const shadowBlur = 34 + edgeAmount * 38;
	const shadowSpread = -10 + edgeAmount * 3;
	const shadow = [
		`${shadowX.toFixed(2)}px ${shadowYOffset.toFixed(2)}px ${shadowBlur.toFixed(2)}px ${shadowSpread.toFixed(2)}px rgb(15 23 42 / ${(0.12 + edgeAmount * 0.08).toFixed(3)})`,
		`${(shadowX * 0.45).toFixed(2)}px ${(shadowYOffset * 1.85).toFixed(2)}px ${(shadowBlur * 1.5).toFixed(2)}px ${shadowSpread.toFixed(2)}px rgb(15 23 42 / ${(0.14 + edgeAmount * 0.07).toFixed(3)})`,
	].join(", ");
	const shadowScale = 0.94 + edgeAmount * 0.045;
	const shadowTransform = `translate3d(${shadowX.toFixed(2)}px, ${(edgeAmount * 1.5).toFixed(2)}px, calc(var(--wrapped-card-flip-depth, 6px) * -1.35)) scale(${shadowScale.toFixed(3)}, ${(0.94 - faceAmount * 0.018).toFixed(3)})`;

	return {
		backOpacity,
		edgeOpacity: 0.02 + edgeAmount * 0.36,
		frontOpacity,
		shadow,
		shadowOpacity: 0.46 + edgeAmount * 0.14,
		shadowTransform,
	};
}

function easeWrappedCardFlip(progress: number) {
	return progress < 0.5
		? 4 * progress * progress * progress
		: 1 - (-2 * progress + 2) ** 3 / 2;
}

async function capturePrintedCardSurface(
	element: HTMLElement,
): Promise<string | null> {
	await waitForPrintableSurface(element);

	const rect = element.getBoundingClientRect();
	if (rect.width < 1 || rect.height < 1) {
		return null;
	}

	return toPng(element, {
		backgroundColor: "transparent",
		cacheBust: true,
		imagePlaceholder: TRANSPARENT_IMAGE_PLACEHOLDER,
		pixelRatio: 2,
		preferredFontFormat: "woff2",
	});
}

async function waitForPrintableSurface(element: HTMLElement) {
	await document.fonts?.ready.catch(() => undefined);

	const images = Array.from(element.querySelectorAll("img"));
	await Promise.all(
		images.map(
			(image) =>
				new Promise<void>((resolve) => {
					if (image.complete) {
						resolve();
						return;
					}

					const finish = () => resolve();
					image.addEventListener("load", finish, { once: true });
					image.addEventListener("error", finish, { once: true });
				}),
		),
	);

	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => resolve());
		});
	});
}
