import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
} from "react";

export type TraceTreeRowBodySlot = {
	content: ReactNode;
	expanded: boolean;
};

export const TraceTreeRowBodySlotContext = createContext<
	Dispatch<SetStateAction<TraceTreeRowBodySlot | undefined>> | undefined
>(undefined);
