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
 * Provides autocompletion for standard library functions and symbols
 */
export class StandardLibraryCompletionProvider implements ICompletionProvider {
  provideCompletions(
    document: TextDocument,
    position: Position, 
    linePrefix: string,
    fullText: string
  ): CompletionItem[] {
    // Get the word at cursor position
    const word = this.getWordAtPosition(linePrefix);
    
    // Filter standard library completions based on the current word
    return this.getStdLibCompletions(word);
  }

  /**
   * Extract the current word from text up to the cursor position
   */
  private getWordAtPosition(linePrefix: string): string {
    // Match word characters at the end of the line
    const match = linePrefix.match(/[\w\-_]+$/);
    return match ? match[0] : '';
  }

  /**
   * Provide standard library function completions
   */
  private getStdLibCompletions(prefix: string): CompletionItem[] {
    const stdLibItems = [
      // Core functions with improved completions for print/console.log
      { 
        name: 'print', 
        kind: CompletionItemKind.Function, 
        detail: 'Print to standard output',
        insertText: '(print "${1:}")',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'println', 
        kind: CompletionItemKind.Function, 
        detail: 'Print to standard output with newline',
        insertText: '(println "${1:}")',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'str', 
        kind: CompletionItemKind.Function, 
        detail: 'Convert to string',
        insertText: '(str ${1:value})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'concat', 
        kind: CompletionItemKind.Function, 
        detail: 'Concatenate strings or collections',
        insertText: '(concat ${1:value1} ${2:value2})',
        insertFormat: InsertTextFormat.Snippet
      },
      
      // Console functions with improved completions
      { 
        name: 'console.log', 
        kind: CompletionItemKind.Function, 
        detail: 'Log to console',
        insertText: '(console.log "${1:}")',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'console.error', 
        kind: CompletionItemKind.Function, 
        detail: 'Log error to console',
        insertText: '(console.error "${1:}")',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'console.warn', 
        kind: CompletionItemKind.Function, 
        detail: 'Log warning to console',
        insertText: '(console.warn "${1:}")',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'console.info', 
        kind: CompletionItemKind.Function, 
        detail: 'Log info to console',
        insertText: '(console.info "${1:}")',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'console.debug', 
        kind: CompletionItemKind.Function, 
        detail: 'Log debug to console',
        insertText: '(console.debug "${1:}")',
        insertFormat: InsertTextFormat.Snippet
      },
      
      // Math functions
      { 
        name: 'Math.abs', 
        kind: CompletionItemKind.Function, 
        detail: 'Absolute value of a number',
        insertText: '(Math.abs ${1:value})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'Math.min', 
        kind: CompletionItemKind.Function, 
        detail: 'Minimum of values',
        insertText: '(Math.min ${1:val1} ${2:val2})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'Math.max', 
        kind: CompletionItemKind.Function, 
        detail: 'Maximum of values',
        insertText: '(Math.max ${1:val1} ${2:val2})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'Math.floor', 
        kind: CompletionItemKind.Function, 
        detail: 'Round down to nearest integer',
        insertText: '(Math.floor ${1:value})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'Math.ceil', 
        kind: CompletionItemKind.Function, 
        detail: 'Round up to nearest integer',
        insertText: '(Math.ceil ${1:value})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'Math.round', 
        kind: CompletionItemKind.Function, 
        detail: 'Round to nearest integer',
        insertText: '(Math.round ${1:value})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'Math.random', 
        kind: CompletionItemKind.Function, 
        detail: 'Random value between 0 and 1',
        insertText: '(Math.random)',
        insertFormat: InsertTextFormat.PlainText
      },
      
      // Collection functions
      { 
        name: 'map', 
        kind: CompletionItemKind.Function, 
        detail: 'Transform each element in a collection',
        insertText: '(map (lambda (${1:item}) ${2:expression}) ${3:collection})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'filter', 
        kind: CompletionItemKind.Function, 
        detail: 'Filter elements in a collection',
        insertText: '(filter (lambda (${1:item}) ${2:condition}) ${3:collection})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'reduce', 
        kind: CompletionItemKind.Function, 
        detail: 'Reduce collection to a single value',
        insertText: '(reduce (lambda (${1:accumulator} ${2:item}) ${3:expression}) ${4:initialValue} ${5:collection})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'forEach', 
        kind: CompletionItemKind.Function, 
        detail: 'Execute for each element in a collection',
        insertText: '(forEach (lambda (${1:item}) ${2:expression}) ${3:collection})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'get', 
        kind: CompletionItemKind.Function, 
        detail: 'Get element by key or index',
        insertText: '(get ${1:collection} ${2:key})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'contains?', 
        kind: CompletionItemKind.Function, 
        detail: 'Check if collection contains value',
        insertText: '(contains? ${1:collection} ${2:value})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'empty?', 
        kind: CompletionItemKind.Function, 
        detail: 'Check if collection is empty',
        insertText: '(empty? ${1:collection})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'count', 
        kind: CompletionItemKind.Function, 
        detail: 'Count elements in a collection',
        insertText: '(count ${1:collection})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'range', 
        kind: CompletionItemKind.Function, 
        detail: 'Generate a range of numbers',
        insertText: '(range ${1:start} ${2:end})',
        insertFormat: InsertTextFormat.Snippet
      },
      
      // Control flow keywords
      { 
        name: 'if', 
        kind: CompletionItemKind.Keyword, 
        detail: 'Conditional expression',
        insertText: '(if ${1:condition}\n  ${2:then-expr}\n  ${3:else-expr})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'when', 
        kind: CompletionItemKind.Keyword, 
        detail: 'Conditional execution when true',
        insertText: '(when ${1:condition}\n  ${0:body})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'unless', 
        kind: CompletionItemKind.Keyword, 
        detail: 'Conditional execution when false',
        insertText: '(unless ${1:condition}\n  ${0:body})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'cond', 
        kind: CompletionItemKind.Keyword, 
        detail: 'Multi-way conditional',
        insertText: '(cond\n  ((${1:condition1}) ${2:result1})\n  ((${3:condition2}) ${4:result2})\n  ((else) ${0:default-result}))',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'do', 
        kind: CompletionItemKind.Keyword, 
        detail: 'Sequential execution block',
        insertText: '(do\n  ${1:expr1}\n  ${0:expr2})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'let', 
        kind: CompletionItemKind.Keyword, 
        detail: 'Bind local variables',
        insertText: '(let ${1:name} ${0:value})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'loop', 
        kind: CompletionItemKind.Keyword, 
        detail: 'Loop with recur',
        insertText: '(loop (${1:i} ${2:0})\n  ${0:body})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'recur', 
        kind: CompletionItemKind.Keyword, 
        detail: 'Loop recursion point',
        insertText: '(recur ${0:updated-values})',
        insertFormat: InsertTextFormat.Snippet
      },
      { 
        name: 'for', 
        kind: CompletionItemKind.Keyword, 
        detail: 'Iterative loop',
        insertText: '(for (${1:i} to: ${2:10})\n  ${0:body})',
        insertFormat: InsertTextFormat.Snippet
      }
    ];
    
    // Filter by prefix if provided
    const filtered = stdLibItems.filter(item => 
      !prefix || item.name.toLowerCase().includes(prefix.toLowerCase())
    );
    
    // Convert to completion items
    return filtered.map(item => {
      return {
        label: item.name,
        kind: item.kind,
        detail: item.detail,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `\`${item.name}\` - ${item.detail}`
        },
        insertText: item.insertText,
        insertTextFormat: item.insertFormat,
        sortText: `01-${item.name}` // High priority for standard library items
      };
    });
  }
} 