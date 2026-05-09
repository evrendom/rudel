export interface WebAcquisitionAttribution {
	launch_channel?: string;
	referrer_domain?: string;
	utm_campaign?: string;
	utm_content?: string;
	utm_medium?: string;
	utm_source?: string;
	utm_term?: string;
}

export function appendWebAcquisitionSearchParams(
	targetParams: URLSearchParams,
	sourceSearch?: string,
	referrerDomain?: string | null,
) {
	const sourceParams = new URLSearchParams(sourceSearch);
	appendOptionalParam(targetParams, sourceParams, "utm_source");
	appendOptionalParam(targetParams, sourceParams, "utm_medium");
	appendOptionalParam(targetParams, sourceParams, "utm_campaign");
	appendOptionalParam(targetParams, sourceParams, "utm_content");
	appendOptionalParam(targetParams, sourceParams, "utm_term");
	appendOptionalParam(targetParams, sourceParams, "launch_channel");

	const preservedReferrerDomain =
		getOptionalSearchParam(sourceParams, "referrer_domain") ??
		normalizeOptionalString(referrerDomain);
	if (preservedReferrerDomain) {
		targetParams.set("referrer_domain", preservedReferrerDomain);
	}
}

export function getWebAcquisitionAttribution(
	search: string,
): WebAcquisitionAttribution {
	const sourceParams = new URLSearchParams(search);

	return {
		launch_channel: getOptionalSearchParam(sourceParams, "launch_channel"),
		referrer_domain:
			getOptionalSearchParam(sourceParams, "referrer_domain") ??
			getDocumentReferrerDomain(),
		utm_campaign: getOptionalSearchParam(sourceParams, "utm_campaign"),
		utm_content: getOptionalSearchParam(sourceParams, "utm_content"),
		utm_medium: getOptionalSearchParam(sourceParams, "utm_medium"),
		utm_source: getOptionalSearchParam(sourceParams, "utm_source"),
		utm_term: getOptionalSearchParam(sourceParams, "utm_term"),
	};
}

export function getDocumentReferrerDomain() {
	if (typeof document === "undefined" || !document.referrer) {
		return undefined;
	}

	return getExternalReferrerDomain(document.referrer);
}

function appendOptionalParam(
	targetParams: URLSearchParams,
	sourceParams: URLSearchParams,
	paramName: string,
) {
	const value = getOptionalSearchParam(sourceParams, paramName);
	if (value) {
		targetParams.set(paramName, value);
	}
}

function getOptionalSearchParam(
	sourceParams: URLSearchParams,
	paramName: string,
) {
	return normalizeOptionalString(sourceParams.get(paramName));
}

function getExternalReferrerDomain(referrer: string) {
	try {
		const referrerUrl = new URL(referrer);
		if (
			typeof window !== "undefined" &&
			referrerUrl.hostname === window.location.hostname
		) {
			return undefined;
		}

		return referrerUrl.hostname.toLowerCase().replace(/^www\./u, "");
	} catch {
		return undefined;
	}
}

function normalizeOptionalString(value: string | null | undefined) {
	const trimmedValue = value?.trim();

	return trimmedValue && trimmedValue.length > 0 ? trimmedValue : undefined;
}
