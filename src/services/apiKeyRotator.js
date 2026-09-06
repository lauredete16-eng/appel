const API_KEYS = [
  import.meta.env.VITE_DECART_API_KEY_1,
  import.meta.env.VITE_DECART_API_KEY_2,
  import.meta.env.VITE_DECART_API_KEY_3,
  import.meta.env.VITE_DECART_API_KEY_4,
  import.meta.env.VITE_DECART_API_KEY_5,
].filter(Boolean);

let currentIndex = 0;

export function getCurrentApiKey() {
  if (API_KEYS.length === 0) {
    throw new Error("Aucune clé API Decart configurée.");
  }
  return API_KEYS[currentIndex];
}

export function rotateToNextKey() {
  currentIndex = (currentIndex + 1) % API_KEYS.length;
  console.warn(`🔄 Rotation vers la clé API Decart #${currentIndex + 1}`);
  return API_KEYS[currentIndex];
}

export function totalKeys() {
  return API_KEYS.length;
}