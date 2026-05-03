import {
	customType,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";

const bytea = customType<{ data: Uint8Array; default: false }>({
	dataType() {
		return "bytea";
	},
});

export const userAvatar = pgTable("user_avatar", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	publicId: text("public_id").notNull().unique(),
	contentType: text("content_type").notNull(),
	imageHash: text("image_hash").notNull(),
	imageData: bytea("image_data").notNull(),
	byteLength: integer("byte_length").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

export type UserAvatarSelect = typeof userAvatar.$inferSelect;
export type UserAvatarInsert = typeof userAvatar.$inferInsert;
