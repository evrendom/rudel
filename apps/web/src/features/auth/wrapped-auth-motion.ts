export type WrappedAuthScene = "choice" | "email" | "credentials";

export const WRAPPED_AUTH_SCENE_EASE = [0.22, 1, 0.36, 1] as const;
export const WRAPPED_AUTH_SCENE_EXIT_EASE = [0.4, 0, 0.2, 1] as const;
export const WRAPPED_AUTH_SCENE_REDUCED_DURATION = 0.14;
export const WRAPPED_AUTH_SCENE_ENTER_DURATION = 0.3;
export const WRAPPED_AUTH_SCENE_EXIT_DURATION = 0.2;
export const WRAPPED_AUTH_SCENE_ENTER_DELAY = 0.04;

export function getWrappedAuthSceneMotion(shouldReduceMotion: boolean) {
	return {
		enter: shouldReduceMotion
			? { opacity: 1 }
			: { filter: "blur(0px)", opacity: 1, y: 0 },
		exit: shouldReduceMotion
			? {
					opacity: 0,
					transition: {
						duration: WRAPPED_AUTH_SCENE_REDUCED_DURATION,
						ease: "linear" as const,
					},
				}
			: {
					filter: "blur(6px)",
					opacity: 0,
					y: -8,
					transition: {
						duration: WRAPPED_AUTH_SCENE_EXIT_DURATION,
						ease: WRAPPED_AUTH_SCENE_EXIT_EASE,
					},
				},
		initial: shouldReduceMotion
			? { opacity: 0 }
			: { filter: "blur(8px)", opacity: 0, y: 12 },
		transition: shouldReduceMotion
			? {
					duration: WRAPPED_AUTH_SCENE_REDUCED_DURATION,
					ease: "linear" as const,
				}
			: {
					delay: WRAPPED_AUTH_SCENE_ENTER_DELAY,
					duration: WRAPPED_AUTH_SCENE_ENTER_DURATION,
					ease: WRAPPED_AUTH_SCENE_EASE,
				},
	};
}
