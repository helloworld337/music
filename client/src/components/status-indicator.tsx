import { cn } from "@/lib/utils";

interface StatusIndicatorProps {
  status: "live" | "connecting" | "connected" | "disconnected" | "error";
  className?: string;
}

const statusConfig = {
  live: {
    label: "LIVE",
    dotColor: "bg-red-500",
    animate: true,
  },
  connecting: {
    label: "CONNECTING",
    dotColor: "bg-yellow-500",
    animate: true,
  },
  connected: {
    label: "CONNECTED",
    dotColor: "bg-green-500",
    animate: false,
  },
  disconnected: {
    label: "DISCONNECTED",
    dotColor: "bg-gray-400",
    animate: false,
  },
  error: {
    label: "ERROR",
    dotColor: "bg-red-500",
    animate: false,
  },
};

export function StatusIndicator({ status, className }: StatusIndicatorProps) {
  const config = statusConfig[status];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 text-sm font-medium tracking-wide",
        className
      )}
      data-testid={`status-indicator-${status}`}
    >
      <span className="relative flex h-3 w-3">
        {config.animate && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
              config.dotColor
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex rounded-full h-3 w-3",
            config.dotColor
          )}
        />
      </span>
      <span className="text-muted-foreground">{config.label}</span>
    </div>
  );
}
