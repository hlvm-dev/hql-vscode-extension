import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  TextDocument,
  Position
} from 'vscode-languageserver';

import { ICompletionProvider } from './types';

/**
 * Provides autocompletion for dot chain methods like filter, map, etc.
 */
export class DotChainCompletionProvider implements ICompletionProvider {
  provideCompletions(
    document: TextDocument,
    position: Position,
    linePrefix: string,
    fullText: string
  ): CompletionItem[] {
    // If we're starting a method chain after a value
    const chainMatch = linePrefix.match(/\)[.\s]*\.$/);
    if (chainMatch) {
      return this.handleDotChainCompletions(document, linePrefix);
    }
    
    return [];
  }

  /**
   * Handle dot chain method completions
   */
  private handleDotChainCompletions(document: TextDocument, linePrefix: string): CompletionItem[] {
    const completions: CompletionItem[] = [];
    
    // If we're starting a method chain after a value
    const chainMatch = linePrefix.match(/\)[.\s]*\.$/);
    if (chainMatch) {
      // Add common method chain patterns
      completions.push(
        {
          label: 'filter',
          kind: CompletionItemKind.Method,
          detail: 'Filter elements in collection',
          insertText: "filter (lambda (${1:item}) ${2:condition})",
          insertTextFormat: InsertTextFormat.Snippet,
          documentation: {
            kind: MarkupKind.Markdown,
            value: 'Filters elements in a collection based on a condition'
          }
        },
        {
          label: 'map',
          kind: CompletionItemKind.Method,
          detail: 'Transform elements in collection',
          insertText: "map (lambda (${1:item}) ${2:transform})",
          insertTextFormat: InsertTextFormat.Snippet,
          documentation: {
            kind: MarkupKind.Markdown,
            value: 'Transforms each element in a collection'
          }
        },
        {
          label: 'reduce',
          kind: CompletionItemKind.Method,
          detail: 'Reduce collection to a single value',
          insertText: "reduce (${1:initial}) (lambda (${2:acc} ${3:item}) ${4:expression})",
          insertTextFormat: InsertTextFormat.Snippet,
          documentation: {
            kind: MarkupKind.Markdown,
            value: 'Reduces a collection to a single value by applying a function'
          }
        },
        {
          label: 'forEach',
          kind: CompletionItemKind.Method,
          detail: 'Execute for each element',
          insertText: "forEach (lambda (${1:item}) ${2:expression})",
          insertTextFormat: InsertTextFormat.Snippet,
          documentation: {
            kind: MarkupKind.Markdown,
            value: 'Executes an expression for each element in a collection'
          }
        }
      );
      
      // Add string-specific methods if context suggests we're working with strings
      if (linePrefix.match(/[\"'].*\)[.\s]*\.$/)) {
        completions.push(
          {
            label: 'slice',
            kind: CompletionItemKind.Method,
            detail: 'Extract substring',
            insertText: "slice (${1:start}) ${2:(end)}",
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Extracts a substring from a string'
            }
          },
          {
            label: 'toUpperCase',
            kind: CompletionItemKind.Method,
            detail: 'Convert to uppercase',
            insertText: "toUpperCase ()",
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Converts a string to uppercase'
            }
          },
          {
            label: 'toLowerCase',
            kind: CompletionItemKind.Method,
            detail: 'Convert to lowercase',
            insertText: "toLowerCase ()",
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Converts a string to lowercase'
            }
          }
        );
      }
    }
    
    return completions;
  }
} 