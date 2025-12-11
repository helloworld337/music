import { useLocation } from "wouter";
import { Radio, Headphones } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-end p-4">
        <ThemeToggle />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-16">
        <div className="text-center mb-12">
          <h1
            className="text-5xl font-bold mb-4 text-foreground"
            data-testid="text-app-title"
          >
            SoundSync
          </h1>
          <p
            className="text-xl text-muted-foreground max-w-md mx-auto"
            data-testid="text-app-tagline"
          >
            Share your audio in real-time with friends. Host a room or join one
            to listen together.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
          <Card className="hover-elevate transition-transform duration-200">
            <CardContent className="p-12 flex flex-col items-center text-center gap-6">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <Radio className="w-12 h-12 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-2 text-foreground">
                  Host a Room
                </h2>
                <p className="text-muted-foreground mb-6">
                  Share audio from your browser tab. Select what to stream and
                  get a unique room code for others to join.
                </p>
              </div>
              <Button
                size="lg"
                className="w-full text-lg"
                onClick={() => setLocation("/host")}
                data-testid="button-host-room"
              >
                Start Hosting
              </Button>
            </CardContent>
          </Card>

          <Card className="hover-elevate transition-transform duration-200">
            <CardContent className="p-12 flex flex-col items-center text-center gap-6">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <Headphones className="w-12 h-12 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-2 text-foreground">
                  Join a Room
                </h2>
                <p className="text-muted-foreground mb-6">
                  Enter a room code to listen to someone's shared audio stream
                  in real-time.
                </p>
              </div>
              <Button
                size="lg"
                variant="secondary"
                className="w-full text-lg"
                onClick={() => setLocation("/join")}
                data-testid="button-join-room"
              >
                Join Room
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="text-center py-6 text-sm text-muted-foreground">
        <p>Share music, podcasts, or any audio with friends in real-time.</p>
      </footer>
    </div>
  );
}
