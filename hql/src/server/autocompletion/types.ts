import {
  TextDocument,
  Position,
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  InsertTextFormat
} from 'vscode-languageserver';

import { SymbolManager, ExtendedSymbolInformation } from '../symbolManager';

/**
 * Interface for all completion providers
 */
export interface ICompletionProvider {
  provideCompletions(
    document: TextDocument,
    position: Position,
    linePrefix: string,
    fullText: string
  ): CompletionItem[];
}

/**
 * Helper function to setup a completion item for display
 */
export function setupCompletionItem(completionItem: CompletionItem): CompletionItem {
  // Fix for enum case autocompletion
  if (completionItem.kind === CompletionItemKind.EnumMember) {
    const data = completionItem.data;
    if (data && data.enumName) {
      // Check if we already have full name (e.g., "OS.macOS") or just the case name (e.g., "macOS")
      if (!completionItem.label.includes('.') && !completionItem.insertText?.startsWith('.')) {
        completionItem.detail = `Case of enum ${data.enumName}`;
      }
    }
  }
  
  // Fix for function parameter completion
  if (completionItem.kind === CompletionItemKind.Property && 
      completionItem.label.endsWith(':') && 
      completionItem.insertText?.endsWith('${1:') &&
      completionItem.insertTextFormat === InsertTextFormat.Snippet) {
    
    // Simplify insertion to just leave cursor after the colon
    completionItem.insertText = completionItem.insertText.replace(/\$\{1:.*?\}/, '');
    completionItem.insertTextFormat = InsertTextFormat.PlainText;
  }
  
  return completionItem;
}

/**
 * Base context for completion providers
 */
export interface CompletionContext {
  symbolManager: SymbolManager;
  document: TextDocument;
  position: Position;
  linePrefix: string;
  fullText: string;
}

/**
 * Utility function to extract the word at cursor position
 */
export function getWordAtPosition(linePrefix: string): string {
  const match = linePrefix.match(/[\w\-_]+$/);
  return match ? match[0] : '';
}

/**
 * Utility to merge and deduplicate completion items
 */
export function mergeAndDeduplicate(completions: CompletionItem[]): CompletionItem[] {
  // Sort completions by sortText first, so items with better priority come first
  completions.sort((a, b) => {
    const aSortText = a.sortText || a.label;
    const bSortText = b.sortText || b.label;
    return aSortText.localeCompare(bSortText);
  });
  
  // Use a Map to keep only the first occurrence of each label
  const uniqueMap = new Map<string, CompletionItem>();
  
  for (const item of completions) {
    // Skip if we already have a better item for this label
    if (uniqueMap.has(item.label)) {
      continue;
    }
    
    // Add new unique item
    uniqueMap.set(item.label, item);
  }
  
  return Array.from(uniqueMap.values());
} 