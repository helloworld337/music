import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface ParticipantCountProps {
  count: number;
  className?: string;
}

export function ParticipantCount({ count, className }: ParticipantCountProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 text-muted-foreground",
        className
      )}
      data-testid="participant-count"
    >
      <Users className="h-5 w-5" />
      <span className="font-medium">
        {count} {count === 1 ? "listener" : "listeners"}
      </span>
    </div>
  );
}
