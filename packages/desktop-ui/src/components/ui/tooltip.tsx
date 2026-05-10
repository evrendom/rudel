import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { CSSProperties, ReactElement } from "react";

export function TooltipProvider(
	props: TooltipPrimitive.Provider.Props,
): ReactElement {
	const { children, delay = 0, ...providerProps } = props;

	return (
		<TooltipPrimitive.Provider
			{...providerProps}
			data-slot="tooltip-provider"
			delay={delay}
		>
			{children}
		</TooltipPrimitive.Provider>
	);
}

export function Tooltip(props: TooltipPrimitive.Root.Props): ReactElement {
	return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

export function TooltipTrigger(
	props: TooltipPrimitive.Trigger.Props,
): ReactElement {
	const { children, style, type = "button", ...triggerProps } = props;

	return (
		<TooltipPrimitive.Trigger
			{...triggerProps}
			data-slot="tooltip-trigger"
			style={style}
			type={type}
		>
			{children}
		</TooltipPrimitive.Trigger>
	);
}

type TooltipContentProps = TooltipPrimitive.Popup.Props &
	Pick<
		TooltipPrimitive.Positioner.Props,
		"align" | "alignOffset" | "collisionPadding" | "side" | "sideOffset"
	>;

export function TooltipContent(props: TooltipContentProps): ReactElement {
	const {
		align = "center",
		alignOffset = 0,
		children,
		collisionPadding = 8,
		side = "top",
		sideOffset = 4,
		style,
		...popupProps
	} = props;

	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Positioner
				align={align}
				alignOffset={alignOffset}
				collisionPadding={collisionPadding}
				side={side}
				sideOffset={sideOffset}
				style={styles.positioner}
			>
				<TooltipPrimitive.Popup
					{...popupProps}
					data-slot="tooltip-content"
					style={{ ...styles.content, ...style }}
				>
					{children}
					<TooltipPrimitive.Arrow style={tooltipArrowStyle} />
				</TooltipPrimitive.Popup>
			</TooltipPrimitive.Positioner>
		</TooltipPrimitive.Portal>
	);
}

function tooltipArrowStyle(state: TooltipPrimitive.Arrow.State): CSSProperties {
	const commonStyle = styles.arrow;

	switch (state.side) {
		case "bottom":
			return {
				...commonStyle,
				top: 4,
				transform: "translateY(calc(-50% - 2px)) rotate(45deg)",
			};
		case "left":
			return {
				...commonStyle,
				right: -4,
				transform: "translateX(-1.5px) rotate(45deg)",
			};
		case "right":
			return {
				...commonStyle,
				left: -4,
				transform: "translateX(1.5px) rotate(45deg)",
			};
		case "inline-start":
			return {
				...commonStyle,
				right: -4,
				transform: "translateX(-1.5px) rotate(45deg)",
			};
		case "inline-end":
			return {
				...commonStyle,
				left: -4,
				transform: "translateX(1.5px) rotate(45deg)",
			};
		default:
			return {
				...commonStyle,
				bottom: -10,
				transform: "translateY(calc(-50% - 2px)) rotate(45deg)",
			};
	}
}

const styles = {
	positioner: {
		isolation: "isolate",
		zIndex: 50,
	} satisfies CSSProperties,
	content: {
		width: "fit-content",
		maxWidth: 320,
		border: 0,
		borderRadius: 12,
		background: "#050505",
		color: "#ffffff",
		display: "inline-flex",
		alignItems: "center",
		gap: 6,
		fontFamily:
			'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
		fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11", "ss01"',
		padding: "6px 12px",
		fontSize: 12,
		fontWeight: 400,
		letterSpacing: 0,
		lineHeight: "16px",
		textWrap: "balance",
		zIndex: 50,
	} satisfies CSSProperties,
	arrow: {
		width: 10,
		height: 10,
		borderRadius: 2,
		background: "#050505",
		fill: "#050505",
		zIndex: 50,
	} satisfies CSSProperties,
} satisfies Record<string, CSSProperties>;
