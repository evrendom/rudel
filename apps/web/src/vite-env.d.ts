/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_FRONTEND_FIXTURES?: string;
	readonly VITE_SESSION_DETAIL_FAST_PATH?: string;
}

declare const __APP_VERSION__: string;
