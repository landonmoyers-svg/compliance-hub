import { getDataClient } from "@/lib/data/client";
import { VaultBrowser } from "./vault-browser";

export default async function VaultPage() {
  const records = await getDataClient().listRecords();
  return <VaultBrowser allRecords={records} />;
}
