import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WrappedSetupPage } from "@/features/wrapped/WrappedSetupPage";

Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: vi.fn(),
		addListener: vi.fn(),
		dispatchEvent: vi.fn(),
		removeEventListener: vi.fn(),
		removeListener: vi.fn(),
	})),
});

function hasExactTextContent(expectedText: string) {
	return (_content: string, element: Element | null) =>
		element?.textContent === expectedText;
}

describe("WrappedSetupPage", () => {
	it("renders the initial combined install and login step", () => {
		render(
			<MemoryRouter>
				<WrappedSetupPage />
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("heading", { name: "Set up Rudel" }),
		).toBeInTheDocument();
		expect(
			screen.getByText("Start sending sessions to Rudel."),
		).toBeInTheDocument();
		expect(
			screen.getByRole("navigation", { name: "Wrapped onboarding progress" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Close wrapped" }),
		).toBeNull();
		expect(
			screen.queryByRole("button", { name: "I installed and logged in" }),
		).toBeNull();
		expect(screen.getAllByText("Set up Rudel in your terminal")).toHaveLength(
			1,
		);
		expect(
			screen.queryByText(
				"Install the CLI and connect it to the right Rudel account.",
			),
		).toBeNull();
		expect(
			screen.getByText(
				hasExactTextContent("npm install -g rudel && rudel login"),
				{ selector: "code" },
			),
		).toBeInTheDocument();
		expect(screen.getByText("Upload sessions")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Auto upload + upload historical sessions in a given repo",
			),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				"Don't want to auto-upload but manually pick single sessions?",
			),
		).toBeInTheDocument();
		expect(
			screen.getAllByRole("button", { name: "Copy to clipboard" }),
		).toHaveLength(2);
		expect(
			screen.queryByText(hasExactTextContent("rudel upload"), {
				selector: "code",
			}),
		).toBeNull();
		expect(screen.queryByText("Now")).toBeNull();
		expect(screen.queryByText("Later")).toBeNull();
		expect(
			screen.queryByText(
				"Set the hooks once so future sessions upload automatically.",
			),
		).toBeNull();
	});

	it("renders the post-login state and reveals manual upload behind the toggle", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter>
				<WrappedSetupPage initialStepId="enable-auto-upload" />
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("heading", { name: "Set up Rudel" }),
		).toBeInTheDocument();
		expect(
			screen.getByText("Start sending sessions to Rudel."),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "I enabled auto-upload" }),
		).toBeNull();
		expect(
			screen.queryByRole("button", { name: "I installed and logged in" }),
		).toBeNull();
		expect(screen.queryByText("Done")).toBeNull();
		expect(screen.queryByText("Now")).toBeNull();
		expect(screen.queryByText("Later")).toBeNull();
		expect(
			screen.getByText(hasExactTextContent("rudel enable"), {
				selector: "code",
			}),
		).toBeInTheDocument();
		expect(screen.getByText("Upload sessions")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Auto upload + upload historical sessions in a given repo",
			),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				"Don't want to auto-upload but manually pick single sessions?",
			),
		).toBeInTheDocument();
		expect(
			screen.getAllByRole("button", { name: "Copy to clipboard" }),
		).toHaveLength(2);
		expect(
			screen.queryByText(hasExactTextContent("rudel upload"), {
				selector: "code",
			}),
		).toBeNull();

		await user.click(
			screen.getByRole("button", {
				name: "Don't want to auto-upload but manually pick single sessions?",
			}),
		);

		expect(
			screen.getByText(hasExactTextContent("rudel upload"), {
				selector: "code",
			}),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				"Manually select sessions in a given repo with no auto upload in the future",
			),
		).toBeInTheDocument();
		expect(
			screen.getAllByRole("button", { name: "Copy to clipboard" }),
		).toHaveLength(3);
		expect(screen.queryByText("Upload your first session")).toBeNull();
	});

	it("can open directly on the post-login state", () => {
		render(
			<MemoryRouter>
				<WrappedSetupPage initialStepId="enable-auto-upload" />
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("heading", { name: "Set up Rudel" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "I enabled auto-upload" }),
		).toBeNull();
		expect(screen.queryByText("Done")).toBeNull();
		expect(
			screen.getByText("Start sending sessions to Rudel."),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "I installed and logged in" }),
		).toBeNull();
		expect(screen.queryByText("Now")).toBeNull();
		expect(screen.queryByText("Later")).toBeNull();
		expect(
			screen.getAllByRole("button", { name: "Copy to clipboard" }),
		).toHaveLength(2);
		expect(
			screen.getByText(hasExactTextContent("rudel enable"), {
				selector: "code",
			}),
		).toBeInTheDocument();
		expect(screen.getByText("Upload sessions")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Auto upload + upload historical sessions in a given repo",
			),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				"Don't want to auto-upload but manually pick single sessions?",
			),
		).toBeInTheDocument();
		expect(
			screen.queryByText(hasExactTextContent("rudel upload"), {
				selector: "code",
			}),
		).toBeNull();
		expect(
			screen.getAllByRole("button", { name: "Copy to clipboard" }),
		).toHaveLength(2);
	});
});
