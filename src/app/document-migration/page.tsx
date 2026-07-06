import { redirect } from "next/navigation";

// Document Migration has been merged into Document Intake, which now handles
// single files, whole folders, and .zip archives with AI classification and
// routing. Keep this route as a redirect so old links still work.
export default function DocumentMigrationRedirect() {
  redirect("/document-intake");
}
