/**
 * Session storage utility using XOR-based obfuscation
 * Stores encrypted session data in localStorage with expiration
 * Uses localStorage for better mobile browser compatibility
 */

const SESSION_KEY = 'wedding_session';
const EXPIRATION_KEY = 'wedding_session_expires';

/**
 * Simple XOR-based obfuscation
 * Provides basic obfuscation for session data
 */
function simpleXorEncode(data: string, key: string): string {
  let result = '';
  for (let i = 0; i < data.length; i++) {
    result += String.fromCharCode(
      data.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return btoa(result);
}

function simpleXorDecode(encoded: string, key: string): string {
  try {
    const data = atob(encoded);
    let result = '';
    for (let i = 0; i < data.length; i++) {
      result += String.fromCharCode(
        data.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    return result;
  } catch (error) {
    throw new Error('Failed to decode session data');
  }
}

/**
 * Generates a device-specific key for XOR encoding
 */
function generateSimpleKey(): string {
  // Create a device-specific key from user agent and hostname
  const baseKey = `${navigator.userAgent}_${window.location.hostname}_wedding_session_2025`;
  // Simple hash-like function to create a consistent key
  let hash = 0;
  for (let i = 0; i < baseKey.length; i++) {
    const char = baseKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to a string key
  return Math.abs(hash).toString(36) + baseKey.substring(0, 16);
}

/**
 * Saves session data to localStorage with XOR obfuscation
 * @param name - User's name
 * @param password - User's password (will be obfuscated)
 * @param expirationHours - Hours until session expires (default: 24)
 */
export async function saveSession(
  name: string,
  password: string,
  expirationHours: number = 24
): Promise<void> {
  try {
    // Use localStorage for better mobile browser compatibility
    if (typeof localStorage === 'undefined') {
      console.warn('localStorage not available, session persistence disabled');
      return;
    }

    // Create session data object
    const sessionData = JSON.stringify({
      name: name.trim(),
      password: password,
      timestamp: Date.now(),
    });

    // Encode the session data using XOR
    const simpleKey = generateSimpleKey();
    const encoded = simpleXorEncode(sessionData, simpleKey);

    // Calculate expiration timestamp
    const expirationTime = Date.now() + expirationHours * 60 * 60 * 1000;

    // Store encoded data and expiration
    try {
      localStorage.setItem(SESSION_KEY, encoded);
      localStorage.setItem(EXPIRATION_KEY, expirationTime.toString());
    } catch (storageError) {
      console.error('Failed to save session to storage:', storageError);
      // If storage quota exceeded, try to clear old sessions
      try {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(EXPIRATION_KEY);
        localStorage.setItem(SESSION_KEY, encoded);
        localStorage.setItem(EXPIRATION_KEY, expirationTime.toString());
      } catch (retryError) {
        console.error('Failed to save session after retry:', retryError);
      }
    }
  } catch (error) {
    console.error('Failed to save session:', error);
    // Silently fail - user can still use the app without session persistence
  }
}

/**
 * Retrieves and decodes session data if valid
 * @returns Session data or null if session is invalid/expired
 */
export async function getSession(): Promise<{ name: string; password: string } | null> {
  try {
    // Use localStorage for better mobile browser compatibility
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const encodedData = localStorage.getItem(SESSION_KEY);
    const expirationStr = localStorage.getItem(EXPIRATION_KEY);

    if (!encodedData || !expirationStr) {
      return null;
    }

    // Check if session has expired
    const expirationTime = parseInt(expirationStr, 10);
    if (isNaN(expirationTime) || Date.now() > expirationTime) {
      // Session expired, clear it
      clearSession();
      return null;
    }

    // Decode the session data using XOR
    const simpleKey = generateSimpleKey();
    const decrypted = simpleXorDecode(encodedData, simpleKey);
    const sessionData = JSON.parse(decrypted);

    return {
      name: sessionData.name,
      password: sessionData.password,
    };
  } catch (error) {
    // If anything fails, clear the session and return null
    console.error('Failed to get session:', error);
    clearSession();
    return null;
  }
}

/**
 * Checks if a valid session exists
 * @returns true if session exists and hasn't expired
 */
export async function isSessionValid(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

/**
 * Clears the session from localStorage
 */
export function clearSession(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(EXPIRATION_KEY);
    }
    // Also clear from sessionStorage if it exists (for migration)
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(EXPIRATION_KEY);
    }
  } catch (error) {
    console.error('Failed to clear session:', error);
  }
}
