import { motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState } from "react";
import { copyTextToClipboardWithResult } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

const COMMAND_COPY_HOLD_MS = 2000;
const COMMAND_COPY_RESET_MS = 170;

export function WrappedSetupCommandSurface(props: {
	caption?: string;
	command: string;
	className?: string;
	forceShell?: boolean;
}) {
	const { caption, className, command, forceShell = false } = props;

	if (!caption && !forceShell) {
		return <CopyableCommandSurface command={command} />;
	}

	return (
		<div
			className={cn("mymind-wrapped-setup-command__surface-shell", className)}
		>
			{caption ? (
				<p className="mymind-wrapped-setup-command__surface-caption">
					{caption}
				</p>
			) : null}
			<CopyableCommandSurface command={command} />
		</div>
	);
}

function CopyableCommandSurface(props: { command: string }) {
	const { command } = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const [copyStage, setCopyStage] = useState<"copied" | "idle" | "resetting">(
		"idle",
	);
	const holdTimeoutRef = useRef<number | null>(null);
	const resetTimeoutRef = useRef<number | null>(null);
	const { leadingToken, trailingTokens } = splitCommand(command);

	function clearTimers() {
		if (holdTimeoutRef.current !== null) {
			window.clearTimeout(holdTimeoutRef.current);
			holdTimeoutRef.current = null;
		}

		if (resetTimeoutRef.current !== null) {
			window.clearTimeout(resetTimeoutRef.current);
			resetTimeoutRef.current = null;
		}
	}

	async function handleCopy() {
		const result = await copyTextToClipboardWithResult(command, {
			preferSelectionCopy: true,
			allowPromptFallback: true,
			promptMessage: "Copy command: Cmd/Ctrl+C, Enter",
		});

		if (result !== "copied") {
			return;
		}

		clearTimers();
		setCopyStage("copied");
		holdTimeoutRef.current = window.setTimeout(() => {
			setCopyStage("resetting");
			holdTimeoutRef.current = null;
			resetTimeoutRef.current = window.setTimeout(() => {
				setCopyStage("idle");
				resetTimeoutRef.current = null;
			}, COMMAND_COPY_RESET_MS);
		}, COMMAND_COPY_HOLD_MS);
	}

	return (
		<div
			className="mymind-wrapped-setup-command-surface"
			data-copy-state={copyStage}
		>
			<figure className="mymind-wrapped-setup-command-surface__figure">
				<pre className="mymind-wrapped-setup-command-surface__pre">
					<code className="mymind-wrapped-setup-command-surface__code-line">
						<span
							className="mymind-wrapped-setup-command-surface__line"
							data-line=""
						>
							<span className="mymind-wrapped-setup-command-surface__token mymind-wrapped-setup-command-surface__token--command">
								{leadingToken}
							</span>
							{trailingTokens ? (
								<span className="mymind-wrapped-setup-command-surface__token mymind-wrapped-setup-command-surface__token--args">
									{trailingTokens}
								</span>
							) : null}
						</span>
					</code>
				</pre>
			</figure>
			<button
				type="button"
				className="mymind-wrapped-setup-command-surface__copy-button"
				aria-label={copyStage === "copied" ? "Copied" : "Copy to clipboard"}
				data-copy-state={copyStage}
				onClick={() => void handleCopy()}
			>
				<CommandCopyIcon stage={copyStage} reduceMotion={reduceMotion} />
			</button>
		</div>
	);
}

function CommandCopyIcon(props: {
	stage: "copied" | "idle" | "resetting";
	reduceMotion: boolean;
}) {
	const { reduceMotion, stage } = props;
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
			className="mymind-wrapped-setup-command-surface__copy-icon"
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

function splitCommand(command: string) {
	const trimmedCommand = command.trim();
	const firstWhitespaceIndex = trimmedCommand.indexOf(" ");

	if (firstWhitespaceIndex === -1) {
		return {
			leadingToken: trimmedCommand,
			trailingTokens: "",
		};
	}

	return {
		leadingToken: trimmedCommand.slice(0, firstWhitespaceIndex),
		trailingTokens: trimmedCommand.slice(firstWhitespaceIndex),
	};
}
