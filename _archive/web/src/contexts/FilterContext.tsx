import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { useSearchParams } from "react-router-dom";

interface FilterContextType {
	selectedDevelopers: string[];
	selectedRepositories: string[];
	setSelectedDevelopers: (developers: string[]) => void;
	setSelectedRepositories: (repositories: string[]) => void;
	clearAllFilters: () => void;
	hasActiveFilters: boolean;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

const STORAGE_KEY = "globalFilters";

const getInitialFilters = (searchParams: URLSearchParams) => {
	const devsParam = searchParams.get("devs");
	const reposParam = searchParams.get("repos");

	if (devsParam || reposParam) {
		return {
			developers: devsParam ? devsParam.split(",").filter(Boolean) : [],
			repositories: reposParam ? reposParam.split(",").filter(Boolean) : [],
		};
	}

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			return {
				developers: parsed.developers || [],
				repositories: parsed.repositories || [],
			};
		}
	} catch {
		// Ignore localStorage errors
	}

	return {
		developers: [],
		repositories: [],
	};
};

export function FilterProvider({ children }: { children: ReactNode }) {
	const [searchParams, setSearchParams] = useSearchParams();

	const initialFilters = getInitialFilters(searchParams);
	const [selectedDevelopers, setSelectedDevelopersInternal] = useState<
		string[]
	>(initialFilters.developers);
	const [selectedRepositories, setSelectedRepositoriesInternal] = useState<
		string[]
	>(initialFilters.repositories);
	const [isInitialized, setIsInitialized] = useState(false);

	useEffect(() => {
		const filters = getInitialFilters(searchParams);
		setSelectedDevelopersInternal(filters.developers);
		setSelectedRepositoriesInternal(filters.repositories);
		setIsInitialized(true);
	}, [searchParams]);

	useEffect(() => {
		if (!isInitialized) return;

		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					developers: selectedDevelopers,
					repositories: selectedRepositories,
				}),
			);
		} catch {
			// Ignore localStorage errors
		}

		setSearchParams(
			(prev) => {
				if (selectedDevelopers.length > 0) {
					prev.set("devs", selectedDevelopers.join(","));
				} else {
					prev.delete("devs");
				}

				if (selectedRepositories.length > 0) {
					prev.set("repos", selectedRepositories.join(","));
				} else {
					prev.delete("repos");
				}

				return prev;
			},
			{ replace: true },
		);
	}, [
		selectedDevelopers,
		selectedRepositories,
		isInitialized,
		setSearchParams,
	]);

	const setSelectedDevelopers = (developers: string[]) => {
		setSelectedDevelopersInternal(developers);
	};

	const setSelectedRepositories = (repositories: string[]) => {
		setSelectedRepositoriesInternal(repositories);
	};

	const clearAllFilters = () => {
		setSelectedDevelopersInternal([]);
		setSelectedRepositoriesInternal([]);
	};

	const hasActiveFilters =
		selectedDevelopers.length > 0 || selectedRepositories.length > 0;

	return (
		<FilterContext.Provider
			value={{
				selectedDevelopers,
				selectedRepositories,
				setSelectedDevelopers,
				setSelectedRepositories,
				clearAllFilters,
				hasActiveFilters,
			}}
		>
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
