import { createContext, type ReactNode, useContext } from "react";
import { useSearchParams } from "react-router-dom";

interface FilterContextType {
	selectedDevelopers: string[];
	selectedRepositories: string[];
	setSelectedDevelopers: (developers: string[]) => void;
	setSelectedRepositories: (repositories: string[]) => void;
	clearAllFilters: () => void;
	hasActiveFilters: boolean;
}

type StoredFilters = {
	developers: string[];
	repositories: string[];
};

const FilterContext = createContext<FilterContextType | undefined>(undefined);

const STORAGE_KEY = "globalFilters";

function getDefaultFilters(): StoredFilters {
	return {
		developers: [],
		repositories: [],
	};
}

function readFiltersFromSearchParams(
	searchParams: URLSearchParams,
): StoredFilters | null {
	const devsParam = searchParams.get("devs");
	const reposParam = searchParams.get("repos");

	if (!devsParam && !reposParam) {
		return null;
	}

	return {
		developers: devsParam ? devsParam.split(",").filter(Boolean) : [],
		repositories: reposParam ? reposParam.split(",").filter(Boolean) : [],
	};
}

function readStoredFilters(): StoredFilters | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		if (!stored) {
			return null;
		}

		const parsed = JSON.parse(stored) as Partial<StoredFilters>;
		return {
			developers: Array.isArray(parsed.developers) ? parsed.developers : [],
			repositories: Array.isArray(parsed.repositories)
				? parsed.repositories
				: [],
		};
	} catch {
		return null;
	}
}

function resolveFilters(searchParams: URLSearchParams): StoredFilters {
	return (
		readFiltersFromSearchParams(searchParams) ??
		readStoredFilters() ??
		getDefaultFilters()
	);
}

function writeStoredFilters(filters: StoredFilters) {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
	} catch {
		// Ignore localStorage errors.
	}
}

function writeFiltersToSearchParams(
	searchParams: URLSearchParams,
	filters: StoredFilters,
) {
	const nextSearchParams = new URLSearchParams(searchParams);

	if (filters.developers.length > 0) {
		nextSearchParams.set("devs", filters.developers.join(","));
	} else {
		nextSearchParams.delete("devs");
	}

	if (filters.repositories.length > 0) {
		nextSearchParams.set("repos", filters.repositories.join(","));
	} else {
		nextSearchParams.delete("repos");
	}

	return nextSearchParams;
}

export function FilterProvider({ children }: { children: ReactNode }) {
	const [searchParams, setSearchParams] = useSearchParams();
	const filters = resolveFilters(searchParams);

	const updateFilters = (
		updater: (currentFilters: StoredFilters) => StoredFilters,
	) => {
		setSearchParams(
			(prev) => {
				const nextFilters = updater(resolveFilters(prev));
				writeStoredFilters(nextFilters);
				return writeFiltersToSearchParams(prev, nextFilters);
			},
			{ replace: true },
		);
	};

	const contextValue: FilterContextType = {
		selectedDevelopers: filters.developers,
		selectedRepositories: filters.repositories,
		setSelectedDevelopers: (developers: string[]) => {
			updateFilters((currentFilters) => ({
				...currentFilters,
				developers,
			}));
		},
		setSelectedRepositories: (repositories: string[]) => {
			updateFilters((currentFilters) => ({
				...currentFilters,
				repositories,
			}));
		},
		clearAllFilters: () => {
			updateFilters(() => getDefaultFilters());
		},
		hasActiveFilters:
			filters.developers.length > 0 || filters.repositories.length > 0,
	};

	return (
		<FilterContext.Provider value={contextValue}>
			{children}
		</FilterContext.Provider>
	);
}

export function useFilters() {
	const context = useContext(FilterContext);
	if (context === undefined) {
		throw new Error("useFilters must be used within a FilterProvider");
	}
	return context;
}
