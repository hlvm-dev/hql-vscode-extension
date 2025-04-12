// src/paredit/auto-close-pairs.ts
import * as vscode from 'vscode';

/**
 * Register handlers for auto-closing pairs
 */
export function registerAutoClosePairsHandler(context: vscode.ExtensionContext): void {
  // Handle auto-pairing of delimiters
  context.subscriptions.push(
    vscode.languages.registerOnTypeFormattingEditProvider('hql', {
      provideOnTypeFormattingEdits(document, position, ch, options, token) {
        // Only handle specific characters
        if (!['{', '[', '(', ')', ']', '}', '"'].includes(ch)) {
          return [];
        }
        
        // Note: VS Code's built-in auto-pairing should handle most cases
        // Return an empty array to let VS Code handle default behavior
        return [];
      }
    }, '{', '[', '(', ')', ']', '}', '"')
  );
  
  // Monitor document changes to enforce balanced delimiters
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId !== 'hql') {
        return;
      }
      
      // Can implement more advanced balancing logic here if needed
    })
  );
}