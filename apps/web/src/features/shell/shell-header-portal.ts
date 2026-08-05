import { createContext, useContext } from "react";

export const ShellHeaderPortalContext = createContext<HTMLElement | null>(null);

export function useShellHeaderPortal() {
	return useContext(ShellHeaderPortalContext);
}
