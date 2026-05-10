import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import type { CSSProperties, ReactElement } from "react";

type TabsListVariant = "default" | "line";

export function Tabs(props: TabsPrimitive.Root.Props): ReactElement {
	const { children, orientation = "horizontal", style, ...tabsProps } = props;

	return (
		<TabsPrimitive.Root
			{...tabsProps}
			data-orientation={orientation}
			data-slot="tabs"
			orientation={orientation}
			style={{ ...styles.root, ...style }}
		>
			{children}
		</TabsPrimitive.Root>
	);
}

export function TabsList(
	props: TabsPrimitive.List.Props & { variant?: TabsListVariant },
): ReactElement {
	const { children, style, variant = "default", ...listProps } = props;

	return (
		<TabsPrimitive.List
			{...listProps}
			data-slot="tabs-list"
			data-variant={variant}
			style={{
				...styles.list,
				...(variant === "line" ? styles.listLine : styles.listDefault),
				...style,
			}}
		>
			{children}
		</TabsPrimitive.List>
	);
}

export function TabsTrigger(props: TabsPrimitive.Tab.Props): ReactElement {
	const { children, style, ...triggerProps } = props;

	return (
		<TabsPrimitive.Tab
			{...triggerProps}
			data-slot="tabs-trigger"
			style={(state) => ({
				...styles.trigger,
				...(state.active ? styles.triggerActive : {}),
				...(typeof style === "function" ? style(state) : style),
			})}
		>
			{children}
		</TabsPrimitive.Tab>
	);
}

export function TabsContent(props: TabsPrimitive.Panel.Props): ReactElement {
	const { children, style, ...contentProps } = props;

	return (
		<TabsPrimitive.Panel
			{...contentProps}
			data-slot="tabs-content"
			style={{ ...styles.content, ...style }}
		>
			{children}
		</TabsPrimitive.Panel>
	);
}

const styles = {
	root: {
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: 14,
	} satisfies CSSProperties,
	list: {
		width: "fit-content",
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		color: "#737373",
	} satisfies CSSProperties,
	listDefault: {
		minHeight: 32,
		borderRadius: 8,
		background: "#f1f1f1",
		padding: 3,
	} satisfies CSSProperties,
	listLine: {
		gap: 4,
		background: "transparent",
		padding: 0,
	} satisfies CSSProperties,
	trigger: {
		minHeight: 26,
		border: "1px solid transparent",
		borderRadius: 6,
		background: "transparent",
		color: "inherit",
		padding: "0 10px",
		font: "inherit",
		fontSize: 14,
		fontWeight: 500,
		whiteSpace: "nowrap",
		cursor: "pointer",
	} satisfies CSSProperties,
	triggerActive: {
		background: "#ffffff",
		color: "#050505",
		boxShadow: "0 1px 2px rgba(5, 5, 5, 0.08)",
	} satisfies CSSProperties,
	content: {
		minWidth: 0,
		flex: "1 1 auto",
		outline: "none",
	} satisfies CSSProperties,
} satisfies Record<string, CSSProperties>;
