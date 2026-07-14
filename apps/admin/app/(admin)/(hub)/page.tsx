import { redirect } from "next/navigation";

// "/" no longer has content of its own: every authenticated, role-holding
// session is routed to the picker at /select-role.
export default function AdminHomePage() {
  redirect("/select-role");
}
