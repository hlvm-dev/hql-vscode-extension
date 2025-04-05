/**
 * Simple logger class for HQL LSP extension
 */
export class Logger {
  private enabled: boolean;
  
  /**
   * Create a new logger
   * @param enabled Whether debug logging is enabled
   */
  constructor(enabled: boolean = false) {
    this.enabled = enabled;
  }
  
  /**
   * Log a debug message (only when debug logging is enabled)
   * @param message The message to log
   */
  debug(message: string): void {
    if (this.enabled) {
      console.log(`[HQL:DEBUG] ${message}`);
    }
  }
  
  /**
   * Log an informational message
   * @param message The message to log
   */
  info(message: string): void {
    console.log(`[HQL:INFO] ${message}`);
  }
  
  /**
   * Log a warning message
   * @param message The message to log
   */
  warn(message: string): void {
    console.warn(`[HQL:WARN] ${message}`);
  }
  
  /**
   * Log an error message
   * @param message The message to log
   */
  error(message: string): void {
    console.error(`[HQL:ERROR] ${message}`);
  }
}