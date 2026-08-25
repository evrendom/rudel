import { z } from "zod";

export const SourceSchema = z.enum(["claude_code", "codex"]);
export type Source = z.infer<typeof SourceSchema>;
