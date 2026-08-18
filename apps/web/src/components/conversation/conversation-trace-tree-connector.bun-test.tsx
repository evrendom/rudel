import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	AgentTraceTreeSection,
	ConversationTraceTreeConnectorStyleProvider,
	ConversationTraceTreeItem,
} from "./conversation-trace-tree";

describe("ConversationTraceTree connector styles", () => {
	test("publishes the stuck-ancestor bottom for nested sticky content", () => {
		// Depth alone must not reserve sticky space: an isolated, non-sticky row
		// has nothing pinned above it, so nested content pins at the container
		// top regardless of depth.
		const isolated = renderToStaticMarkup(
			<ConversationTraceTreeItem continues={false} depth={3}>
				<span>Write</span>
			</ConversationTraceTreeItem>,
		);
		expect(isolated).toContain("--conversation-trace-sticky-offset:0px");

		// Sticky rows consume their REAL height: a 24px flat row adds 24, not a
		// 40px slot — otherwise a see-through band opens between stuck rows.
		const nested = renderToStaticMarkup(
			<ConversationTraceTreeItem
				continues={false}
				depth={1}
				sticky
				subtree={
					<ConversationTraceTreeItem
						continues={false}
						depth={2}
						rowHeight={24}
						sticky
						subtree={
							<ConversationTraceTreeItem continues={false} depth={3}>
								<span>Write</span>
							</ConversationTraceTreeItem>
						}
					>
						<span>Request</span>
					</ConversationTraceTreeItem>
				}
			>
				<span>Model</span>
			</ConversationTraceTreeItem>,
		);
		expect(nested).toContain("--conversation-trace-sticky-offset:40px");
		expect(nested).toContain('data-trace-tree-sticky-top="40"');
		expect(nested).toContain("--conversation-trace-sticky-offset:64px");
		expect(nested).not.toContain("--conversation-trace-sticky-offset:80px");
		expect(nested).not.toContain("--conversation-trace-sticky-offset:120px");
	});

	test("renders Interfere's compact split rail without a synthetic junction", () => {
		const hybridMarkup = renderToStaticMarkup(
			<ConversationTraceTreeConnectorStyleProvider style="interfere">
				<ConversationTraceTreeItem continues depth={1}>
					<span className="size-5">Message</span>
				</ConversationTraceTreeItem>
			</ConversationTraceTreeConnectorStyleProvider>,
		);
		const originalMarkup = renderToStaticMarkup(
			<ConversationTraceTreeItem continues={false} depth={1}>
				<span>Message</span>
			</ConversationTraceTreeItem>,
		);

		expect(hybridMarkup).toContain(
			'data-trace-tree-connector-style="interfere"',
		);
		expect(hybridMarkup).toContain('data-trace-tree-rail-segment="incoming"');
		expect(hybridMarkup).toContain('data-trace-tree-rail-segment="outgoing"');
		expect(hybridMarkup).toContain('d="M 37 0 V 8"');
		expect(hybridMarkup).toContain('d="M 37 32 V 40"');
		expect(hybridMarkup).not.toContain("data-trace-tree-junction");
		expect(hybridMarkup).not.toContain(" H ");
		expect(hybridMarkup).not.toContain(" Q ");
		expect(originalMarkup).toContain(
			'data-trace-tree-connector-style="curved"',
		);
		expect(originalMarkup).toContain(" Q ");
		expect(originalMarkup).not.toContain("data-trace-tree-junction");
	});

	test("keeps the screenshot branch treatment isolated from the reference", () => {
		const branchMarkup = renderToStaticMarkup(
			<ConversationTraceTreeConnectorStyleProvider style="interfere-branch">
				<ConversationTraceTreeItem continues depth={1}>
					<span className="size-5">Message</span>
				</ConversationTraceTreeItem>
			</ConversationTraceTreeConnectorStyleProvider>,
		);

		expect(branchMarkup).toContain(
			'data-trace-tree-connector-style="interfere-branch"',
		);
		expect(branchMarkup).toContain('d="M 16 20 H 28"');
		expect(branchMarkup).toContain('d="M 16 0 V 40"');
		expect(branchMarkup).not.toContain(" Q ");
		expect(branchMarkup).not.toContain("data-trace-tree-junction");
	});

	test("renders dotted child-owned connectors without row-owned downward stubs", () => {
		const dottedMarkup = renderToStaticMarkup(
			<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots">
				<ConversationTraceTreeItem
					continues
					depth={1}
					descends
					subtree={
						<ConversationTraceTreeItem continues={false} depth={2}>
							<span className="size-5">Reasoning</span>
						</ConversationTraceTreeItem>
					}
				>
					<span className="size-5">Message</span>
				</ConversationTraceTreeItem>
			</ConversationTraceTreeConnectorStyleProvider>,
		);

		expect(dottedMarkup).toContain(
			'data-trace-tree-connector-style="interfere-branch-dots"',
		);
		expect(dottedMarkup).toContain('data-trace-tree-connector-depth="1"');
		expect(dottedMarkup).toContain('data-trace-tree-line-depth="1"');
		expect(dottedMarkup).toContain('data-trace-tree-junction-depth="1"');
		expect(dottedMarkup).toContain("data-trace-tree-continuation");
		expect(dottedMarkup).toContain('d="M 22 20 H 28"');
		expect(dottedMarkup).toContain("data-trace-tree-junction-dot");
		expect(dottedMarkup).toContain('data-trace-tree-junction-shape="opaline"');
		expect(dottedMarkup).toContain('width="4"');
		expect(dottedMarkup).toContain('height="4"');
		expect(dottedMarkup).toContain('x="14"');
		expect(dottedMarkup).toContain('y="18"');
		expect(dottedMarkup).toContain("url(&quot;/opaline-trace-fill.svg&quot;)");
		expect(dottedMarkup).not.toContain("<circle");
		expect([
			...dottedMarkup.matchAll(/data-trace-tree-rail-segment="incoming"/g),
		]).toHaveLength(2);
		expect([
			...dottedMarkup.matchAll(/data-trace-tree-rail-segment="outgoing"/g),
		]).toHaveLength(2);
		expect(dottedMarkup).toContain('d="M 16 0 V 14"');
		expect(dottedMarkup).toContain('d="M 16 26 V 40"');
		expect(dottedMarkup).toContain("--conversation-trace-tree-descend-x:39px");
		expect(dottedMarkup).toContain('d="M 16 0 V 40"');
		expect(dottedMarkup).toContain('d="M 39 0 V 14 M 45 20 H 51"');
		expect(dottedMarkup).not.toContain("data-trace-tree-descendant-rail");
	});

	test("keeps dots and vertical feeds while omitting horizontal branches in the comparison style", () => {
		const noHorizontalMarkup = renderToStaticMarkup(
			<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
				<ConversationTraceTreeItem
					continues
					depth={1}
					descends
					subtree={
						<ConversationTraceTreeItem continues={false} depth={2}>
							<span className="size-5">Reasoning</span>
						</ConversationTraceTreeItem>
					}
				>
					<span className="size-5">Message</span>
				</ConversationTraceTreeItem>
			</ConversationTraceTreeConnectorStyleProvider>,
		);

		expect(noHorizontalMarkup).toContain(
			'data-trace-tree-connector-style="interfere-branch-dots-no-horizontal"',
		);
		expect(noHorizontalMarkup).toContain("data-trace-tree-junction-dot");
		expect(noHorizontalMarkup).toContain("data-trace-tree-terminal-feed");
		expect(noHorizontalMarkup).toContain('d="M 16 0 V 40"');
		expect(noHorizontalMarkup).toContain('d="M 39 0 V 14"');
		expect(noHorizontalMarkup).toContain(
			'data-trace-tree-marker-geometry="dot"',
		);
		expect(noHorizontalMarkup).toContain(
			'data-trace-tree-marker-geometry="icon"',
		);
		expect(noHorizontalMarkup).toContain('d="M 39 0 V 6"');
		expect(noHorizontalMarkup).toContain('class="hidden"');
		expect(noHorizontalMarkup).not.toContain(" H ");
		expect(noHorizontalMarkup).not.toContain("data-trace-tree-descendant-rail");
	});

	test("reserves Interfere's four-pixel gap around a twenty-pixel event icon", () => {
		const continuingMarkup = renderToStaticMarkup(
			<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
				<ConversationTraceTreeItem continues depth={2} rowHeight={32}>
					<span className="size-5">Reasoning</span>
				</ConversationTraceTreeItem>
			</ConversationTraceTreeConnectorStyleProvider>,
		);
		const terminalMarkup = renderToStaticMarkup(
			<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
				<ConversationTraceTreeItem continues={false} depth={2} rowHeight={32}>
					<span className="size-5">Message</span>
				</ConversationTraceTreeItem>
			</ConversationTraceTreeConnectorStyleProvider>,
		);

		expect(continuingMarkup).toContain('d="M 39 0 V 2"');
		expect(continuingMarkup).toContain('d="M 39 30 V 32"');
		expect(terminalMarkup).toContain('d="M 39 0 V 2"');
		expect(terminalMarkup).not.toContain('d="M 39 30 V 32"');
	});

	test("can complete the first icon row's incoming rail to the sibling cadence", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
				<ConversationTraceTreeItem
					continues
					depth={3}
					incomingRailExtension={2}
					rowHeight={32}
				>
					<span className="size-5">Tool</span>
				</ConversationTraceTreeItem>
			</ConversationTraceTreeConnectorStyleProvider>,
		);

		expect(markup).toContain("data-trace-tree-entry-rail");
		expect(markup).toContain("height:2px");
		expect(markup).toContain("top:-2px");
		expect(markup).toContain("left:62px");
	});

	test("completes the first trace node below a model header", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
				<AgentTraceTreeSection
					agentLabel="Claude"
					agentModel="claude-sonnet-4"
					events={[]}
					planMode={false}
					sections={[
						{
							branchDepth: 2,
							branches: [
								{
									childStartIndex: 0,
									children: [],
									hasFollowingBranch: false,
									hasRoot: true,
									key: "reasoning-branch",
									root: { key: "reasoning", row: <span>Reasoning</span> },
									totalChildren: 0,
								},
							],
							continuesFromPrevious: false,
							continuesToNext: false,
							events: [],
							flatRequestRows: false,
							groupIndex: undefined,
							groupTreatment: "none",
							header: undefined,
							key: "section-1",
						},
					]}
					stickyHeader={false}
				/>
			</ConversationTraceTreeConnectorStyleProvider>,
		);

		expect(markup).toContain("data-trace-tree-entry-rail");
		expect(markup).toContain('data-trace-tree-line-depth="2"');
		expect(markup).toContain("left:39px");
	});

	test("continues a dotted rail through non-tree subtree content", () => {
		const promptMarkup = renderToStaticMarkup(
			<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
				<ConversationTraceTreeItem
					continues
					continuesThroughSubtree
					depth={1}
					sticky
					subtree={<p>A long member prompt</p>}
				>
					<span className="size-5">Member</span>
				</ConversationTraceTreeItem>
			</ConversationTraceTreeConnectorStyleProvider>,
		);

		expect(promptMarkup).toContain("data-trace-tree-subtree-rails");
		expect(promptMarkup).toContain("data-trace-tree-expanded-rails");
		expect(promptMarkup).toContain('x1="16"');
		expect(promptMarkup).toContain('y2="100%"');
	});
});
