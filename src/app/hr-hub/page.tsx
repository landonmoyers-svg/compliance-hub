import { redirect } from "next/navigation";

// HR Hub was a landing page that only linked to pages the "HR & Payroll"
// sidebar group already lists — pure duplication. Keep the route as a redirect
// so old links land somewhere sensible.
export default function HrHubRedirect() {
  redirect("/hr/employees");
}
