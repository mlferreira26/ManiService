const preferenceKey = "mani-chat-sound-enabled";
let audioContext: AudioContext | null = null;

export function chatSoundEnabled() {
  return typeof window !== "undefined" && window.localStorage.getItem(preferenceKey) === "true";
}

export function setChatSoundEnabled(enabled: boolean) {
  if (typeof window !== "undefined") window.localStorage.setItem(preferenceKey, String(enabled));
}

export function playChatNotificationSound() {
  if (!chatSoundEnabled() || typeof window === "undefined") return;
  try {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    audioContext ||= new AudioContextConstructor();
    if (audioContext.state === "suspended") void audioContext.resume().catch(() => undefined);
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, audioContext.currentTime);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.19);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch {
    // Browser audio can be unavailable or blocked until a user gesture.
  }
}
