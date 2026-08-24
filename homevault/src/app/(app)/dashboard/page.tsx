import { getDataClient } from "@/lib/data/client";
import { DashboardView } from "./dashboard-view";

export default async function DashboardPage() {
  const data = await getDataClient();
  const records = await data.listRecords();
  return <DashboardView records={records} />;
}
