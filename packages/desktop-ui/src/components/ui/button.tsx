import { Button as ButtonPrimitive } from "@base-ui/react/button";
import type { CSSProperties, ReactElement } from "react";

type ButtonVariant =
	| "default"
	| "secondary"
	| "outline"
	| "ghost"
	| "destructive"
	| "link";
type ButtonSize = "default" | "xs" | "sm" | "lg" | "icon";

export interface ButtonProps extends Omit<ButtonPrimitive.Props, "style"> {
	size?: ButtonSize;
	style?: CSSProperties;
	variant?: ButtonVariant;
}

export function Button(props: ButtonProps): ReactElement {
	const {
		children,
		disabled = false,
		size = "default",
		style,
		type = "button",
		variant = "default",
		...buttonProps
	} = props;

	return (
		<ButtonPrimitive
			{...buttonProps}
			data-size={size}
			data-slot="button"
			data-variant={variant}
			disabled={disabled}
			style={buttonStyle(variant, size, disabled, style)}
			type={type}
		>
			{children}
		</ButtonPrimitive>
	);
}

function buttonStyle(
	variant: ButtonVariant,
	size: ButtonSize,
	disabled: boolean,
	style: CSSProperties | undefined,
): CSSProperties {
	return {
		...baseStyle,
		...sizeStyles[size],
		...variantStyles[variant],
		...(disabled ? disabledStyle : {}),
		...style,
	};
}

const baseStyle = {
	maxWidth: "100%",
	border: "1px solid transparent",
	borderRadius: 999,
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	gap: 6,
	overflow: "hidden",
	font: "inherit",
	fontSize: 14,
	fontWeight: 500,
	letterSpacing: 0,
	lineHeight: "20px",
	textDecoration: "none",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	backgroundClip: "padding-box",
	cursor: "pointer",
	transition:
		"background-color 140ms ease, border-color 140ms ease, color 140ms ease, transform 140ms ease",
} satisfies CSSProperties;

const variantStyles = {
	default: {
		background: "#050505",
		color: "#ffffff",
	} satisfies CSSProperties,
	secondary: {
		background: "#f1f1f1",
		color: "#171717",
	} satisfies CSSProperties,
	outline: {
		borderColor: "rgba(5, 5, 5, 0.12)",
		background: "#ffffff",
		color: "#171717",
	} satisfies CSSProperties,
	ghost: {
		background: "transparent",
		color: "#171717",
	} satisfies CSSProperties,
	destructive: {
		background: "#ffe8ef",
		color: "#9f1239",
	} satisfies CSSProperties,
	link: {
		background: "transparent",
		color: "#171717",
		minHeight: "auto",
		padding: 0,
		fontSize: "inherit",
		fontWeight: "inherit",
		lineHeight: "inherit",
		justifyContent: "flex-start",
		textAlign: "left",
		textDecoration: "none",
	} satisfies CSSProperties,
} satisfies Record<ButtonVariant, CSSProperties>;

const sizeStyles = {
	default: {
		minHeight: 36,
		padding: "0 12px",
	} satisfies CSSProperties,
	xs: {
		minHeight: 24,
		padding: "0 10px",
		fontSize: 12,
		lineHeight: "18px",
	} satisfies CSSProperties,
	sm: {
		minHeight: 32,
		padding: "0 12px",
	} satisfies CSSProperties,
	lg: {
		minHeight: 40,
		padding: "0 16px",
	} satisfies CSSProperties,
	icon: {
		width: 36,
		height: 36,
		minHeight: 36,
		padding: 0,
	} satisfies CSSProperties,
} satisfies Record<ButtonSize, CSSProperties>;

const disabledStyle = {
	opacity: 0.45,
	cursor: "not-allowed",
} satisfies CSSProperties;
