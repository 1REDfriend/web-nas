import { redirect } from "next/navigation";

// Moved into the settings pages; kept so old links and bookmarks still work
export default function CreateUserPage() {
  redirect("/settings/admin/users/new");
}
