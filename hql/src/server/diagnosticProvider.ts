import {
  TextDocument,
  Connection
} from 'vscode-languageserver';

import { SymbolManager } from './symbolManager';
import { ValidatorManager } from './validator/validatorManager';

/**
 * DiagnosticsProvider handles validation and errors in HQL files
 */
export class DiagnosticsProvider {
  private symbolManager: SymbolManager;
  private validatorManager: ValidatorManager;
  
  constructor(symbolManager: SymbolManager) {
    this.symbolManager = symbolManager;
    this.validatorManager = new ValidatorManager(symbolManager);
  }
  
  /**
   * Validate a text document and send diagnostics
   */
  public async validateTextDocument(
    textDocument: TextDocument, 
    connection: Connection,
    thorough: boolean = false
  ): Promise<void> {
    try {
      await this.validatorManager.validateTextDocument(textDocument, connection, thorough);
    } catch (error) {
      console.error(`Error validating document: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}