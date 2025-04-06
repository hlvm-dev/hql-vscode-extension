import * as vscode from 'vscode';

/**
 * Configuration manager for HQL extension settings
 * Centralizes access to configuration values
 */
export class ConfigManager {
  private static instance: ConfigManager;
  // Event emitter for config changes
  private _onDidChangeConfiguration = new vscode.EventEmitter<void>();
  public readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

  private constructor() {
    // Private constructor for singleton pattern
    
    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('hql')) {
        this._onDidChangeConfiguration.fire();
      }
    });
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Get a configuration value
   * @param key The configuration key
   * @param defaultValue The default value if not found
   */
  public get<T>(key: string, defaultValue: T): T {
    return vscode.workspace.getConfiguration('hql').get<T>(key, defaultValue);
  }

  /**
   * Update a configuration value
   * @param key The configuration key
   * @param value The new value
   * @param global Whether to update globally or workspace
   */
  public async update<T>(key: string, value: T, global: boolean = false): Promise<void> {
    await vscode.workspace.getConfiguration('hql').update(key, value, global);
  }

  /**
   * Get the REPL server URL
   */
  public getServerUrl(): string {
    return this.get<string>('server.url', 'http://localhost:5100');
  }

  /**
   * Get whether to auto-start the REPL server
   */
  public shouldAutoStartServer(): boolean {
    return this.get<boolean>('server.autoStart', false);
  }

  /**
   * Get the server start timeout in milliseconds
   */
  public getServerStartTimeout(): number {
    return this.get<number>('server.startTimeout', 10000);
  }

  /**
   * Get whether paredit is enabled
   */
  public isPareEditEnabled(): boolean {
    return this.get<boolean>('paredit.enabled', true);
  }

  /**
   * Get whether to show evaluation results inline
   */
  public showInlineEvaluation(): boolean {
    return this.get<boolean>('evaluation.showInline', true);
  }

  /**
   * Get the evaluation timeout in milliseconds
   */
  public getEvaluationTimeout(): number {
    return this.get<number>('evaluation.timeout', 10000);
  }

  /**
   * Get parentheses colors for rainbow parentheses
   */
  public getParenthesesColors(): string[] {
    return this.get<string[]>('theme.parenthesesColors', ['#8000ff', '#ff0000', '#0000ff']);
  }
  
  /**
   * Get indentation size for formatting
   */
  public getIndentSize(): number {
    return this.get<number>('format.indentSize', 2);
  }
  
  /**
   * Get whether to align parameters in function calls
   */
  public shouldAlignParameters(): boolean {
    return this.get<boolean>('format.alignParameters', true);
  }
  
  /**
   * Get whether to include imported symbols in completion suggestions
   */
  public includeImportedCompletions(): boolean {
    return this.get<boolean>('completions.includeImported', true);
  }
  
  /**
   * Get whether debug logging is enabled
   */
  public isDebugEnabled(): boolean {
    return this.get<boolean>('debug.enabled', false);
  }
}

// Export a pre-created instance for easy imports
export const config = ConfigManager.getInstance();