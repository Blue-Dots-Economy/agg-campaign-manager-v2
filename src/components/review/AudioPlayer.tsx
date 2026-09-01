import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, MicOff, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src?: string;
  companyName?: string;
  duration?: number;
  datetime?: string;
}

const SPEED_KEY = "audio_playback_speed";
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Deterministic pseudo-random bar heights
const BARS = Array.from({ length: 56 }, (_, i) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  const r = x - Math.floor(x);
  return 20 + Math.floor(r * 80); // 20-100%
});

export function AudioPlayer({ src, companyName, duration, datetime }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [dur, setDur] = useState<number>(duration || 0);
  const [speed, setSpeed] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const v = Number(window.localStorage.getItem(SPEED_KEY));
    return SPEEDS.includes(v) ? v : 1;
  });
  const [speedOpen, setSpeedOpen] = useState(false);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = speed;
    try { window.localStorage.setItem(SPEED_KEY, String(speed)); } catch { /* ignore */ }
  }, [speed]);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
  }, [src]);

  const pct = useMemo(() => (dur > 0 ? (current / dur) * 100 : 0), [current, dur]);

  if (!src) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
        <MicOff className="h-5 w-5" />
        <span>No recording available</span>
      </div>
    );
  }

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play(); else a.pause();
  };

  const seek = (v: number) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    a.currentTime = (v / 100) * dur;
    setCurrent(a.currentTime);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      {(companyName || datetime) && (
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{companyName}</span>
          <span>{datetime}</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 pl-0.5" />}
        </button>

        <div className="relative flex-1">
          <div className="flex h-10 items-end gap-[2px]">
            {BARS.map((h, i) => {
              const active = (i / BARS.length) * 100 <= pct;
              return (
                <div
                  key={i}
                  className={cn("flex-1 rounded-sm transition-colors", active ? "bg-primary" : "bg-muted-foreground/25")}
                  style={{ height: `${h}%` }}
                />
              );
            })}
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={pct}
            onChange={(e) => seek(Number(e.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Seek"
          />
        </div>

        <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
          {fmt(current)} / {fmt(dur)}
        </span>

        <div className="relative">
          <button
            type="button"
            onClick={() => setSpeedOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
          >
            <Gauge className="h-3 w-3" />
            {speed}x
          </button>
          {speedOpen && (
            <div className="absolute bottom-full right-0 z-50 mb-1 w-20 overflow-hidden rounded-md border border-border bg-popover shadow-md">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSpeed(s); setSpeedOpen(false); }}
                  className={cn("block w-full px-2 py-1 text-left text-xs hover:bg-muted", s === speed && "bg-muted font-semibold")}
                >
                  {s}x
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || duration || 0)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}
