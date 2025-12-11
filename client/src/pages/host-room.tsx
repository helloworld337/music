import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, StopCircle, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatusIndicator } from "@/components/status-indicator";
import { RoomIdDisplay } from "@/components/room-id-display";
import { ParticipantCount } from "@/components/participant-count";
import { AudioVisualizer } from "@/components/audio-visualizer";
import { useWebSocket } from "@/hooks/use-websocket";
import type { WsMessage } from "@shared/schema";

type HostState = "idle" | "selecting" | "streaming" | "error";

const SAMPLE_RATE = 48000;
const BUFFER_SIZE = 4096;

export default function HostRoom() {
  const [, setLocation] = useLocation();
  const [hostState, setHostState] = useState<HostState>("idle");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [listenerCount, setListenerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sendRef = useRef<((msg: WsMessage) => void) | null>(null);
  const sequenceRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const handleMessage = useCallback((message: WsMessage) => {
    switch (message.type) {
      case "room_created":
        setRoomId(message.roomId);
        setHostState("selecting");
        break;
      case "listener_count":
        setListenerCount(message.count);
        break;
      case "error":
        setError(message.message);
        setHostState("error");
        break;
    }
  }, []);

  const { connectionState, connect, disconnect, send } = useWebSocket({
    onMessage: handleMessage,
    onOpen: () => {
      send({ type: "create_room" });
    },
    onClose: () => {
      if (hostState === "streaming") {
        setHostState("error");
        setError("Connection lost. Please try again.");
      }
    },
  });

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    connect();
    return () => {
      stopStreaming();
      disconnect();
    };
  }, []);

  const startTabCapture = async () => {
    try {
      setHostState("selecting");

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: SAMPLE_RATE,
        },
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getVideoTracks().forEach((track) => track.stop());
        setError(
          "No audio track found. Please make sure to check 'Share audio' when selecting the tab."
        );
        setHostState("error");
        return;
      }

      stream.getVideoTracks().forEach((track) => track.stop());

      const audioStream = new MediaStream(audioTracks);
      mediaStreamRef.current = audioStream;

      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(audioStream);

      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;
      source.connect(analyserNode);
      setAnalyser(analyserNode);

      const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 2, 2);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(audioContext.destination);

      sequenceRef.current = 0;
      startTimeRef.current = Date.now();

      const CHUNK_DURATION_SECONDS = 10;
      const SAMPLES_PER_CHUNK = SAMPLE_RATE * CHUNK_DURATION_SECONDS;
      const accumulatedChunks: Float32Array[] = [];
      let accumulatedSamples = 0;

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!sendRef.current) return;

        const inputL = e.inputBuffer.getChannelData(0);
        const inputR = e.inputBuffer.getChannelData(1);

        // Interleave channels: L, R, L, R...
        const interleaved = new Float32Array(inputL.length * 2);
        for (let i = 0; i < inputL.length; i++) {
          interleaved[i * 2] = inputL[i];
          interleaved[i * 2 + 1] = inputR[i];
        }

        const chunk = interleaved;
        accumulatedChunks.push(chunk);
        accumulatedSamples += inputL.length; // Count frames (samples per channel)

        if (accumulatedSamples >= SAMPLES_PER_CHUNK) {
          // Merge chunks
          const totalLength = accumulatedChunks.reduce((acc, c) => acc + c.length, 0);
          const merged = new Float32Array(totalLength);
          let offset = 0;
          for (const c of accumulatedChunks) {
            merged.set(c, offset);
            offset += c.length;
          }

          // Convert to Int16
          const int16Array = new Int16Array(merged.length);
          for (let i = 0; i < merged.length; i++) {
            const s = Math.max(-1, Math.min(1, merged[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }

          // Convert to Base64
          const uint8Array = new Uint8Array(int16Array.buffer);
          const len = uint8Array.length;
          // Use a more efficient way to convert large array to string to avoid stack overflow
          // String.fromCharCode.apply(null, uint8Array) can fail on large arrays
          let binary = "";
          const chunkSize = 0x8000; // 32k chunks
          for (let i = 0; i < len; i += chunkSize) {
            binary += String.fromCharCode.apply(null, Array.from(uint8Array.subarray(i, i + chunkSize)));
          }

          const base64 = btoa(binary);

          sendRef.current({
            type: "audio_data",
            data: base64,
            seq: sequenceRef.current++,
            timestamp: Date.now() - startTimeRef.current
          });

          // Reset buffer
          accumulatedChunks.length = 0;
          accumulatedSamples = 0;
        }
      };

      setHostState("streaming");
      setError(null);

      audioTracks[0].onended = () => {
        stopStreaming();
        setHostState("idle");
      };
    } catch (err) {
      console.error("Error capturing tab audio:", err);
      if ((err as Error).name === "NotAllowedError") {
        setError("Permission denied. Please allow screen sharing to continue.");
      } else {
        setError("Failed to capture audio. Please try again.");
      }
      setHostState("error");
    }
  };

  const stopStreaming = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      mediaStreamRef.current = null;
    }

    setAnalyser(null);
    setHostState("idle");
  };

  const handleLeave = () => {
    stopStreaming();
    send({ type: "leave_room" });
    disconnect();
    setLocation("/");
  };

  const getStatus = () => {
    if (connectionState === "connecting") return "connecting";
    if (hostState === "streaming") return "live";
    if (hostState === "error") return "error";
    if (connectionState === "connected") return "connected";
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
        <div className="w-full max-w-2xl space-y-8">
          <div className="text-center">
            <h1
              className="text-3xl font-bold mb-2 text-foreground"
              data-testid="text-host-title"
            >
              Host Room
            </h1>
            <p className="text-muted-foreground">
              Share your audio with others in real-time
            </p>
          </div>

          {roomId && <RoomIdDisplay roomId={roomId} />}

          <div className="flex items-center justify-center gap-6 flex-wrap">
            <StatusIndicator status={getStatus()} />
            {hostState === "streaming" && (
              <ParticipantCount count={listenerCount} />
            )}
          </div>

          <Card>
            <CardContent className="p-8">
              <AudioVisualizer
                analyser={analyser}
                isActive={hostState === "streaming"}
              />
            </CardContent>
          </Card>

          {error && (
            <div
              className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-center"
              data-testid="text-error-message"
            >
              {error}
            </div>
          )}

          <div className="flex justify-center gap-4">
            {hostState === "idle" || hostState === "selecting" ? (
              <Button
                size="lg"
                className="text-lg gap-2"
                onClick={startTabCapture}
                disabled={connectionState !== "connected"}
                data-testid="button-start-sharing"
              >
                <Volume2 className="h-5 w-5" />
                {hostState === "selecting"
                  ? "Select Tab to Share"
                  : "Start Sharing Audio"}
              </Button>
            ) : hostState === "streaming" ? (
              <Button
                size="lg"
                variant="destructive"
                className="text-lg gap-2"
                onClick={stopStreaming}
                data-testid="button-stop-sharing"
              >
                <StopCircle className="h-5 w-5" />
                Stop Sharing
              </Button>
            ) : null}

            {hostState === "error" && (
              <Button
                size="lg"
                className="text-lg"
                onClick={() => {
                  setError(null);
                  setHostState("idle");
                }}
                data-testid="button-try-again"
              >
                Try Again
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
