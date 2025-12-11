import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Headphones, Loader2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatusIndicator } from "@/components/status-indicator";
import { AudioVisualizer } from "@/components/audio-visualizer";
import type { WsMessage } from "@shared/schema";

type JoinState = "input" | "joining" | "listening" | "waiting" | "error";
type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

const SAMPLE_RATE = 48000;
const BUFFER_SIZE = 2048;
const CHUNKS_PER_SECOND = SAMPLE_RATE / BUFFER_SIZE;
const TARGET_DELAY_SECONDS = 6;
const TARGET_BUFFER_SIZE = Math.floor(CHUNKS_PER_SECOND * TARGET_DELAY_SECONDS);
const MIN_BUFFER_SIZE = Math.floor(CHUNKS_PER_SECOND * 2); // 2 second min buffer
const SCHEDULER_INTERVAL_MS = 10;
const SCHEDULE_AHEAD_TIME = 0.6; // Increased schedule ahead time
const MAX_DRIFT_CORRECTION = 0.1;

export default function JoinRoom() {
  const [, setLocation] = useLocation();
  const [joinState, setJoinState] = useState<JoinState>("input");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [isDelayed, setIsDelayed] = useState(false);
  const [bufferStatus, setBufferStatus] = useState({ current: 0, target: TARGET_BUFFER_SIZE, delaySeconds: 0 });
  const [isBuffering, setIsBuffering] = useState(true);

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingRoomIdRef = useRef<string | null>(null);

  const audioBufferRef = useRef<Map<number, Float32Array>>(new Map());
  const nextPlaySeqRef = useRef<number | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const isBufferingRef = useRef<boolean>(true);
  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestReceivedSeqRef = useRef<number>(0);
  const hasStartedPlaybackRef = useRef<boolean>(false);

  const initializeAudio = useCallback(() => {
    if (!audioContextRef.current) {
      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioContext;

      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1.0;
      gainNode.connect(audioContext.destination);
      gainNodeRef.current = gainNode;

      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;
      gainNode.connect(analyserNode);
      setAnalyser(analyserNode);

      audioBufferRef.current.clear();
      nextPlaySeqRef.current = null;
      nextPlayTimeRef.current = 0;
      isBufferingRef.current = true;
      latestReceivedSeqRef.current = 0;
    }
  }, []);

  const resumeAudioContext = useCallback(async () => {
    if (audioContextRef.current?.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch (e) {
        console.error('Failed to resume audio context:', e);
      }
    }
  }, []);

  const scheduleAudio = useCallback(() => {
    if (!audioContextRef.current || !gainNodeRef.current) return;

    resumeAudioContext();

    const ctx = audioContextRef.current;
    const gain = gainNodeRef.current;
    const now = ctx.currentTime;
    const buffer = audioBufferRef.current;

    // Calculate buffer size in seconds
    let totalSamples = 0;
    for (const chunk of Array.from(buffer.values())) {
      totalSamples += chunk.length;
    }
    const delaySeconds = (totalSamples / 2) / SAMPLE_RATE;
    const currentBufferChunks = buffer.size; // Still useful for debugging

    setBufferStatus({ current: currentBufferChunks, target: TARGET_BUFFER_SIZE, delaySeconds });

    // Handle buffering state
    if (isBufferingRef.current) {
      // Check if we have enough seconds buffered (e.g. at least TARGET_DELAY_SECONDS)
      // Since chunks are now 10s, receiving 1 chunk (10s) is > TARGET_DELAY_SECONDS (6s).
      // So we can start playing as soon as we have >= TARGET_DELAY_SECONDS of audio.
      if (delaySeconds >= TARGET_DELAY_SECONDS) {
        console.log("Buffering complete, starting playback");
        isBufferingRef.current = false;
        setIsBuffering(false);
        hasStartedPlaybackRef.current = true;

        // Determine start sequence if not set or if missing from buffer (resync)
        if (nextPlaySeqRef.current === null || !buffer.has(nextPlaySeqRef.current)) {
          const keys = Array.from(buffer.keys()).sort((a, b) => a - b);
          if (keys.length > 0) {
            console.log(`Resyncing sequence to ${keys[0]} (Target: ${nextPlaySeqRef.current})`);
            nextPlaySeqRef.current = keys[0];
          }
        }

        // Start playing slightly in the future
        nextPlayTimeRef.current = Math.max(now + 0.2, nextPlayTimeRef.current);
      } else {
        return;
      }
    }

    // Check for underrun (ran out of data)
    // We need nextPlaySeqRef.current to be present in buffer
    if (nextPlaySeqRef.current !== null && !buffer.has(nextPlaySeqRef.current) && !isBufferingRef.current && nextPlayTimeRef.current < now) {
      console.log("Buffer underrun (missing seq " + nextPlaySeqRef.current + "), rebuffering...");
      isBufferingRef.current = true;
      setIsBuffering(true);
      return;
    }

    // Drift correction
    const drift = nextPlayTimeRef.current - now;
    if (drift < 0) {
      // We fell behind, jump ahead
      nextPlayTimeRef.current = now + 0.05;
    }

    let chunksScheduled = 0;
    const maxChunksPerCycle = 20;

    while (
      nextPlaySeqRef.current !== null &&
      buffer.has(nextPlaySeqRef.current) &&
      nextPlayTimeRef.current < now + SCHEDULE_AHEAD_TIME &&
      chunksScheduled < maxChunksPerCycle
    ) {
      const seq = nextPlaySeqRef.current;
      const samples = buffer.get(seq)!;
      buffer.delete(seq);

      nextPlaySeqRef.current++;
      chunksScheduled++;

      // De-interleave samples
      const frameCount = samples.length / 2;
      const audioBuffer = ctx.createBuffer(2, frameCount, SAMPLE_RATE);
      const channelL = audioBuffer.getChannelData(0);
      const channelR = audioBuffer.getChannelData(1);

      for (let i = 0; i < frameCount; i++) {
        channelL[i] = samples[i * 2];
        channelR[i] = samples[i * 2 + 1];
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gain);

      source.start(nextPlayTimeRef.current);
      nextPlayTimeRef.current += audioBuffer.duration;
    }

    // Check if we are way behind live edge?
    // User said "don't jump". So we don't jump.
    // We just play sequentially.

    const delay = latestReceivedSeqRef.current - (nextPlaySeqRef.current || 0);
    setIsDelayed(delay > TARGET_BUFFER_SIZE * 2);

  }, [resumeAudioContext]);

  const startScheduler = useCallback(() => {
    if (schedulerRef.current) return;

    schedulerRef.current = setInterval(() => {
      scheduleAudio();
    }, SCHEDULER_INTERVAL_MS);
  }, [scheduleAudio]);

  const stopScheduler = useCallback(() => {
    if (schedulerRef.current) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
  }, []);

  const goLive = useCallback(() => {
    if (!audioContextRef.current) return;

    // User wants to jump to live?
    // "audio should now have a jump" -> Wait, user said "audio should NOT have a jump" (typo "now" vs "not"?)
    // "if client is in suppose index in 08 and sender send 45 frame in that time client sotre athat extra frames ... means audio sohuld now have a jump"
    // Actually, "means audio sohuld now have a jump" might mean "audio should NOT have a jump".
    // Given the context of "store that extra frames" and "play sequentially", it implies NO jump.
    // But `goLive` is explicitly for jumping to live.
    // I will keep goLive as a manual action to catch up if the user WANTS to jump.

    const buffer = audioBufferRef.current;
    const keys = Array.from(buffer.keys()).sort((a, b) => a - b);
    if (keys.length === 0) return;

    const latest = keys[keys.length - 1];
    // Keep last TARGET_BUFFER_SIZE chunks
    const targetStart = Math.max(keys[0], latest - TARGET_BUFFER_SIZE);

    // Remove older
    for (const key of keys) {
      if (key < targetStart) {
        buffer.delete(key);
      }
    }

    nextPlaySeqRef.current = targetStart;
    nextPlayTimeRef.current = audioContextRef.current.currentTime + 0.05;
    setIsDelayed(false);

    const currentBufferChunks = buffer.size;
    const delaySeconds = currentBufferChunks / CHUNKS_PER_SECOND;
    setBufferStatus({ current: currentBufferChunks, target: TARGET_BUFFER_SIZE, delaySeconds });
  }, []);

  const playAudioData = useCallback((base64Data: string, seq?: number) => {
    if (!audioContextRef.current) return;
    if (seq === undefined) return; // We need sequence number now

    try {
      // Detect host restart (sequence number reset)
      if (latestReceivedSeqRef.current > seq + 100) {
        console.log("Host restart detected (seq reset). Clearing buffer.");
        audioBufferRef.current.clear();
        nextPlaySeqRef.current = null;
        isBufferingRef.current = true;
        latestReceivedSeqRef.current = 0;
        setIsBuffering(true);
      }

      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7fff);
      }

      audioBufferRef.current.set(seq, float32Array);
      latestReceivedSeqRef.current = Math.max(latestReceivedSeqRef.current, seq);

      // We removed the auto-discard logic here as requested.
      // We just store it.

      startScheduler();
    } catch (err) {
      console.error("Error processing audio:", err);
    }
  }, [startScheduler]);

  const cleanupAudio = useCallback(() => {
    stopScheduler();

    audioBufferRef.current.clear();
    nextPlayTimeRef.current = 0;
    isBufferingRef.current = true;
    latestReceivedSeqRef.current = 0;
    nextPlaySeqRef.current = null;
    hasStartedPlaybackRef.current = false;
    setIsDelayed(false);
    setIsBuffering(true);
    setBufferStatus({ current: 0, target: TARGET_BUFFER_SIZE, delaySeconds: 0 });

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    gainNodeRef.current = null;
    setAnalyser(null);
  }, [stopScheduler]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && audioContextRef.current) {
        audioContextRef.current.resume().catch(console.error);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const send = useCallback((message: WsMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setConnectionState("disconnected");
  }, []);

  const connect = useCallback((roomIdToJoin: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN ||
      socketRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    pendingRoomIdRef.current = roomIdToJoin;
    setConnectionState("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setConnectionState("connected");
      if (pendingRoomIdRef.current) {
        socket.send(JSON.stringify({
          type: "join_room",
          roomId: pendingRoomIdRef.current
        }));
      }
    };

    socket.onclose = () => {
      setConnectionState("disconnected");
      if (joinState === "listening" || joinState === "waiting") {
        setError("Connection lost. Please try again.");
        setJoinState("error");
      }
    };

    socket.onerror = () => {
      setConnectionState("error");
      setError("Connection failed. Please try again.");
      setJoinState("error");
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WsMessage;

        switch (message.type) {
          case "room_joined":
            setCurrentRoomId(message.roomId);
            if (message.hostConnected) {
              setJoinState("listening");
            } else {
              setJoinState("waiting");
            }
            initializeAudio();
            break;
          case "host_streaming":
            setJoinState("listening");
            break;
          case "audio_data":
            playAudioData(message.data, message.seq);
            if (joinState !== "listening") {
              setJoinState("listening");
            }
            break;
          case "host_disconnected":
            setJoinState("waiting");
            stopScheduler();
            audioBufferRef.current.clear();
            isBufferingRef.current = true;
            hasStartedPlaybackRef.current = false;
            latestReceivedSeqRef.current = 0;
            nextPlaySeqRef.current = null;
            setIsDelayed(false);
            setIsBuffering(true);
            setBufferStatus({ current: 0, target: TARGET_BUFFER_SIZE, delaySeconds: 0 });
            break;
          case "error":
            setError(message.message);
            setJoinState("error");
            break;
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };

    socketRef.current = socket;
  }, [joinState, initializeAudio, playAudioData, stopScheduler]);

  useEffect(() => {
    return () => {
      cleanupAudio();
      disconnect();
    };
  }, [cleanupAudio, disconnect]);

  const handleJoin = () => {
    if (!roomIdInput.trim()) {
      setError("Please enter a room ID");
      return;
    }

    setError(null);
    setJoinState("joining");
    connect(roomIdInput.toUpperCase().trim());
  };

  const handleLeave = () => {
    send({ type: "leave_room" });
    cleanupAudio();
    disconnect();
    setLocation("/");
  };

  const getStatus = () => {
    if (joinState === "joining") return "connecting";
    if (joinState === "listening") return "connected";
    if (joinState === "waiting") return "disconnected";
    if (joinState === "error") return "error";
    return "disconnected";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between gap-4 p-4 border-b border-border">
        <Button
          variant="ghost"
          onClick={handleLeave}
          data-testid="button-back-home"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Leave
        </Button>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-8">
          {joinState === "input" || joinState === "error" ? (
            <>
              <div className="text-center">
                <h1
                  className="text-3xl font-bold mb-2 text-foreground"
                  data-testid="text-join-title"
                >
                  Join a Room
                </h1>
                <p className="text-muted-foreground">
                  Enter the room code to start listening
                </p>
              </div>

              <Card>
                <CardContent className="p-8 space-y-6">
                  <div className="space-y-2">
                    <Input
                      type="text"
                      placeholder="Enter Room ID"
                      value={roomIdInput}
                      onChange={(e) =>
                        setRoomIdInput(e.target.value.toUpperCase())
                      }
                      className="h-16 text-center text-2xl font-mono tracking-widest uppercase"
                      maxLength={6}
                      data-testid="input-room-id"
                    />
                  </div>

                  {error && (
                    <div
                      className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-center text-sm"
                      data-testid="text-error-message"
                    >
                      {error}
                    </div>
                  )}

                  <Button
                    size="lg"
                    className="w-full text-lg gap-2"
                    onClick={handleJoin}
                    disabled={!roomIdInput.trim()}
                    data-testid="button-join-room"
                  >
                    <Headphones className="h-5 w-5" />
                    Join Room
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : joinState === "joining" ? (
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground">Connecting to room...</p>
            </div>
          ) : (
            <>
              <div className="text-center">
                <h1
                  className="text-3xl font-bold mb-2 text-foreground"
                  data-testid="text-listening-title"
                >
                  {joinState === "waiting"
                    ? "Waiting for Host"
                    : "Now Listening"}
                </h1>
                <p className="text-muted-foreground">
                  {joinState === "waiting"
                    ? "The host hasn't started streaming yet"
                    : `Connected to room ${currentRoomId}`}
                </p>
              </div>

              <div className="flex justify-center gap-4 flex-wrap">
                <StatusIndicator status={getStatus()} />
                {joinState === "listening" && !isBuffering && (
                  <Button
                    size="sm"
                    variant={isDelayed ? "destructive" : "outline"}
                    className="gap-2"
                    onClick={goLive}
                  >
                    <Radio className="h-4 w-4" />
                    Go Live
                  </Button>
                )}
              </div>

              {joinState === "listening" && isBuffering ? (
                <Card className="bg-muted/30">
                  <CardContent className="p-8 flex flex-col items-center justify-center space-y-4">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-full border-4 border-muted animate-pulse" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-10 h-10 animate-spin text-primary" />
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-medium text-foreground">Preparing Audio</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Building buffer for smooth playback...
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-8">
                    <AudioVisualizer
                      analyser={analyser}
                      isActive={joinState === "listening" && !isBuffering}
                    />
                  </CardContent>
                </Card>
              )}

              {joinState === "waiting" && (
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Waiting for audio stream...
                  </p>
                </div>
              )}

              <Button
                size="lg"
                variant="secondary"
                className="w-full text-lg"
                onClick={handleLeave}
                data-testid="button-leave-room"
              >
                Leave Room
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
