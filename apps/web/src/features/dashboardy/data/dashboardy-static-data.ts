export type DashboardyStatusTone = "minor" | "stable" | "warning";

export interface DashboardyDelayBucket {
	label: string;
	percentage: number;
	count: number;
}

export type DashboardyDelayTone = "onTime" | "late" | "canceled" | "diverted";

export interface DashboardyDelayChartPoint {
	key: string;
	axisLabel: string;
	minutes: number;
	tone: DashboardyDelayTone;
	forecast?: boolean;
}

export interface DashboardyWeatherMetric {
	label: string;
	value: string;
	statusLabel: string;
}

export interface DashboardyRankedRoute {
	code: string;
	name: string;
	valueLabel: string;
}

export interface DashboardyAirlineShare {
	code: string;
	valueLabel: string;
	percentLabel?: string;
}

export interface DashboardyFlightBoardRow {
	scheduled: string;
	scheduledStruck?: boolean;
	actual?: string;
	actualTone?: "regular" | "green" | "orange" | "red";
	city: string;
	status: string;
	statusTone?: "regular" | "orange" | "red";
	dotTone?: "green" | "orange" | "red";
	airlineCode: string;
	flightNumber: string;
	detail?: string;
}

export interface DashboardyStatItem {
	label: string;
	valueLabel: string;
}

export interface DashboardyAirportStats {
	activeRange: "Today";
	rangeOptions: ["Today", "Next 7 Days"];
	items: DashboardyStatItem[];
}

export interface DashboardyAirportSnapshot {
	searchPlaceholder: string;
	airportCode: string;
	airportName: string;
	airportLocation: string;
	localTime: string;
	heroTemperature: string;
	heroCondition: string;
	heroConditionShort: string;
	status: {
		tone: DashboardyStatusTone;
		label: string;
		summaries: Array<{
			label: string;
			description: string;
		}>;
		reportLabel: string;
	};
	delayCards: Array<{
		title: string;
		footerLabel: string;
		buckets: DashboardyDelayBucket[];
		chart: {
			nowKey: string;
			nowValueLabel: string;
			maxMinutes: number;
			points: DashboardyDelayChartPoint[];
		};
	}>;
	weather: {
		temperature: string;
		condition: string;
		reportedAt: string;
		metrics: DashboardyWeatherMetric[];
	};
	dailyPerformance: {
		totalLabel: string;
		totalValue: string;
		activeTab: "Departures";
		metrics: Array<{
			label: string;
			percentLabel: string;
			valueLabel: string;
		}>;
	};
	disruptedRoutes: DashboardyRankedRoute[];
	disruptedAirlines: DashboardyAirlineShare[];
	airportStats: DashboardyAirportStats;
	busiestRoutes: DashboardyRankedRoute[];
	busiestAirlines: DashboardyAirlineShare[];
	departuresBoard: DashboardyFlightBoardRow[];
	arrivalsBoard: DashboardyFlightBoardRow[];
	cta: {
		eyebrow: string;
		title: string;
		description: string;
		buttonLabel: string;
		secondaryLabel: string;
	};
}

