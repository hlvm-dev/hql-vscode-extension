import {
    TextDocument,
    TextDocumentPositionParams,
    Location,
    Position,
    Range
  } from 'vscode-languageserver';
  
  import { SymbolManager } from './symbolManager';
  import * as path from 'path';
  import * as fs from 'fs';
  
  /**
   * DefinitionProvider handles go-to-definition requests
   */
  export class DefinitionProvider {
    private symbolManager: SymbolManager;
    
    constructor(symbolManager: SymbolManager) {
      this.symbolManager = symbolManager;
    }
    
    /**
     * Provide definition location for a symbol at position
     */
    public async provideDefinition(params: TextDocumentPositionParams): Promise<Location | null> {
      try {
        const document = await this.symbolManager.getDocument(params.textDocument.uri);
        if (!document) {
          return null;
        }
  
        const position = params.position;
        const wordRange = this.getWordRangeAtPosition(document, position);
        
        if (!wordRange) {
          return null;
        }
        
        const word = document.getText(wordRange);
        const symbols = this.symbolManager.getDocumentSymbols(params.textDocument.uri);
        
        // Look for matching symbols
        for (const symbol of symbols) {
          if (symbol.name === word) {
            return symbol.location;
          }
          
          // Check for namespace members (e.g., namespace.member)
          if (word.includes('.')) {
            const [namespace, member] = word.split('.');
            if (symbol.name === `${namespace}.${member}`) {
              return symbol.location;
            }
          }
          
          // Check for enum members
          if (symbol.data?.enumName && symbol.name === word) {
            return symbol.location;
          }
        }
        
        // Check for imported symbols
        for (const symbol of symbols) {
          if (symbol.data?.sourceModule && symbol.name === word) {
            // We need to find the original symbol in the source module
            const sourceModule = symbol.data.sourceModule;
            
            // TODO: Implement resolving the module path and looking up the symbol in that module
            // This would require tracking imported symbols and their source modules
            
            // For now, return the import statement location as a fallback
            return symbol.location;
          }
        }
        
        return null;
      } catch (error) {
        console.error(`Error providing definition: ${error}`);
        return null;
      }
    }
    
    /**
     * Get the word range at a position
     */
    private getWordRangeAtPosition(document: TextDocument, position: Position): Range | null {
      const text = document.getText();
      const line = text.split('\n')[position.line];
      
      if (!line || position.character >= line.length) {
        return null;
      }
      
      // Find the start of the current word
      let startChar = position.character;
      while (startChar > 0) {
        const char = line[startChar - 1];
        if (!/[\w\d\-\.\?]/.test(char)) {
          break;
        }
        startChar--;
      }
      
      // Find the end of the current word
      let endChar = position.character;
      while (endChar < line.length) {
        const char = line[endChar];
        if (!/[\w\d\-\.\?]/.test(char)) {
          break;
        }
        endChar++;
      }
      
      if (startChar === endChar) {
        return null;
      }
      
      return {
        start: { line: position.line, character: startChar },
        end: { line: position.line, character: endChar }
      };
    }
  }