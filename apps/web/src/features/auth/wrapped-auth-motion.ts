export type WrappedAuthScene = "choice" | "email" | "credentials";

export const WRAPPED_AUTH_SCENE_EASE = [0.22, 1, 0.36, 1] as const;
export const WRAPPED_AUTH_SCENE_EXIT_EASE = [0.4, 0, 0.2, 1] as const;
export const WRAPPED_AUTH_SCENE_LAYOUT_EASE = [0.32, 0.72, 0, 1] as const;
export const WRAPPED_AUTH_SCENE_REDUCED_DURATION = 0.14;
export const WRAPPED_AUTH_SCENE_LAYOUT_DURATION = 0.52;
export const WRAPPED_AUTH_SCENE_ENTER_DURATION = 0.3;
export const WRAPPED_AUTH_SCENE_EXIT_DURATION = 0.2;
export const WRAPPED_AUTH_SCENE_ENTER_DELAY = 0.04;
