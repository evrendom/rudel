import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type WrappedPrimaryActionProps =
	| ({
			children: ReactNode;
			className?: string;
			icon?: ReactNode;
			kind: "button";
	  } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">)
	| {
			children: ReactNode;
			className?: string;
			kind: "link";
			to: string;
	  };

type WrappedSecondaryActionProps = {
	children: ReactNode;
	className?: string;
} & Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	"children" | "className" | "type"
>;

export function WrappedPrimaryAction(props: WrappedPrimaryActionProps) {
	const className = cn(
		"rudel-wrapped-primary-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold",
		props.className,
	);

	if (props.kind === "link") {
		return (
			<Link to={props.to} className={className}>
				{props.children}
			</Link>
		);
	}

	const {
		children,
		className: _className,
		icon,
		kind: _kind,
		type,
		...buttonProps
	} = props;

	return (
		<button type={type ?? "button"} {...buttonProps} className={className}>
			<span>{children}</span>
			{icon ? (
				<span className="rudel-wrapped-primary-action__icon">{icon}</span>
			) : null}
		</button>
	);
}

export function WrappedSecondaryAction(props: WrappedSecondaryActionProps) {
	return (
		<button
			type="button"
			disabled={props.disabled}
			onClick={props.onClick}
			className={cn(
				"rudel-wrapped-secondary-action rounded-full [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold",
				props.className,
			)}
		>
			{props.children}
		</button>
	);
}
