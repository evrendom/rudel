import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
import type { SessionTurn } from "./session-turns";

export interface SessionTurnOption extends SessionTurnTablePaneOption {
	turn: SessionTurn;
}