export const dashboardySfoSnapshot: DashboardyAirportSnapshot = {
	searchPlaceholder: "Search airports...",
	airportCode: "SFO",
	airportName: "San Francisco Intl.",
	airportLocation: "San Francisco, United States",
	localTime: "11:07 AM PDT",
	heroTemperature: "14°C",
	heroCondition: "Scattered Clouds",
	heroConditionShort: "Mostly clear skies.",
	status: {
		tone: "minor",
		label: "Minor Issues",
		reportLabel: "View Full Operational Report",
		summaries: [
			{
				label: "Departures",
				description: "Flights are taking off 26m late on average.",
			},
			{
				label: "Arrivals",
				description:
					"Flights are landing 29m late on average. FAA is delaying some inbound flights before departure due to runway construction.",
			},
			{
				label: "Weather",
				description: "Breezy and partly cloudy.",
			},
		],
	},
	delayCards: [
		{
			title: "Departures Delays",
			footerLabel: "Live Takeoff Delay",
			buckets: [
				{ label: "On time", percentage: 50, count: 12 },
				{ label: "Delayed", percentage: 50, count: 12 },
				{ label: "Canceled", percentage: 0, count: 0 },
			],
			chart: {
				nowKey: "12:00",
				nowValueLabel: "40m",
				maxMinutes: 60,
				points: [
					{ key: "10:00", axisLabel: "10 AM", minutes: 20, tone: "late" },
					{ key: "10:10", axisLabel: "", minutes: 21, tone: "late" },
					{ key: "10:20", axisLabel: "", minutes: 17, tone: "late" },
					{ key: "10:30", axisLabel: "", minutes: 9, tone: "onTime" },
					{ key: "10:40", axisLabel: "", minutes: 12, tone: "onTime" },
					{ key: "10:50", axisLabel: "", minutes: 17, tone: "late" },
					{ key: "11:00", axisLabel: "11 AM", minutes: 20, tone: "late" },
					{ key: "11:10", axisLabel: "", minutes: 28, tone: "late" },
					{ key: "11:20", axisLabel: "", minutes: 30, tone: "late" },
					{ key: "11:30", axisLabel: "", minutes: 36, tone: "late" },
					{ key: "11:40", axisLabel: "", minutes: 40, tone: "late" },
					{ key: "11:50", axisLabel: "", minutes: 40, tone: "late" },
					{
						key: "12:00",
						axisLabel: "Now",
						minutes: 40,
						tone: "late",
					},
					{
						key: "12:10",
						axisLabel: "",
						minutes: 21,
						tone: "late",
						forecast: true,
					},
					{
						key: "12:20",
						axisLabel: "",
						minutes: 12,
						tone: "onTime",
						forecast: true,
					},
					{
						key: "12:30",
						axisLabel: "",
						minutes: 11,
						tone: "onTime",
						forecast: true,
					},
					{
						key: "12:40",
						axisLabel: "",
						minutes: 11,
						tone: "onTime",
						forecast: true,
					},
					{
						key: "12:50",
						axisLabel: "",
						minutes: 10,
						tone: "onTime",
						forecast: true,
					},
					{
						key: "13:00",
						axisLabel: "1 PM",
						minutes: 11,
						tone: "onTime",
						forecast: true,
					},
					{
						key: "13:10",
						axisLabel: "",
						minutes: 9,
						tone: "onTime",
						forecast: true,
					},
					{
						key: "13:20",
						axisLabel: "",
						minutes: 10,
						tone: "onTime",
						forecast: true,
					},
					{
						key: "13:30",
						axisLabel: "",
						minutes: 9,
						tone: "onTime",
						forecast: true,
					},
					{
						key: "13:40",
						axisLabel: "",
						minutes: 9,
						tone: "onTime",
						forecast: true,
					},
					{
						key: "13:50",
						axisLabel: "",
						minutes: 9,
						tone: "onTime",
						forecast: true,
					},
				],
			},
		},
		{
			title: "Arrivals Delays",
			footerLabel: "Live Landing Delay",
			buckets: [
				{ label: "On time", percentage: 67, count: 22 },
				{ label: "Delayed", percentage: 33, count: 11 },
				{ label: "Canceled", percentage: 0, count: 0 },
				{ label: "Diverted", percentage: 0, count: 0 },
			],
			chart: {
				nowKey: "11:10",
				nowValueLabel: "21m",
				maxMinutes: 60,
				points: [
					{ key: "10:00", axisLabel: "10 AM", minutes: 4, tone: "onTime" },
					{ key: "10:10", axisLabel: "", minutes: 12, tone: "onTime" },
					{ key: "10:20", axisLabel: "", minutes: 17, tone: "late" },
					{ key: "10:30", axisLabel: "", minutes: 22, tone: "late" },
					{ key: "10:40", axisLabel: "", minutes: 18, tone: "late" },
					{ key: "10:50", axisLabel: "", minutes: 16, tone: "late" },
					{ key: "11:00", axisLabel: "", minutes: 12, tone: "onTime" },
					{ key: "11:10", axisLabel: "Now", minutes: 21, tone: "late" },
					{
						key: "11:20",
						axisLabel: "",
						minutes: 20,
						tone: "late",
						forecast: true,
					},
					{
						key: "11:30",
						axisLabel: "",
						minutes: 22,
						tone: "late",
						forecast: true,
					},
					{
						key: "11:40",
						axisLabel: "",
						minutes: 18,
						tone: "late",
						forecast: true,
					},
					{
						key: "11:50",
						axisLabel: "",
						minutes: 9,
						tone: "onTime",
						forecast: true,
					},
					{
						key: "12:00",
						axisLabel: "12 PM",
						minutes: 0,
						tone: "onTime",
						forecast: true,
					},
					{
						key: "12:10",
						axisLabel: "",
						minutes: 0,
						tone: "onTime",
						forecast: true,
					},
					{
						key: "12:20",
						axisLabel: "",
						minutes: 0,
						tone: "onTime",
						forecast: true,
					},
					{
						key: "12:30",
						axisLabel: "",
						minutes: 1,
						tone: "onTime",
						forecast: true,
					},
					{
						key: "12:40",
						axisLabel: "",
						minutes: 1,
						tone: "onTime",
						forecast: true,
					},
					{
						key: "13:00",
						axisLabel: "1 PM",
						minutes: 1,
						tone: "onTime",
						forecast: true,
					},
				],
			},
		},
	],
	weather: {
		temperature: "14°C",
		condition: "Scattered Clouds",
		reportedAt: "METAR reported 31m ago",
		metrics: [
			{
				label: "Flight Rules",
				value: "VFR",
				statusLabel: "Visual Flight Rules",
			},
			{
				label: "Cloud Ceiling",
				value: "None",
				statusLabel: "VFR",
			},
			{
				label: "Visibility",
				value: "16.1 KM",
				statusLabel: "VFR",
			},
			{
				label: "Wind",
				value: "22 KM/H",
				statusLabel: "Gusts 22 KM/H",
			},
		],
	},
	dailyPerformance: {
		totalLabel: "Today",
		totalValue: "571",
		activeTab: "Departures",
		metrics: [
			{ label: "On Time", percentLabel: "87%", valueLabel: "495" },
			{ label: "Delayed", percentLabel: "12%", valueLabel: "66" },
			{ label: "Canceled", percentLabel: "2%", valueLabel: "10" },
		],
	},
	disruptedRoutes: [
		{ code: "LAX", name: "Los Angeles", valueLabel: "6" },
		{ code: "JFK", name: "New York", valueLabel: "5" },
		{ code: "SAN", name: "San Diego", valueLabel: "5" },
		{ code: "PHX", name: "Phoenix", valueLabel: "4" },
		{ code: "SNA", name: "Orange County", valueLabel: "4" },
		{ code: "BUR", name: "Burbank", valueLabel: "4" },
	],
	disruptedAirlines: [
		{ code: "UA", valueLabel: "28" },
		{ code: "AS", valueLabel: "18" },
		{ code: "WN", valueLabel: "10" },
		{ code: "AA", valueLabel: "5" },
		{ code: "1I", valueLabel: "3" },
		{ code: "AC", valueLabel: "2" },
	],
	airportStats: {
		activeRange: "Today",
		rangeOptions: ["Today", "Next 7 Days"],
		items: [
			{ label: "Departures", valueLabel: "571" },
			{ label: "Airlines", valueLabel: "46" },
			{ label: "Airports Served", valueLabel: "126" },
			{ label: "Countries Served", valueLabel: "28" },
		],
	},
	busiestRoutes: [
		{ code: "LAX", name: "Los Angeles", valueLabel: "70 flights" },
		{ code: "SAN", name: "San Diego", valueLabel: "44 flights" },
		{ code: "JFK", name: "New York", valueLabel: "39 flights" },
		{ code: "LAS", name: "Las Vegas", valueLabel: "38 flights" },
		{ code: "ORD", name: "Chicago", valueLabel: "37 flights" },
	],
	busiestAirlines: [
		{ code: "UA", percentLabel: "54%", valueLabel: "614" },
		{ code: "AS", percentLabel: "10%", valueLabel: "115" },
		{ code: "WN", percentLabel: "7%", valueLabel: "84" },
		{ code: "AA", percentLabel: "6%", valueLabel: "73" },
		{ code: "Other", percentLabel: "22%", valueLabel: "250" },
	],
	departuresBoard: [
		{
			scheduled: "5:34 PM",
			scheduledStruck: true,
			actual: "8:18 PM",
			actualTone: "red",
			city: "Chicago",
			status: "Departed 2h 44m Late",
			statusTone: "red",
			dotTone: "red",
			airlineCode: "AA",
			flightNumber: "2969",
			detail: "Gate B22",
		},
		{
			scheduled: "8:00 PM",
			scheduledStruck: true,
			actual: "7:44 PM",
			actualTone: "green",
			city: "Richland",
			status: "Departure Overdue",
			statusTone: "regular",
			dotTone: "green",
			airlineCode: "1I",
			flightNumber: "322",
		},
		{
			scheduled: "7:55 PM",
			scheduledStruck: true,
			actual: "8:29 PM",
			actualTone: "orange",
			city: "San Diego",
			status: "Departed 34m Late",
			statusTone: "orange",
			dotTone: "orange",
			airlineCode: "WN",
			flightNumber: "4434",
			detail: "Gate D3",
		},
		{
			scheduled: "8:10 PM",
			scheduledStruck: true,
			actual: "8:21 PM",
			actualTone: "regular",
			city: "Paris",
			status: "Departed 11m Late",
			statusTone: "regular",
			dotTone: "green",
			airlineCode: "AF",
			flightNumber: "81",
			detail: "Gate A2",
		},
		{
			scheduled: "8:14 PM",
			scheduledStruck: true,
			actual: "8:13 PM",
			actualTone: "regular",
			city: "Los Angeles",
			status: "Departed 1m Early",
			statusTone: "regular",
			dotTone: "green",
			airlineCode: "F9",
			flightNumber: "2858",
			detail: "Gate B17",
		},
		{
			scheduled: "8:15 PM",
			scheduledStruck: true,
			actual: "8:22 PM",
			actualTone: "regular",
			city: "Boston",
			status: "Departed 7m Late",
			statusTone: "regular",
			dotTone: "green",
			airlineCode: "B6",
			flightNumber: "734",
			detail: "Gate B18",
		},
	],
	arrivalsBoard: [
		{
			scheduled: "7:57 PM",
			scheduledStruck: true,
			actual: "9:03 PM",
			actualTone: "red",
			city: "Minneapolis",
			status: "1h 6m Late",
			statusTone: "red",
			dotTone: "red",
			airlineCode: "UA",
			flightNumber: "552",
			detail: "Belt CL-F5",
		},
		{
			scheduled: "7:58 PM",
			scheduledStruck: true,
			actual: "8:41 PM",
			actualTone: "orange",
			city: "Seattle",
			status: "43m Late",
			statusTone: "orange",
			dotTone: "orange",
			airlineCode: "UA",
			flightNumber: "2866",
			detail: "Belt D2",
		},
		{
			scheduled: "8:05 PM",
			scheduledStruck: true,
			actual: "8:53 PM",
			actualTone: "red",
			city: "Orange County",
			status: "48m Late",
			statusTone: "red",
			dotTone: "red",
			airlineCode: "UA",
			flightNumber: "2657",
			detail: "Belt 5",
		},
		{
			scheduled: "8:05 PM",
			scheduledStruck: true,
			actual: "8:40 PM",
			actualTone: "orange",
			city: "Denver",
			status: "35m Late",
			statusTone: "orange",
			dotTone: "orange",
			airlineCode: "WN",
			flightNumber: "2765",
			detail: "Belt 3",
		},
		{
			scheduled: "8:05 PM",
			scheduledStruck: true,
			actual: "8:36 PM",
			actualTone: "orange",
			city: "Hong Kong",
			status: "31m Late",
			statusTone: "orange",
			dotTone: "orange",
			airlineCode: "UA",
			flightNumber: "878",
			detail: "Belt G2",
		},
		{
			scheduled: "8:10 PM",
			scheduledStruck: true,
			actual: "8:55 PM",
			actualTone: "red",
			city: "Arcata",
			status: "45m Late",
			statusTone: "red",
			dotTone: "red",
			airlineCode: "UA",
			flightNumber: "5305",
			detail: "Belt 6",
		},
	],
	cta: {
		eyebrow: "Static Showcase",
		title: "Get Dashboardy",
		description:
			"A shell-native airport overview that mirrors the Flighty SFO information architecture with local data and stock UI primitives.",
		buttonLabel: "Launch Overview",
		secondaryLabel: "Snapshot locked to Apr 6, 2026",
	},
};
