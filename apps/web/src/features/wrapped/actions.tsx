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
		"mymind-wrapped-primary-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold",
		props.className,
	);

	if (props.kind === "link") {
		return (
			<Link to={props.to} className={className}>
				{props.children}
			</Link>
		);
	}

	return (
		<button
			type={props.type ?? "button"}
			disabled={props.disabled}
			onClick={props.onClick}
			className={className}
		>
			<span>{props.children}</span>
			{props.icon ? (
				<span className="mymind-wrapped-primary-action__icon">
					{props.icon}
				</span>
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
				"mymind-wrapped-secondary-action rounded-full [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold",
				props.className,
			)}
		>
			{props.children}
		</button>
	);
}
