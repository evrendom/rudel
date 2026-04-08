"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
	AnimatePresence,
	LayoutGroup,
	motion,
} from "motion/react";
import {
	ArrowUpRightIcon,
	SparklesIcon,
	XIcon,
} from "lucide-react";
import { Button } from "@/app/ui/button";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after trigger.
 *
 *    0ms   sidebar card is clicked
 *   40ms   backdrop fades in
 *  280ms   card morphs from rail width -> centered modal
 *  120ms   modal copy fades in after the shell settles
 * ───────────────────────────────────────────────────────── */

const TIMING = {
	backdropIn: 40,
	cardMorph: 280,
	contentIn: 120,
} as const;

const CARD_LAYOUT_ID = "sidebar-news-card";

const CARD_SPRING = {
	type: "spring" as const,
	stiffness: 360,
	damping: 34,
	mass: 0.9,
};

const BACKDROP_TRANSITION = {
	delay: TIMING.backdropIn / 1000,
	duration: 0.18,
	ease: [0.22, 1, 0.36, 1] as const,
};

const CONTENT_TRANSITION = {
	duration: 0.18,
	delay: TIMING.contentIn / 1000,
	ease: [0.22, 1, 0.36, 1] as const,
};

function NewsCardInner({ expanded = false }: { expanded?: boolean }) {
	return (
		<>
			<div
				className={cn(
					"flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
					expanded ? "px-1 pt-1" : "px-1 py-1",
				)}
			>
				<SparklesIcon className="size-3.5" />
				What&apos;s new
			</div>
			<div
				className={cn(
					"px-1",
					expanded ? "pb-1 pt-2" : "pb-1 pt-2",
				)}
			>
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="truncate text-[14px] font-semibold tracking-[-0.02em]">
							Card morph into modal
						</p>
						<p className="mt-1 text-[12px] leading-4 text-muted-foreground">
							Click to expand this sidebar card into a centered modal.
						</p>
					</div>
					{expanded ? null : (
						<ArrowUpRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
					)}
				</div>
			</div>
		</>
	);
}

export function SidebarNewsPopover() {
	const [open, setOpen] = React.useState(false);

	return (
		<DialogPrimitive.Root open={open} onOpenChange={setOpen}>
			<LayoutGroup id="sidebar-news-dialog">
				<DialogPrimitive.Trigger
					render={
						<motion.button
							layoutId={CARD_LAYOUT_ID}
							type="button"
							transition={CARD_SPRING}
							animate={{ opacity: open ? 0 : 1 }}
							data-sidebar-interactive
							className="w-full rounded-[1.35rem] bg-[var(--dashboard-01-content-background)] text-left text-foreground ring-1 ring-black/6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
							aria-label="Open sidebar news"
						/>
					}
				>
					<NewsCardInner />
				</DialogPrimitive.Trigger>
				<AnimatePresence>
					{open ? (
						<DialogPrimitive.Portal keepMounted>
							<DialogPrimitive.Backdrop
								render={
									<motion.div
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										exit={{ opacity: 0 }}
										transition={BACKDROP_TRANSITION}
										className="fixed inset-0 z-50 bg-black/18 supports-backdrop-filter:backdrop-blur-[2px]"
									/>
								}
							/>
							<DialogPrimitive.Popup
								initialFocus={false}
								render={
									<motion.div
										layoutId={CARD_LAYOUT_ID}
										transition={CARD_SPRING}
										className="fixed left-1/2 top-1/2 z-[51] flex w-[min(24rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-0 rounded-[1.55rem] bg-[var(--dashboard-01-content-background)] p-3 text-foreground ring-1 ring-black/8 outline-none"
									/>
								}
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0 flex-1">
										<NewsCardInner expanded />
									</div>
									<DialogPrimitive.Close
										render={
											<button
												type="button"
												className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white/90 text-muted-foreground ring-1 ring-black/5 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
												aria-label="Close sidebar news"
											/>
										}
									>
										<XIcon className="size-4" />
									</DialogPrimitive.Close>
								</div>
								<motion.div
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: 6 }}
									transition={CONTENT_TRANSITION}
									className="px-1 pb-1 pt-3"
								>
									<DialogPrimitive.Title className="sr-only">
										Sidebar news modal
									</DialogPrimitive.Title>
									<DialogPrimitive.Description className="text-[13px] leading-5 text-muted-foreground">
										This uses a Base UI dialog for modal behavior and a shared
										layout transition so the sidebar card can morph into a centered
										panel instead of just popping open.
									</DialogPrimitive.Description>
									<div className="mt-4 flex justify-end">
										<DialogPrimitive.Close render={<Button size="sm" />}>
											Got it
										</DialogPrimitive.Close>
									</div>
								</motion.div>
							</DialogPrimitive.Popup>
						</DialogPrimitive.Portal>
					) : null}
				</AnimatePresence>
			</LayoutGroup>
		</DialogPrimitive.Root>
	);
}
