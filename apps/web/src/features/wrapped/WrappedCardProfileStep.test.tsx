import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WrappedCardProfileStep } from "@/features/wrapped/WrappedCardProfileStep";
import type { WrappedGuestPreviewProfile } from "@/features/wrapped/wrapped-guest-preview";

const { mockCloseChatwoot, mockOpenChatwoot, mockSetChatwootBubbleVisibility } =
	vi.hoisted(() => ({
		mockCloseChatwoot: vi.fn(),
		mockOpenChatwoot: vi.fn(),
		mockSetChatwootBubbleVisibility: vi.fn(),
	}));

vi.mock("@/lib/chatwoot", () => ({
	CHATWOOT_CLOSED_EVENT: "chatwoot:closed",
	CHATWOOT_OPENED_EVENT: "chatwoot:opened",
	closeChatwoot: mockCloseChatwoot,
	openChatwoot: mockOpenChatwoot,
	setChatwootBubbleVisibility: mockSetChatwootBubbleVisibility,
}));

Object.defineProperty(window, "matchMedia", {
	value: vi.fn().mockImplementation((query: string) => ({
		addEventListener: vi.fn(),
		addListener: vi.fn(),
		dispatchEvent: vi.fn(),
		matches: false,
		media: query,
		onchange: null,
		removeEventListener: vi.fn(),
		removeListener: vi.fn(),
	})),
	writable: true,
});

const previewProfile: WrappedGuestPreviewProfile = {
	displayName: "Ada Lovelace",
	followerCount: null,
	imageUrl: null,
	source: "local",
	username: "ada",
	verified: false,
};

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_CREATE_IMAGE_BITMAP = globalThis.createImageBitmap;
const ORIGINAL_CREATE_OBJECT_URL = URL.createObjectURL;
const ORIGINAL_REVOKE_OBJECT_URL = URL.revokeObjectURL;
const ORIGINAL_TO_BLOB = HTMLCanvasElement.prototype.toBlob;
const ORIGINAL_GET_CONTEXT = HTMLCanvasElement.prototype.getContext;

