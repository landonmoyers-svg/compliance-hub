import { Construction } from "lucide-react";
import { PageHeader } from "./page-header";
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({
  title,
  description,
  note,
}: {
  title: string;
  description?: string;
  note?: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <Construction className="size-10 text-muted-foreground" />
          <div>
            <p className="text-lg font-medium">Coming soon</p>
            <p className="text-sm text-muted-foreground mt-1">
              {note ?? "This section is under construction. Check back soon."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
