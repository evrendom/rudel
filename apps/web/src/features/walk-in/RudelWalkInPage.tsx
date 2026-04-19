import { MymindWrappedCard } from "@/features/walk-in/MymindWrappedCard";
import { useWalkInCardData } from "@/features/walk-in/use-walk-in-card-data";
import { WalkInPreviewColumn } from "@/features/walk-in/WalkInPreviewColumn";
import { useOrganization } from "@/features/workspace/organization/useOrganization";

export function RudelWalkInPage() {
	const { state: workspaceState } = useOrganization();
	const {
		accountLabel,
		cardModel,
		handover,
		session,
		wrappedData,
		wrappedDataState,
	} = useWalkInCardData();
	const organizationName = workspaceState.activeOrg?.name ?? "Rudel";
	const organizationLogoSrc =
		workspaceState.activeOrg?.logo ?? "/logo-dark.svg";
	const avatarSrc =
		typeof session?.user?.image === "string"
			? session.user.image
			: handover.preview.profile.avatarSrc;

	return (
		<main className="mymind-walk-in-route">
			<section className="mx-auto grid min-h-screen w-full max-w-7xl items-center gap-10 px-6 py-10 text-foreground sm:px-8 lg:grid-cols-[minmax(20rem,34rem)_minmax(18rem,1fr)] lg:gap-12 lg:px-12">
				<MymindWrappedCard
					accountLabel={accountLabel}
					avatarSrc={avatarSrc}
					className="justify-self-center lg:justify-self-start"
					model={cardModel}
					organizationLogoSrc={organizationLogoSrc}
					organizationName={organizationName}
				/>

				<WalkInPreviewColumn
					cardModel={cardModel}
					handover={handover}
					wrappedData={wrappedData}
					wrappedDataState={wrappedDataState}
				/>
			</section>
		</main>
	);
}
