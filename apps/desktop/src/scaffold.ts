export const desktopProductScope = {
	product: "Rudel Desktop",
	focus: "Skill Blueprints",
	rule: "Desktop edits skills. Rust writes files. Cloud syncs teams.",
} as const;

if (import.meta.main) {
	console.log("Rudel Desktop scaffold ready.");
	console.log(desktopProductScope.rule);
}
