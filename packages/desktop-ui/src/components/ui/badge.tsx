import type { CSSProperties, HTMLAttributes, ReactElement } from "react";

type BadgeVariant =
	| "default"
	| "secondary"
	| "outline"
	| "success"
	| "warning"
	| "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
	variant?: BadgeVariant;
}

export function Badge(props: BadgeProps): ReactElement {
	const { children, style, variant = "default", ...badgeProps } = props;

	return (
		<span
			{...badgeProps}
			data-slot="badge"
			style={{ ...styles.base, ...styles[variant], ...style }}
		>
			{children}
		</span>
	);
}

const styles = {
	base: {
		minHeight: 22,
		width: "fit-content",
		maxWidth: "100%",
		border: "1px solid transparent",
		borderRadius: 999,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		gap: 5,
		overflow: "hidden",
		padding: "0 8px",
		color: "#171717",
		fontSize: 12,
		fontWeight: 600,
		letterSpacing: 0,
		lineHeight: "20px",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	default: {
		background: "#050505",
		color: "#ffffff",
	} satisfies CSSProperties,
	secondary: {
		background: "#f1f1f1",
		color: "#525252",
	} satisfies CSSProperties,
	outline: {
		borderColor: "rgba(5, 5, 5, 0.12)",
		background: "#ffffff",
		color: "#525252",
	} satisfies CSSProperties,
	success: {
		background: "#e8f8ef",
		color: "#176c3a",
	} satisfies CSSProperties,
	warning: {
		background: "#fff2d8",
		color: "#8a5a00",
	} satisfies CSSProperties,
	danger: {
		background: "#ffe8ef",
		color: "#9f1239",
	} satisfies CSSProperties,
} satisfies Record<"base" | BadgeVariant, CSSProperties>;
