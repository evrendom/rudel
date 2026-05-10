import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { CSSProperties, ReactElement } from "react";

export function TooltipProvider(
	props: TooltipPrimitive.Provider.Props,
): ReactElement {
	const { children, closeDelay = 80, delay = 220, ...providerProps } = props;

	return (
		<TooltipPrimitive.Provider
			{...providerProps}
			closeDelay={closeDelay}
			delay={delay}
		>
			{children}
		</TooltipPrimitive.Provider>
	);
}

export function Tooltip(props: TooltipPrimitive.Root.Props): ReactElement {
	return <TooltipPrimitive.Root {...props} />;
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
		"align" | "collisionPadding" | "side" | "sideOffset"
	>;

export function TooltipContent(props: TooltipContentProps): ReactElement {
	const {
		align = "center",
		children,
		collisionPadding = 8,
		side = "top",
		sideOffset = 8,
		style,
		...popupProps
	} = props;

	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Positioner
				align={align}
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
				</TooltipPrimitive.Popup>
			</TooltipPrimitive.Positioner>
		</TooltipPrimitive.Portal>
	);
}

const styles = {
	positioner: {
		zIndex: 1_000,
	} satisfies CSSProperties,
	content: {
		maxWidth: 220,
		border: "1px solid rgba(5, 5, 5, 0.12)",
		borderRadius: 8,
		background: "#050505",
		boxShadow: "0 8px 24px rgba(5, 5, 5, 0.16)",
		color: "#ffffff",
		fontFamily:
			'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
		fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11", "ss01"',
		padding: "7px 9px",
		fontSize: 12,
		fontWeight: 550,
		letterSpacing: 0,
		lineHeight: 1.35,
		zIndex: 1_000,
	} satisfies CSSProperties,
} satisfies Record<string, CSSProperties>;
