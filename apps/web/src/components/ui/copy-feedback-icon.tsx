import { motion } from "motion/react";
import { useId } from "react";

export type CopyFeedbackStage = "copied" | "idle" | "resetting";

interface CopyFeedbackIconProps {
	className?: string;
	reduceMotion: boolean;
	stage: CopyFeedbackStage;
}

export function CopyFeedbackIcon(props: CopyFeedbackIconProps) {
	const { className, reduceMotion, stage } = props;
	const isCopied = stage === "copied";
	const rectDelay = stage === "resetting" ? 0.045 : 0;
	const rectDuration = stage === "copied" ? 0.18 : 0.1;
	const pathDelay = stage === "copied" ? 0.04 : 0;
	const pathDuration = stage === "copied" ? 0.1 : 0.05;
	const frontRectAnimation = isCopied
		? { y: -4, width: 14.5, height: 14.5, rx: 7.25 }
		: { y: 0, width: 10.5, height: 10.5, rx: 2 };
	const backRectAnimation = isCopied
		? { x: -4, width: 14.5, height: 14.5, rx: 7.25 }
		: { x: 0, width: 10.5, height: 10.5, rx: 2 };
	const checkAnimation = isCopied
		? {
				opacity: 1,
				strokeDasharray: "0.9px 1px",
				strokeDashoffset: "0px",
			}
		: {
				opacity: 0,
				strokeDasharray: "0px 1px",
				strokeDashoffset: "-1px",
			};
	const maskId = useId();

	return (
		<svg
			viewBox="0 0 24 24"
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			aria-hidden="true"
			className={className}
		>
			<motion.rect
				x="4.75"
				y="8.75"
				width="10.5"
				height="10.5"
				rx="2"
				stroke="currentColor"
				strokeWidth="1.5"
				style={{ transformOrigin: "10px 14px" }}
				initial={false}
				animate={frontRectAnimation}
				transition={{
					duration: reduceMotion ? 0.12 : rectDuration,
					delay: reduceMotion ? 0 : rectDelay,
					ease: [0.22, 1, 0.36, 1],
				}}
			/>
			<g mask={`url(#${maskId})`}>
				<motion.rect
					x="8.75"
					y="4.75"
					width="10.5"
					height="10.5"
					rx="2"
					stroke="currentColor"
					strokeWidth="1.5"
					style={{ transformOrigin: "14px 10px" }}
					initial={false}
					animate={backRectAnimation}
					transition={{
						duration: reduceMotion ? 0.12 : rectDuration,
						delay: reduceMotion ? 0 : rectDelay,
						ease: [0.22, 1, 0.36, 1],
					}}
				/>
			</g>
			<motion.path
				d="M9.25 12.25L11 14.25L15 10"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
				pathLength="1"
				initial={false}
				animate={checkAnimation}
				transition={{
					duration: reduceMotion ? 0.08 : pathDuration,
					delay: reduceMotion ? 0 : pathDelay,
					ease: [0.22, 1, 0.36, 1],
				}}
			/>
			<mask id={maskId} maskUnits="userSpaceOnUse">
				<rect width="24" height="24" fill="#fff" />
				<motion.rect
					x="4.75"
					y="8.75"
					width="10.5"
					height="10.5"
					rx="2"
					fill="#000"
					stroke="#000"
					strokeWidth="1.5"
					style={{ transformOrigin: "10px 14px" }}
					initial={false}
					animate={frontRectAnimation}
					transition={{
						duration: reduceMotion ? 0.12 : rectDuration,
						delay: reduceMotion ? 0 : rectDelay,
						ease: [0.22, 1, 0.36, 1],
					}}
				/>
			</mask>
		</svg>
	);
}
