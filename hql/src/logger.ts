/**
 * Log levels to control verbosity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

/**
 * Simple logger class for HQL LSP extension
 */
export class Logger {
  private enabled: boolean;
  private level: LogLevel;
  
  /**
   * Create a new logger
   * @param enabled Whether debug logging is enabled
   * @param level Minimum log level to display (defaults to INFO)
   */
  constructor(enabled: boolean = false, level: LogLevel = LogLevel.INFO) {
    this.enabled = enabled;
    this.level = level;
  }
  
  /**
   * Set the log level
   * @param level The new log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }
  
  /**
   * Enable or disable the logger
   * @param enabled Whether the logger should be enabled
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  /**
   * Log a debug message (only when debug logging is enabled and level <= DEBUG)
   * @param message The message to log
   */
  debug(message: string): void {
    if (this.enabled && this.level <= LogLevel.DEBUG) {
      console.log(`[HQL:DEBUG] ${message}`);
    }
  }
  
  /**
   * Log an informational message (only when level <= INFO)
   * @param message The message to log
   */
  info(message: string): void {
    if (this.level <= LogLevel.INFO) {
      console.log(`[HQL:INFO] ${message}`);
    }
  }
  
  /**
   * Log a warning message (only when level <= WARN)
   * @param message The message to log
   */
  warn(message: string): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[HQL:WARN] ${message}`);
    }
  }
  
  /**
   * Log an error message (only when level <= ERROR)
   * @param message The message to log
   */
  error(message: string): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[HQL:ERROR] ${message}`);
    }
  }
}