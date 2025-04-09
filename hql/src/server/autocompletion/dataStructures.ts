import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  TextDocument,
  Position
} from 'vscode-languageserver';

import { ICompletionProvider, CompletionContext } from './types';

/**
 * Provides autocompletion for data structures like vectors, maps, and sets
 */
export class DataStructureCompletionProvider implements ICompletionProvider {
  provideCompletions(
    document: TextDocument,
    position: Position,
    linePrefix: string,
    fullText: string
  ): CompletionItem[] {
    // Match for data structure literal opening brackets
    const dataStructureMatch = linePrefix.match(/(\[|\{|#\[)\s*$/);
    if (dataStructureMatch) {
      return this.getDataStructureLiteralCompletions(dataStructureMatch[1]);
    }
    
    return [];
  }

  /**
   * Get completions for data structure literals ([, {, #[)
   */
  private getDataStructureLiteralCompletions(openBracket: string): CompletionItem[] {
    const completions: CompletionItem[] = [];
    
    if (openBracket === '[') {
      // Vector completions
      completions.push({
        label: 'vector-empty',
        kind: CompletionItemKind.Snippet,
        detail: 'Empty vector',
        insertText: "]",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create an empty vector'
        }
      });
      
      completions.push({
        label: 'vector-items',
        kind: CompletionItemKind.Snippet,
        detail: 'Vector with items',
        insertText: "${1:item1} ${2:item2}]",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a vector with items'
        }
      });
    } else if (openBracket === '{') {
      // Map completions
      completions.push({
        label: 'map-empty',
        kind: CompletionItemKind.Snippet,
        detail: 'Empty map',
        insertText: "}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create an empty map'
        }
      });
      
      completions.push({
        label: 'map-entries',
        kind: CompletionItemKind.Snippet,
        detail: 'Map with entries',
        insertText: "${1:key1} ${2:value1}\n  ${3:key2} ${4:value2}}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a map with key-value pairs'
        }
      });
    } else if (openBracket === '#[') {
      // Set completions
      completions.push({
        label: 'set-empty',
        kind: CompletionItemKind.Snippet,
        detail: 'Empty set',
        insertText: "]",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create an empty set'
        }
      });
      
      completions.push({
        label: 'set-items',
        kind: CompletionItemKind.Snippet,
        detail: 'Set with items',
        insertText: "${1:item1} ${2:item2}]",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a set with items'
        }
      });
    }
    
    return completions;
  }
} 