export class Logger {
    private enabled: boolean;
    
    constructor(enabled: boolean = false) {
      this.enabled = enabled;
    }
    
    debug(message: string): void {
      if (this.enabled) {
        console.log(`[DEBUG] ${message}`);
      }
    }
    
    info(message: string): void {
      console.log(`[INFO] ${message}`);
    }
    
    warn(message: string): void {
      console.warn(`[WARN] ${message}`);
    }
    
    error(message: string): void {
      console.error(`[ERROR] ${message}`);
    }
  }