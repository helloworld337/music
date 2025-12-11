import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RoomIdDisplayProps {
  roomId: string;
  className?: string;
}

export function RoomIdDisplay({ roomId, className }: RoomIdDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy room ID:", err);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-6 rounded-xl bg-card border border-card-border",
        className
      )}
    >
      <div className="flex-1">
        <p className="text-sm text-muted-foreground mb-1">Room ID</p>
        <p
          className="font-mono text-3xl font-semibold tracking-widest text-foreground"
          data-testid="text-room-id"
        >
          {roomId}
        </p>
      </div>
      <Button
        size="icon"
        variant="secondary"
        onClick={handleCopy}
        data-testid="button-copy-room-id"
      >
        {copied ? (
          <Check className="h-5 w-5 text-green-500" />
        ) : (
          <Copy className="h-5 w-5" />
        )}
      </Button>
    </div>
  );
}
