import { os } from "../../middleware.js";
import { deleteUser } from "./delete-user.js";
import { listUsers } from "./list-users.js";

export const adminRouter = os.admin.router({
	listUsers,
	deleteUser,
});
