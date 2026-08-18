export const conversationTraceLabelClassName =
	"shrink-0 font-sans text-[calc(var(--spacing)*3)]/[1rem] font-normal [color:color(display-p3_0_0_0/.608)]";

// Sticky headers alone need an opaque pane-colored surface: it masks rails
// that keep scrolling underneath without turning ordinary rows into cards.
export const conversationTraceStickyOnlyFillClassName =
	"[&_*:not([data-trace-icon]):not([data-trace-tree-line]):not([data-trace-tree-sticky-surface]):not([data-trace-code-block]):not([data-trace-code-block]_*):not([data-signal]):not([data-search-highlight])]:!bg-transparent [&_*:not([data-trace-icon]):not([data-trace-tree-line]):not([data-trace-tree-sticky-surface]):not([data-trace-code-block]):not([data-trace-code-block]_*):not([data-signal]):not([data-search-highlight])]:!bg-none";

export const conversationTracePreviewClassName =
	"min-w-0 flex-1 truncate font-sans text-[calc(var(--spacing)*3.25)]/5 font-normal tracking-normal text-[color:var(--dashboardy-heading)] group-aria-expanded:invisible";

export const conversationTraceProsePreviewClassName =
	"min-w-0 flex-1 line-clamp-3 whitespace-normal font-sans text-[calc(var(--spacing)*3.25)]/5 font-normal tracking-normal text-[color:var(--dashboardy-heading)] group-aria-expanded:invisible";
