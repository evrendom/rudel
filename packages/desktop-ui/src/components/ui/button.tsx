import type { ButtonHTMLAttributes, CSSProperties, ReactElement } from "react";

type ButtonVariant = "default" | "secondary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
}

export function Button(props: ButtonProps): ReactElement {
	const {
		children,
		disabled = false,
		style,
		type = "button",
		variant = "default",
		...buttonProps
	} = props;

	return (
		<button
			{...buttonProps}
			disabled={disabled}
			style={buttonStyle(variant, disabled, style)}
			type={type}
		>
			{children}
		</button>
	);
}

function buttonStyle(
	variant: ButtonVariant,
	disabled: boolean,
	style: CSSProperties | undefined,
): CSSProperties {
	return {
		...styles.base,
		...styles[variant],
		...(disabled ? styles.disabled : {}),
		...style,
	};
}

const styles = {
	base: {
		minHeight: 36,
		borderRadius: 999,
		padding: "0 14px",
		font: "inherit",
		fontSize: 14,
		fontWeight: 500,
		letterSpacing: 0,
		cursor: "pointer",
	} satisfies CSSProperties,
	default: {
		border: "1px solid #050505",
		background: "#050505",
		color: "#ffffff",
	} satisfies CSSProperties,
	secondary: {
		border: "1px solid rgba(5, 5, 5, 0.12)",
		background: "#ffffff",
		color: "#050505",
	} satisfies CSSProperties,
	disabled: {
		opacity: 0.45,
		cursor: "not-allowed",
	} satisfies CSSProperties,
} satisfies Record<string, CSSProperties>;
