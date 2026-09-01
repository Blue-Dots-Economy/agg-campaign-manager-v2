let el: HTMLAudioElement | null = null;
export function playSwoosh() {
  try {
    if (typeof window === "undefined") return;
    if (!el) {
      el = new Audio("/mail-sent.mp3");
      el.preload = "auto";
      el.volume = 0.5;
    }
    el.currentTime = 0;
    void el.play();
  } catch { /* ignore */ }
}
