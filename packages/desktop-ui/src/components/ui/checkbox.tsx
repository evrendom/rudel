import type { CSSProperties, InputHTMLAttributes, ReactElement } from "react";

export function Checkbox(
	props: InputHTMLAttributes<HTMLInputElement>,
): ReactElement {
	const { style, ...inputProps } = props;

	return (
		<input
			{...inputProps}
			type="checkbox"
			style={{ ...styles.checkbox, ...style }}
		/>
	);
}

const styles = {
	checkbox: {
		width: 16,
		height: 16,
		margin: 0,
		accentColor: "#050505",
		cursor: "pointer",
	} satisfies CSSProperties,
} satisfies Record<string, CSSProperties>;
