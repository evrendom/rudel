import { renderHook, waitFor } from "@testing-library/react";
import {
	type ReactNode,
	// biome-ignore lint/style/noRestrictedImports: test probe needs to mirror live searchParams updates back to the assertion side, which is exactly what useEffect is for here.
	useEffect,
	useRef,
} from "react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWrappedDecimalAccess } from "@/features/wrapped/use-wrapped-decimal-access";

const {
	mockGetMineQueryOptions,
	mockRedeem,
	mockSetQueryData,
	mockUseQuery,
	mockToastError,
	mockToastSuccess,
} = vi.hoisted(() => ({
	mockGetMineQueryOptions: vi.fn(),
	mockRedeem: vi.fn(),
	mockSetQueryData: vi.fn(),
	mockUseQuery: vi.fn(),
	mockToastError: vi.fn(),
	mockToastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
	useQuery: mockUseQuery,
	useQueryClient: () => ({
		setQueryData: mockSetQueryData,
	}),
}));

vi.mock("@/lib/orpc", () => ({
	client: {
		wrappedDecimalClaim: {
			redeem: mockRedeem,
		},
	},
	orpc: {
		wrappedDecimalClaim: {
			getMine: {
				queryOptions: mockGetMineQueryOptions,
			},
		},
	},
}));

vi.mock("sonner", () => ({
	toast: {
		error: mockToastError,
		success: mockToastSuccess,
	},
}));

interface EntitlementResult {
	entitled: boolean;
}
interface UseQueryStubResult {
	data: EntitlementResult | undefined;
	isLoading: boolean;
	isFetching: boolean;
	refetch: () => Promise<unknown>;
}

function setEntitlementQueryResult(result: UseQueryStubResult) {
	mockUseQuery.mockReturnValue(result);
}

function getCurrentSearchString() {
	return window.location.search;
}

// Renders a probe component that exposes the live searchParams next to the
// hook. We assert on this instead of `window.location.search` because
// `<MemoryRouter>` does not write to window.location.
function CurrentSearchProbe(props: { onChange: (search: string) => void }) {
	const [searchParams] = useSearchParams();
	const onChangeRef = useRef(props.onChange);
	onChangeRef.current = props.onChange;
	useEffect(() => {
		onChangeRef.current(searchParams.toString());
	}, [searchParams]);
	return null;
}

interface WrapperProps {
	children: ReactNode;
	initialEntries?: string[];
	onSearchChange: (search: string) => void;
}

function Wrapper(props: WrapperProps) {
	const { children, initialEntries = ["/wrapped"], onSearchChange } = props;
	return (
		<MemoryRouter initialEntries={initialEntries}>
			<CurrentSearchProbe onChange={onSearchChange} />
			{children}
		</MemoryRouter>
	);
}

