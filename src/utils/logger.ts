/**
 * Simple logger utility for debugging
 */

// Log levels
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

// Current log level - change this to control verbosity
const currentLogLevel = LogLevel.DEBUG;

// Whether to log to console
const enableConsoleLogging = true;

// Whether to store logs in localStorage
const enableLocalStorageLogs = true;
const MAX_LOG_ENTRIES = 100;
const LOG_STORAGE_KEY = 'app_debug_logs';

const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

/**
 * Log a debug message
 */
export function debug(component: string, message: string, data?: any): void {
  logWithLevel(LogLevel.DEBUG, component, message, data);
}

/**
 * Log an info message
 */
export function info(component: string, message: string, data?: any): void {
  logWithLevel(LogLevel.INFO, component, message, data);
}

/**
 * Log a warning message
 */
export function warn(component: string, message: string, data?: any): void {
  logWithLevel(LogLevel.WARN, component, message, data);
}

/**
 * Log an error message
 */
export function error(component: string, message: string, data?: any): void {
  logWithLevel(LogLevel.ERROR, component, message, data);
}

/**
 * Internal function to log with a specific level
 */
function logWithLevel(level: LogLevel, component: string, message: string, data?: any): void {
  // Skip if below current log level
  if (level < currentLogLevel) return;

  const timestamp = new Date().toISOString();
  const levelString = Object.keys(LogLevel).find(key => LogLevel[key as keyof typeof LogLevel] === level) || 'UNKNOWN';
  const logEntry = {
    timestamp,
    level: levelString,
    component,
    message,
    data: data !== undefined ? JSON.stringify(data) : undefined
  };

  // Log to console if enabled
  if (enableConsoleLogging) {
    const logMessage = `[${timestamp}] [${levelString}] [${component}] ${message}`;
    
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(logMessage, data);
        break;
      case LogLevel.INFO:
        console.info(logMessage, data);
        break;
      case LogLevel.WARN:
        console.warn(logMessage, data);
        break;
      case LogLevel.ERROR:
        console.error(logMessage, data);
        break;
    }
  }

  // Store in localStorage if enabled and in a browser environment
  if (enableLocalStorageLogs && isBrowser) {
    try {
      const logsJson = localStorage.getItem(LOG_STORAGE_KEY) || '[]';
      const logs = JSON.parse(logsJson);
      logs.push(logEntry);
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs.slice(-MAX_LOG_ENTRIES)));
    } catch (e) {
      console.error('Failed to store log in localStorage:', e);
    }
  }
}

/**
 * Get all stored logs
 */
export function getLogs(): any[] {
  if (!isBrowser) return [];
  try {
    const logsJson = localStorage.getItem(LOG_STORAGE_KEY) || '[]';
    return JSON.parse(logsJson);
  } catch (e) {
    console.error('Failed to retrieve logs from localStorage:', e);
    return [];
  }
}

/**
 * Clear all stored logs
 */
export function clearLogs(): void {
  if (!isBrowser) return;
  try {
    localStorage.removeItem(LOG_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear logs from localStorage:', e);
  }
}