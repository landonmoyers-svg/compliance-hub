import { getDataClient } from "@/lib/data/client";
import { VaultBrowser } from "./vault-browser";

export default async function VaultPage() {
  const data = await getDataClient();
  const records = await data.listRecords();
  return <VaultBrowser allRecords={records} />;
}
