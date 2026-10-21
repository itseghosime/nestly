const STORAGE_KEY = 'nestly.staff.notification-sound';
let audioContext: AudioContext | null = null;

export function isNotificationSoundEnabled() {
  return window.localStorage.getItem(STORAGE_KEY) === 'enabled';
}

export function setNotificationSoundEnabled(enabled: boolean) {
  window.localStorage.setItem(STORAGE_KEY, enabled ? 'enabled' : 'disabled');
}

export async function activateNotificationSound() {
  if (!('AudioContext' in window)) return false;
  audioContext ||= new window.AudioContext();
  if (audioContext.state !== 'running') await audioContext.resume();
  return audioContext.state === 'running';
}

export function playNotificationSound() {
  if (!audioContext || audioContext.state !== 'running') return false;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(740, audioContext.currentTime);
  gain.gain.setValueAtTime(0.035, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.12);
  return true;
}
