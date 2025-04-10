import {
    TextDocument
} from 'vscode-languageserver-textdocument';

import {
    Position,
    CompletionItem,
    CompletionItemKind,
    MarkupKind,
    CompletionParams,
    InsertTextFormat,
    Range
} from 'vscode-languageserver';
import { SymbolManager } from '../symbolManager';
import { getCompletionKindForSymbol } from './core';
import { generateFunctionCallCompletions }from "./fn"
/**
   * Get completions from document symbols (functions, variables, etc),
   * filtered to avoid duplicating template items
   */
  export function getDocumentSymbolCompletions(
    document: TextDocument,
    position: Position,
    word: string,
    symbolManager: SymbolManager
  ): CompletionItem[] {
    const completions: CompletionItem[] = [];
    
    const symbols = symbolManager.getDocumentSymbols(document.uri);
    
    for (const symbol of symbols) {
      // Filter out symbols that don't match the current word prefix
      if (word && !symbol.name.toLowerCase().startsWith(word.toLowerCase())) {
        continue;
      }
      
      // Get completion kind based on symbol kind
      const kind = getCompletionKindForSymbol(symbol.kind);
      
      // Skip enum members when suggesting at top level
      // (they should be suggested via dot notation)
      if (symbol.kind === 11 && symbol.name.includes('.')) {
        continue;
      }
      
      // Create documentation
      let documentation = '';
      if (symbol.data?.documentation) {
        documentation = symbol.data.documentation;
      }
      
      // Create detail string
      let detail = '';
      if (symbol.kind === 12 || symbol.kind === 6) { // Function or Method
        // Build parameter details for functions and methods
        if (symbol.data?.params) {
          const params = symbol.data.params.map(p => 
            p.defaultValue 
              ? `${p.name}: ${p.type} = ${p.defaultValue}` 
              : `${p.name}: ${p.type}`
          ).join(' ');
          
          detail = `(${symbol.name} ${params})`;
          if (symbol.data.returnType) {
            detail += ` -> ${symbol.data.returnType}`;
          }
        }
      } else if (symbol.kind === 13) { // Variable
        if (symbol.data?.type) {
          detail = `${symbol.name}: ${symbol.data.type}`;
        } else {
          detail = symbol.name;
        }
      } else if (symbol.kind === 10) { // Enum
        detail = `enum ${symbol.name}`;
      } else if (symbol.kind === 5) { // Class
        detail = `class ${symbol.name}`;
      } else {
        detail = symbol.name;
      }
      
      // For functions (fn/fx), generate multiple calling pattern completions
      if (symbol.kind === 12 || symbol.kind === 6) { // Function or Method
        // Generate function call patterns
        const functionCompletions = generateFunctionCallCompletions(document, position, symbol.name, symbolManager);
        if (functionCompletions.length > 0) {
          completions.push(...functionCompletions);
          continue; // Skip the default completion for this function
        }
      }
      
      // Create the default completion item for non-function symbols
      const completionItem: CompletionItem = {
        label: symbol.name,
        kind: kind,
        detail: detail,
        documentation: documentation ? {
          kind: MarkupKind.Markdown,
          value: documentation
        } : undefined,
        data: {
          ...symbol.data,
          uri: document.uri,
          name: symbol.name
        }
      };
      
      // Add sort text to control sorting
      switch (symbol.kind) {
        case 12: // Function
          completionItem.sortText = `20-${symbol.name}`;
          break;
        case 6: // Method
          completionItem.sortText = `21-${symbol.name}`;
          break;
        case 5: // Class
          completionItem.sortText = `30-${symbol.name}`;
          break;
        case 10: // Enum
          completionItem.sortText = `40-${symbol.name}`;
          break;
        case 13: // Variable
          completionItem.sortText = `50-${symbol.name}`;
          break;
        default:
          completionItem.sortText = `90-${symbol.name}`;
      }
      
      completions.push(completionItem);
    }
    
    return completions;
  }