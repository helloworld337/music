import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
}

export function AudioVisualizer({ analyser, isActive }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      ctx.clearRect(0, 0, width, height);

      if (!isActive || !analyser) {
        // Draw idle state - gentle wave
        const time = Date.now() / 1000;
        ctx.beginPath();
        ctx.strokeStyle = "hsl(var(--muted-foreground) / 0.3)";
        ctx.lineWidth = 2;

        for (let x = 0; x < width; x++) {
          const y =
            height / 2 + Math.sin((x / width) * 4 + time * 2) * (height * 0.1);
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();

        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      // Active audio visualization
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      const barWidth = (width / bufferLength) * 2.5;
      const barGap = 2;
      let x = 0;

      // Get CSS variable for primary color
      const primaryColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim();

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height * 0.8;

        // Gradient from primary to accent
        const hue = 262 + (i / bufferLength) * 30;
        ctx.fillStyle = `hsl(${hue} 83% 58% / ${0.6 + (dataArray[i] / 255) * 0.4})`;

        const barY = (height - barHeight) / 2;
        ctx.fillRect(x, barY, barWidth - barGap, barHeight);

        x += barWidth;
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isActive]);

  return (
    <div className="w-full h-32 rounded-xl bg-muted/30 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        data-testid="canvas-audio-visualizer"
      />
    </div>
  );
}
