export interface WrappedArchetypeCentroid {
	archetype_id: number;
	archetype_key: string;
	archetype_name: string;
	consistency: number;
	intensity: number;
	session_shape: number;
	cost_intensity: number;
	output: number;
	breadth: number;
	range: number;
}

// Empirical centroids from .context/archetype-clickhouse-reference.sql:48-56.
// Hardcoded for launch so we can skip the centroids table. The
// centroid_version exported from wrapped-archetype-constants pins which
// version these match. If the centroid set changes, bump
// WRAPPED_ARCHETYPE_CENTROID_VERSION and update this list together.
export const WRAPPED_ARCHETYPE_CENTROIDS = [
	{
		archetype_id: 0,
		archetype_key: "roadrunner",
		archetype_name: "Roadrunner",
		consistency: 0.1881,
		intensity: 0.7952,
		session_shape: 0.6714,
		cost_intensity: 0.831,
		output: 0.5905,
		breadth: 0.5667,
		range: 0.8238,
	},
	{
		archetype_id: 1,
		archetype_key: "cheapskate",
		archetype_name: "Cheapskate",
		consistency: 0.2693,
		intensity: 0.1741,
		session_shape: 0.2098,
		cost_intensity: 0.2083,
		output: 0.5804,
		breadth: 0.2163,
		range: 0.7619,
	},
	{
		archetype_id: 2,
		archetype_key: "smooth_operator",
		archetype_name: "Smooth Operator",
		consistency: 0.62,
		intensity: 0.7758,
		session_shape: 0.8591,
		cost_intensity: 0.248,
		output: 0.4792,
		breadth: 0.5042,
		range: 0.5893,
	},
	{
		archetype_id: 3,
		archetype_key: "company_card",
		archetype_name: "Company Card",
		consistency: 0.3061,
		intensity: 0.1582,
		session_shape: 0.1786,
		cost_intensity: 0.5884,
		output: 0.1582,
		breadth: 0.2118,
		range: 0.267,
	},
	{
		archetype_id: 4,
		archetype_key: "hit_and_runner",
		archetype_name: "Hit and Runner",
		consistency: 0.1086,
		intensity: 0.2351,
		session_shape: 0.1161,
		cost_intensity: 0.2783,
		output: 0.6533,
		breadth: 0.6545,
		range: 0.0595,
	},
	{
		archetype_id: 5,
		archetype_key: "adhd_brain",
		archetype_name: "ADHD Brain",
		consistency: 0.6405,
		intensity: 0.3488,
		session_shape: 0.4452,
		cost_intensity: 0.544,
		output: 0.3155,
		breadth: 0.5015,
		range: 0.7643,
	},
	{
		archetype_id: 6,
		archetype_key: "obsessed",
		archetype_name: "Obsessed",
		consistency: 0.5778,
		intensity: 0.5037,
		session_shape: 0.5375,
		cost_intensity: 0.8013,
		output: 0.6209,
		breadth: 0.2244,
		range: 0.2802,
	},
	{
		archetype_id: 7,
		archetype_key: "tourist",
		archetype_name: "Tourist",
		consistency: 0.2636,
		intensity: 0.3724,
		session_shape: 0.3571,
		cost_intensity: 0.216,
		output: 0.0238,
		breadth: 0.5833,
		range: 0,
	},
	{
		archetype_id: 8,
		archetype_key: "maniac",
		archetype_name: "Maniac",
		consistency: 0.8683,
		intensity: 0.7921,
		session_shape: 0.7341,
		cost_intensity: 0.6659,
		output: 0.4103,
		breadth: 0.7889,
		range: 0.5698,
	},
] as const satisfies readonly WrappedArchetypeCentroid[];
