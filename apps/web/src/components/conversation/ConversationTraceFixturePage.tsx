import { ConversationTrace } from "./ConversationTrace";
import {
	buildConversationTraceFixtureTurns,
	CONVERSATION_TRACE_FIXTURE_AGENT_LABEL,
	CONVERSATION_TRACE_FIXTURE_MODEL,
	CONVERSATION_TRACE_FIXTURE_USER_LABEL,
} from "./conversation-trace-fixture";

// Unauthenticated, deterministic harness for the sticky trace-tree boundary
// tests: the real ConversationTrace over the checked-in fixture, inside the
// same scroll-container contract and theme tokens as the session routes. The
// trailing spacer lets the final turn boundary scroll fully past the sticky
// stack so both scroll directions can sweep it.
export function ConversationTraceFixturePage() {
	const turns = buildConversationTraceFixtureTurns();

	return (
		<div
			data-conversation-trace-scroll-container
			data-trace-fixture-scroller
			className="isolate h-dvh min-w-0 overflow-y-auto bg-(--session-overview-surface) antialiased [--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fff] [--session-overview-text:#101112] [font-family:Inter,sans-serif] dark:[--session-overview-border:rgba(255,255,255,0.08)] dark:[--session-overview-hover:rgba(255,255,255,0.05)] dark:[--session-overview-muted:rgba(255,255,255,0.65)] dark:[--session-overview-subtle:rgba(255,255,255,0.5)] dark:[--session-overview-surface:#111827] dark:[--session-overview-text:#f8fafc]"
		>
			{turns.map((turn, index) => (
				<section
					key={turn.key}
					aria-label={`Fixture turn ${index + 1}`}
					data-trace-fixture-turn={index + 1}
				>
					<ConversationTrace
						agentLabel={CONVERSATION_TRACE_FIXTURE_AGENT_LABEL}
						agentModel={CONVERSATION_TRACE_FIXTURE_MODEL}
						agentSectionMode="expanded"
						continuesAfter={index < turns.length - 1}
						expandedSpeakerLayout="trace-tree"
						items={turn.items}
						requestUsage={turn.requestUsage}
						requestUsagePlacement="start"
						traceCallDisplayMode="request"
						userLabel={CONVERSATION_TRACE_FIXTURE_USER_LABEL}
					/>
				</section>
			))}
			<div aria-hidden="true" className="h-dvh" />
		</div>
	);
}
