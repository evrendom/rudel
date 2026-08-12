export type SessionTurnTableVisibility = "collapsed" | "expanded";

export function getInitialSessionTurnTableVisibility(collapsible: boolean) {
	return collapsible ? "collapsed" : "expanded";
}
