import { os } from "../../middleware";
import { deleteUser } from "./delete-user";
import { listUsers } from "./list-users";

export const adminRouter = os.admin.router({
	listUsers,
	deleteUser,
});