beforeEach(() => {
	mockGetMineQueryOptions.mockReturnValue({
		queryKey: ["wrappedDecimalClaim", "getMine"],
	});
	mockRedeem.mockReset();
	mockSetQueryData.mockReset();
	mockUseQuery.mockReset();
	mockToastError.mockReset();
	mockToastSuccess.mockReset();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("useWrappedDecimalAccess", () => {
	it("returns variant=normal and skips redeem when no claim or variant params are present", () => {
		setEntitlementQueryResult({
			data: { entitled: false },
			isLoading: false,
			isFetching: false,
			refetch: vi.fn(),
		});

		const onSearchChange = vi.fn();
		const { result } = renderHook(
			() => useWrappedDecimalAccess({ userId: "user-1" }),
			{
				wrapper: ({ children }) => (
					<Wrapper onSearchChange={onSearchChange}>{children}</Wrapper>
				),
			},
		);

		expect(result.current.variant).toBe("normal");
		expect(result.current.isDecimalEntitled).toBe(false);
		expect(mockRedeem).not.toHaveBeenCalled();
	});

	it("redeems a claim token, replaces ?claim with ?variant=decimal, optimistically marks the user entitled, and toasts success on granted", async () => {
		// Simulate the post-redeem world: the entitlement query reflects the
		// `setQueryData` write that happens before the URL is flipped, so the
		// variant gate sees the user as entitled and does not bounce them.
		mockUseQuery.mockImplementation(() => ({
			data:
				mockSetQueryData.mock.calls.length > 0
					? { entitled: true }
					: { entitled: false },
			isLoading: false,
			isFetching: false,
			refetch: vi.fn().mockResolvedValue(undefined),
		}));
		mockRedeem.mockResolvedValue({ status: "granted" });

		const onSearchChange = vi.fn();
		renderHook(() => useWrappedDecimalAccess({ userId: "user-1" }), {
			wrapper: ({ children }) => (
				<Wrapper
					initialEntries={["/wrapped?claim=wct_test_token"]}
					onSearchChange={onSearchChange}
				>
					{children}
				</Wrapper>
			),
		});

		await waitFor(() => {
			expect(mockRedeem).toHaveBeenCalledWith({ token: "wct_test_token" });
		});
		await waitFor(() => {
			expect(mockSetQueryData).toHaveBeenCalledWith(
				["wrappedDecimalClaim", "getMine"],
				{ entitled: true },
			);
		});
		await waitFor(() => {
			expect(mockToastSuccess).toHaveBeenCalledTimes(1);
		});
		await waitFor(() => {
			const lastSearch = onSearchChange.mock.calls.at(-1)?.[0] as string;
			expect(lastSearch).toContain("variant=decimal");
			expect(lastSearch).not.toContain("claim=");
		});
	});

	it("drops ?claim and ?variant on invalid_or_used and toasts error", async () => {
		setEntitlementQueryResult({
			data: { entitled: false },
			isLoading: false,
			isFetching: false,
			refetch: vi.fn(),
		});
		mockRedeem.mockResolvedValue({ status: "invalid_or_used" });

		const onSearchChange = vi.fn();
		renderHook(() => useWrappedDecimalAccess({ userId: "user-1" }), {
			wrapper: ({ children }) => (
				<Wrapper
					initialEntries={["/wrapped?claim=wct_bad&variant=decimal"]}
					onSearchChange={onSearchChange}
				>
					{children}
				</Wrapper>
			),
		});

		await waitFor(() => {
			expect(mockRedeem).toHaveBeenCalledWith({ token: "wct_bad" });
		});
		await waitFor(() => {
			expect(mockToastError).toHaveBeenCalledTimes(1);
		});
		await waitFor(() => {
			const lastSearch = onSearchChange.mock.calls.at(-1)?.[0] as string;
			expect(lastSearch).not.toContain("claim=");
			expect(lastSearch).not.toContain("variant=");
		});
	});

	it("does not redeem when the user is signed out, even if a claim token is present", () => {
		setEntitlementQueryResult({
			data: undefined,
			isLoading: false,
			isFetching: false,
			refetch: vi.fn(),
		});

		const onSearchChange = vi.fn();
		renderHook(() => useWrappedDecimalAccess({ userId: null }), {
			wrapper: ({ children }) => (
				<Wrapper
					initialEntries={["/wrapped?claim=wct_test_token"]}
					onSearchChange={onSearchChange}
				>
					{children}
				</Wrapper>
			),
		});

		expect(mockRedeem).not.toHaveBeenCalled();
	});

	it("returns variant=decimal when the URL requests it and the user is entitled", () => {
		setEntitlementQueryResult({
			data: { entitled: true },
			isLoading: false,
			isFetching: false,
			refetch: vi.fn(),
		});

		const onSearchChange = vi.fn();
		const { result } = renderHook(
			() => useWrappedDecimalAccess({ userId: "user-1" }),
			{
				wrapper: ({ children }) => (
					<Wrapper
						initialEntries={["/wrapped?variant=decimal"]}
						onSearchChange={onSearchChange}
					>
						{children}
					</Wrapper>
				),
			},
		);

		expect(result.current.variant).toBe("decimal");
		expect(result.current.isDecimalEntitled).toBe(true);
	});

	it("strips ?variant=decimal and falls back to normal when the user is not entitled", async () => {
		setEntitlementQueryResult({
			data: { entitled: false },
			isLoading: false,
			isFetching: false,
			refetch: vi.fn(),
		});

		const onSearchChange = vi.fn();
		const { result } = renderHook(
			() => useWrappedDecimalAccess({ userId: "user-1" }),
			{
				wrapper: ({ children }) => (
					<Wrapper
						initialEntries={["/wrapped?variant=decimal"]}
						onSearchChange={onSearchChange}
					>
						{children}
					</Wrapper>
				),
			},
		);

		await waitFor(() => {
			const lastSearch = onSearchChange.mock.calls.at(-1)?.[0] as string;
			expect(lastSearch).not.toContain("variant=");
		});
		expect(result.current.variant).toBe("normal");
	});

	it("does not strip ?variant=decimal while the entitlement query is still loading", () => {
		setEntitlementQueryResult({
			data: undefined,
			isLoading: true,
			isFetching: true,
			refetch: vi.fn(),
		});

		const onSearchChange = vi.fn();
		renderHook(() => useWrappedDecimalAccess({ userId: "user-1" }), {
			wrapper: ({ children }) => (
				<Wrapper
					initialEntries={["/wrapped?variant=decimal"]}
					onSearchChange={onSearchChange}
				>
					{children}
				</Wrapper>
			),
		});

		// Only the initial probe firing should have happened — no further updates.
		const updates = onSearchChange.mock.calls.map((call) => call[0]);
		expect(updates.every((s) => s === "variant=decimal")).toBe(true);
	});
});

// Reference an unused symbol so biome's noUnusedImports doesn't trip on
// `getCurrentSearchString` if I keep the helper around for parity. Keeping
// it side-effect-free is intentional.
void getCurrentSearchString;
