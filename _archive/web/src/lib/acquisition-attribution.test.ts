import { describe, expect, it } from "vitest";
import {
	appendWebAcquisitionSearchParams,
	getWebAcquisitionAttribution,
} from "@/lib/acquisition-attribution";

describe("web acquisition attribution", () => {
	it("extracts launch and UTM attribution from search params", () => {
		expect(
			getWebAcquisitionAttribution(
				"?utm_source=x&utm_medium=social&utm_campaign=launch&utm_content=post&utm_term=agents&launch_channel=borrowed_loop&referrer_domain=t.co",
			),
		).toEqual({
			launch_channel: "borrowed_loop",
			referrer_domain: "t.co",
			utm_campaign: "launch",
			utm_content: "post",
			utm_medium: "social",
			utm_source: "x",
			utm_term: "agents",
		});
	});

	it("preserves only acquisition params on wrapped continuation URLs", () => {
		const targetParams = new URLSearchParams();
		targetParams.set("share_id", "share-123");

		appendWebAcquisitionSearchParams(
			targetParams,
			"?utm_source=x&utm_campaign=launch&ignored=1",
			"news.ycombinator.com",
		);

		expect(targetParams.toString()).toBe(
			"share_id=share-123&utm_source=x&utm_campaign=launch&referrer_domain=news.ycombinator.com",
		);
	});
});
