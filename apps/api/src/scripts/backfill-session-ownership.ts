import { sqlClient } from "../db.js";
import { backfillSessionOwnership } from "../services/session-ownership-backfill.service.js";

try {
	const result = await backfillSessionOwnership();
	console.log(
		`Session ownership backfill ${result.status}; inserted ${result.insertedCount} claims.`,
	);
} finally {
	await sqlClient.end({ timeout: 5 });
}
