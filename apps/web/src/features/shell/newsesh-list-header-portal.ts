import { createContext, useContext } from "react";

export const NewseshListHeaderPortalContext = createContext<HTMLElement | null>(
	null,
);

export function useNewseshListHeaderPortal() {
	return useContext(NewseshListHeaderPortalContext);
}