describe("WrappedCardProfileStep", () => {
	beforeEach(() => {
		// Stub canvas/image plumbing so the resize pipeline can run under jsdom.
		HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
			drawImage: vi.fn(),
		})) as unknown as typeof HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.toBlob = (
			callback: BlobCallback,
			type?: string,
		) => {
			const blob = new Blob(["resized"], {
				type: type ?? "image/webp",
			});
			callback(blob);
		};
		(
			globalThis as unknown as {
				createImageBitmap: typeof createImageBitmap;
			}
		).createImageBitmap = vi.fn(async () => ({
			width: 100,
			height: 100,
			close: vi.fn(),
		})) as unknown as typeof createImageBitmap;
		URL.createObjectURL = vi.fn(() => "blob:preview-1");
		URL.revokeObjectURL = vi.fn();
	});

	afterEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
		(
			globalThis as unknown as {
				createImageBitmap: typeof createImageBitmap;
			}
		).createImageBitmap = ORIGINAL_CREATE_IMAGE_BITMAP;
		URL.createObjectURL = ORIGINAL_CREATE_OBJECT_URL;
		URL.revokeObjectURL = ORIGINAL_REVOKE_OBJECT_URL;
		HTMLCanvasElement.prototype.toBlob = ORIGINAL_TO_BLOB;
		HTMLCanvasElement.prototype.getContext = ORIGINAL_GET_CONTEXT;
	});

	it("renders the shared onboarding progress for the card profile step", async () => {
		const user = userEvent.setup();
		const handleContinue = vi.fn();
		const handleDisplayNameChange = vi.fn();

		render(
			<MemoryRouter>
				<WrappedCardProfileStep
					displayName="Ada Lovelace"
					imageUrl={null}
					isComplete={true}
					onBack={vi.fn()}
					onContinue={handleContinue}
					onDisplayNameChange={handleDisplayNameChange}
					onImageChange={vi.fn()}
					previewProfile={previewProfile}
				/>
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("navigation", { name: "Wrapped onboarding progress" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", {
				name: "Onboarding step 2: Personalize card",
			}),
		).toHaveAttribute("aria-current", "step");

		await user.click(screen.getByRole("button", { name: "Save name" }));
		expect(
			screen.getByRole("button", { name: "Edit name" }),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Edit name" }));
		expect(screen.getByRole("textbox", { name: "Name on card" })).toHaveValue(
			"Ada Lovelace",
		);

		await user.clear(screen.getByRole("textbox", { name: "Name on card" }));
		await user.type(
			screen.getByRole("textbox", { name: "Name on card" }),
			"Ada",
		);

		expect(handleDisplayNameChange).toHaveBeenCalled();

		await user.click(screen.getByRole("button", { name: "Save name" }));
		await user.click(screen.getByRole("button", { name: "Continue" }));

		expect(handleContinue).toHaveBeenCalledTimes(1);
	});

	it("uploads the picked image and reports the persisted URL to the parent", async () => {
		const onImageChange = vi.fn();
		const onUploadingChange = vi.fn();
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						user: {
							id: "user-1",
							email: "ada@example.com",
							name: "Ada Lovelace",
							image: "/api/avatar/12345678-1234-1234-1234-123456789abc",
							activeOrganizationId: null,
						},
					}),
					{ status: 200 },
				),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		render(
			<MemoryRouter>
				<WrappedCardProfileStep
					displayName="Ada Lovelace"
					imageUrl={null}
					isComplete={true}
					onBack={vi.fn()}
					onContinue={vi.fn()}
					onDisplayNameChange={vi.fn()}
					onImageChange={onImageChange}
					onUploadingChange={onUploadingChange}
					previewProfile={previewProfile}
				/>
			</MemoryRouter>,
		);

		const input = screen.getByLabelText("Profile picture") as HTMLInputElement;
		const file = new File(["png"], "avatar.png", { type: "image/png" });
		const user = userEvent.setup();
		await user.upload(input, file);

		await waitFor(() => {
			expect(onImageChange).toHaveBeenCalledWith(
				"/api/avatar/12345678-1234-1234-1234-123456789abc",
			);
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const fetchCall = fetchMock.mock.calls[0] as unknown as [
			unknown,
			RequestInit,
		];
		expect(String(fetchCall[0])).toBe("/api/profile/avatar");
		expect(fetchCall[1].method).toBe("POST");
		expect(fetchCall[1].body).toBeInstanceOf(FormData);
		expect(fetchCall[1].credentials).toBe("include");
		expect(onUploadingChange).toHaveBeenCalledWith(true);
		expect(onUploadingChange).toHaveBeenLastCalledWith(false);
	});

	it("does not fire fetch for unsupported image types", async () => {
		const fetchMock = vi.fn();
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		const onImageChange = vi.fn();

		render(
			<MemoryRouter>
				<WrappedCardProfileStep
					displayName="Ada Lovelace"
					imageUrl={null}
					isComplete={true}
					onBack={vi.fn()}
					onContinue={vi.fn()}
					onDisplayNameChange={vi.fn()}
					onImageChange={onImageChange}
					previewProfile={previewProfile}
				/>
			</MemoryRouter>,
		);

		const input = screen.getByLabelText("Profile picture") as HTMLInputElement;
		const file = new File(["x"], "evil.svg", { type: "image/svg+xml" });
		const user = userEvent.setup();
		await user.upload(input, file);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(onImageChange).not.toHaveBeenCalled();
		expect(
			screen.getByText("Pick a PNG, JPEG, or WEBP image for your card."),
		).toBeInTheDocument();
	});

	it("keeps the previous image and shows an error when upload fails", async () => {
		const fetchMock = vi.fn(async () => new Response("nope", { status: 500 }));
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		const onImageChange = vi.fn();
		const onUploadingChange = vi.fn();

		render(
			<MemoryRouter>
				<WrappedCardProfileStep
					displayName="Ada Lovelace"
					imageUrl="/api/avatar/12345678-1234-1234-1234-123456789abc"
					isComplete={true}
					onBack={vi.fn()}
					onContinue={vi.fn()}
					onDisplayNameChange={vi.fn()}
					onImageChange={onImageChange}
					onUploadingChange={onUploadingChange}
					previewProfile={previewProfile}
				/>
			</MemoryRouter>,
		);

		const input = screen.getByLabelText("Profile picture") as HTMLInputElement;
		const file = new File(["png"], "avatar.png", { type: "image/png" });
		const user = userEvent.setup();
		await user.upload(input, file);

		await waitFor(() => {
			expect(
				screen.getByText("We could not upload your image. Try again."),
			).toBeInTheDocument();
		});
		expect(onImageChange).not.toHaveBeenCalled();
		expect(onUploadingChange).toHaveBeenLastCalledWith(false);
	});
});
