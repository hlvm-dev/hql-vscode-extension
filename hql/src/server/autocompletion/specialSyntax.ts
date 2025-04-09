import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  TextDocument,
  Position
} from 'vscode-languageserver';

import { ICompletionProvider } from './types';
import { SymbolManager } from '../symbolManager';

/**
 * Provider for class/struct field completions
 */
export class ClassStructFieldCompletionProvider implements ICompletionProvider {
  constructor(private symbolManager: SymbolManager) {}

  provideCompletions(
    document: TextDocument,
    position: Position,
    linePrefix: string,
    fullText: string
  ): CompletionItem[] {
    // Check for struct/class field completions
    const classStructMatch = linePrefix.match(/\((struct|class)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*$/);
    if (classStructMatch) {
      const isStruct = classStructMatch[1] === 'struct';
      return this.getClassStructFieldCompletions(isStruct);
    }
    
    return [];
  }

  /**
   * Get completions for class/struct fields
   */
  private getClassStructFieldCompletions(isStruct: boolean): CompletionItem[] {
    const completions: CompletionItem[] = [];
    
    // Var fields (mutable)
    completions.push({
      label: 'var-field',
      kind: CompletionItemKind.Snippet,
      detail: `Mutable ${isStruct ? 'struct' : 'class'} field`,
      insertText: "(var ${1:fieldName})",
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Defines a mutable field for a ${isStruct ? 'struct' : 'class'}`
      }
    });
    
    completions.push({
      label: 'var-field-with-default',
      kind: CompletionItemKind.Snippet,
      detail: `Mutable ${isStruct ? 'struct' : 'class'} field with default value`,
      insertText: "(var ${1:fieldName} ${2:defaultValue})",
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Defines a mutable field with a default value for a ${isStruct ? 'struct' : 'class'}`
      }
    });
    
    // Let fields (immutable)
    completions.push({
      label: 'let-field',
      kind: CompletionItemKind.Snippet,
      detail: `Immutable ${isStruct ? 'struct' : 'class'} field`,
      insertText: "(let ${1:fieldName})",
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Defines an immutable field for a ${isStruct ? 'struct' : 'class'}`
      }
    });
    
    completions.push({
      label: 'let-field-with-default',
      kind: CompletionItemKind.Snippet,
      detail: `Immutable ${isStruct ? 'struct' : 'class'} field with default value`,
      insertText: "(let ${1:fieldName} ${2:defaultValue})",
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Defines an immutable field with a default value for a ${isStruct ? 'struct' : 'class'}`
      }
    });
    
    // Constructor/initializer
    if (isStruct) {
      completions.push({
        label: 'init',
        kind: CompletionItemKind.Snippet,
        detail: 'Struct initializer',
        insertText: "(init (${1:param1} ${2:param2})\n  (do\n    (set! self.${1:param1} ${1:param1})\n    (set! self.${2:param2} ${2:param2})\n    self))",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines an initializer for a struct'
        }
      });
    } else {
      completions.push({
        label: 'constructor',
        kind: CompletionItemKind.Snippet,
        detail: 'Class constructor',
        insertText: "(constructor (${1:param1} ${2:param2})\n  (do\n    (set! this.${1:param1} ${1:param1})\n    (set! this.${2:param2} ${2:param2})\n    this))",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines a constructor for a class'
        }
      });
    }
    
    // Method placeholders
    completions.push({
      label: 'fn-method',
      kind: CompletionItemKind.Snippet,
      detail: `${isStruct ? 'Struct' : 'Class'} method`,
      insertText: "(fn ${1:methodName} (${2:params})\n  ${0:body})",
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Defines a method for a ${isStruct ? 'struct' : 'class'}`
      }
    });
    
    completions.push({
      label: 'fx-method',
      kind: CompletionItemKind.Snippet,
      detail: `Pure ${isStruct ? 'struct' : 'class'} method`,
      insertText: "(fx ${1:methodName} (${2:param}: ${3:Type}) (-> ${4:ReturnType})\n  ${0:body})",
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Defines a pure method for a ${isStruct ? 'struct' : 'class'}`
      }
    });
    
    return completions;
  }
}

/**
 * Provider for enum case completions
 */
export class EnumCaseCompletionProvider implements ICompletionProvider {
  provideCompletions(
    document: TextDocument,
    position: Position,
    linePrefix: string,
    fullText: string
  ): CompletionItem[] {
    // Check for enum completions
    const enumDefMatch = linePrefix.match(/\(enum\s+[a-zA-Z_][a-zA-Z0-9_]*\s*$/);
    if (enumDefMatch) {
      return this.getEnumCaseCompletions();
    }
    
    return [];
  }

  /**
   * Get completions for enum cases
   */
  private getEnumCaseCompletions(): CompletionItem[] {
    return [
      {
        label: 'case-simple',
        kind: CompletionItemKind.Snippet,
        detail: 'Simple enum case',
        insertText: "(case ${1:CaseName})",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Add a simple enum case'
        }
      },
      {
        label: 'case-raw-value',
        kind: CompletionItemKind.Snippet,
        detail: 'Enum case with raw value',
        insertText: "(case ${1:CaseName} ${2:rawValue})",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Add an enum case with a raw value'
        }
      },
      {
        label: 'case-associated-values',
        kind: CompletionItemKind.Snippet,
        detail: 'Enum case with associated values',
        insertText: "(case ${1:CaseName} ${2:valueName}: ${3:valueType})",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Add an enum case with associated values'
        }
      }
    ];
  }
}

/**
 * Provider for loop and recur completions
 */
export class LoopRecurCompletionProvider implements ICompletionProvider {
  provideCompletions(
    document: TextDocument,
    position: Position,
    linePrefix: string,
    fullText: string
  ): CompletionItem[] {
    // Check for loop body completions
    const loopMatch = linePrefix.match(/\(loop\s*\($/);
    if (loopMatch) {
      return this.getLoopBindingCompletions();
    }
    
    // Check for recur argument completions
    const recurMatch = linePrefix.match(/\(recur\s+$/);
    if (recurMatch) {
      return this.getRecurArgumentCompletions(document, position);
    }
    
    // Check for loop/recur pattern
    const loopPatternMatch = linePrefix.match(/\(loop\s*\(\s*[a-zA-Z_][a-zA-Z0-9_]*\s+/);
    if (loopPatternMatch) {
      return this.getLoopPatternCompletions();
    }
    
    return [];
  }

  /**
   * Get completions for loop bindings
   */
  private getLoopBindingCompletions(): CompletionItem[] {
    return [
      {
        label: 'loop-counter',
        kind: CompletionItemKind.Snippet,
        detail: 'Loop with counter',
        insertText: "${1:i} ${2:0}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Loop with counter variable'
        }
      },
      {
        label: 'loop-multiple-bindings',
        kind: CompletionItemKind.Snippet,
        detail: 'Loop with multiple bindings',
        insertText: "${1:i} ${2:0} ${3:result} ${4:initialValue}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Loop with multiple bindings including counter and accumulator'
        }
      }
    ];
  }

  /**
   * Get completions for loop patterns
   */
  private getLoopPatternCompletions(): CompletionItem[] {
    return [
      {
        label: 'recur-call',
        kind: CompletionItemKind.Snippet,
        detail: 'Recursive loop call',
        insertText: "(recur ${1:updatedValues})",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a recursive call to loop'
        }
      },
      {
        label: 'loop-terminate',
        kind: CompletionItemKind.Snippet,
        detail: 'Terminate loop with result',
        insertText: "${1:resultValue}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Return a value to terminate the loop'
        }
      }
    ];
  }

  /**
   * Get completions for recur arguments based on the enclosing loop
   */
  private getRecurArgumentCompletions(document: TextDocument, position: Position): CompletionItem[] {
    // Try to find the enclosing loop to get its bindings
    const text = document.getText();
    const lines = text.split('\n');
    
    // Get the line prefix for current line
    const linePrefix = document.getText({
      start: { line: position.line, character: 0 },
      end: position
    });
    
    // Get current indentation level
    const currentIndent = linePrefix.match(/^\s*/)?.[0].length || 0;
    
    for (let i = position.line - 1; i >= 0; i--) {
      const line = lines[i];
      const lineIndent = line.match(/^\s*/)?.[0].length || 0;
      
      // Look for a loop with less indentation (enclosing loop)
      if (lineIndent < currentIndent && line.match(/\(loop\s*\(/)) {
        // Try to extract the binding names
        const loopLine = line + (i + 1 < lines.length ? ' ' + lines[i + 1] : '');
        const bindingMatch = loopLine.match(/\(loop\s*\(([^)]+)\)/);
        
        if (bindingMatch) {
          const bindingStr = bindingMatch[1].trim();
          const bindingParts = bindingStr.split(/\s+/);
          const completions: CompletionItem[] = [];
          
          // Create a completion for each binding name with its position
          for (let j = 0; j < bindingParts.length; j += 2) {
            if (j < bindingParts.length) {
              const name = bindingParts[j];
              completions.push({
                label: name,
                kind: CompletionItemKind.Variable,
                detail: `Loop binding at position ${j/2 + 1}`,
                insertText: name,
                documentation: {
                  kind: MarkupKind.Markdown,
                  value: `Use the \`${name}\` binding in a recur expression`
                }
              });
            }
          }
          
          // Add a full recur pattern suggestion
          completions.push({
            label: 'recur-full',
            kind: CompletionItemKind.Snippet,
            detail: 'Complete recur pattern',
            insertText: bindingParts.filter((_, idx) => idx % 2 === 0).join(' '),
            insertTextFormat: InsertTextFormat.PlainText,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Complete recur pattern with all loop bindings'
            }
          });
          
          return completions;
        }
      }
    }
    
    // If no specific loop bindings found, return generic recur pattern
    return [
      {
        label: 'recur-generic',
        kind: CompletionItemKind.Snippet,
        detail: 'Generic recur pattern',
        insertText: "${1:updated-value1} ${2:updated-value2}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Generic recur pattern - update with your loop bindings'
        }
      }
    ];
  }
}

/**
 * Provider for conditional statement completions
 */
export class ConditionalCompletionProvider implements ICompletionProvider {
  provideCompletions(
    document: TextDocument,
    position: Position,
    linePrefix: string,
    fullText: string
  ): CompletionItem[] {
    // Check for conditional body completions
    const conditionalMatch = linePrefix.match(/\((when|unless)\s+.+\s*$/);
    if (conditionalMatch) {
      return this.getConditionalBodyCompletions();
    }
    
    // Check for cond pattern completions
    const condMatch = linePrefix.match(/\(cond\s*$/);
    if (condMatch) {
      return this.getCondPatternCompletions();
    }
    
    return [];
  }

  /**
   * Get completions for conditional (when/unless) body
   */
  private getConditionalBodyCompletions(): CompletionItem[] {
    return [
      {
        label: 'do-block',
        kind: CompletionItemKind.Snippet,
        detail: 'Multiple statements in do block',
        insertText: "(do\n  ${1:expression1}\n  ${2:expression2})",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Execute multiple statements in sequence'
        }
      },
      {
        label: 'if-expression',
        kind: CompletionItemKind.Snippet,
        detail: 'Nested if expression',
        insertText: "(if ${1:condition}\n  ${2:then-expression}\n  ${3:else-expression})",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Nested if expression for additional conditions'
        }
      }
    ];
  }

  /**
   * Get completions for cond patterns
   */
  private getCondPatternCompletions(): CompletionItem[] {
    return [
      {
        label: 'cond-branch',
        kind: CompletionItemKind.Snippet,
        detail: 'Condition branch',
        insertText: "((${1:condition}) ${2:result})",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Add a condition branch to cond expression'
        }
      },
      {
        label: 'cond-else-branch',
        kind: CompletionItemKind.Snippet,
        detail: 'Else branch',
        insertText: "((else) ${1:result})",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Add a default else branch to cond expression'
        }
      }
    ];
  }
}

/**
 * Provider for let/var binding completions
 */
export class BindingCompletionProvider implements ICompletionProvider {
  provideCompletions(
    document: TextDocument,
    position: Position,
    linePrefix: string,
    fullText: string
  ): CompletionItem[] {
    // Check for let/var binding completions
    const letVarMatch = linePrefix.match(/\((let|var)\s*\($/);
    if (letVarMatch) {
      const isLet = letVarMatch[1] === 'let';
      return this.getMultiBindingCompletions(isLet);
    }
    
    // Check for if-let completions
    const ifLetMatch = linePrefix.match(/\(if-let\s*\($/);
    if (ifLetMatch) {
      return this.getIfLetBindingCompletions();
    }
    
    return [];
  }

  /**
   * Get completions for multiple bindings in let/var
   */
  private getMultiBindingCompletions(isLet: boolean): CompletionItem[] {
    const bindingType = isLet ? 'immutable' : 'mutable';
    
    return [
      {
        label: 'single-binding',
        kind: CompletionItemKind.Snippet,
        detail: `Single ${bindingType} binding`,
        insertText: "${1:name} ${2:value}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `Create a single ${bindingType} binding`
        }
      },
      {
        label: 'multiple-bindings',
        kind: CompletionItemKind.Snippet,
        detail: `Multiple ${bindingType} bindings`,
        insertText: "${1:name1} ${2:value1}\n  ${3:name2} ${4:value2}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `Create multiple ${bindingType} bindings`
        }
      }
    ];
  }

  /**
   * Get completions for if-let bindings
   */
  private getIfLetBindingCompletions(): CompletionItem[] {
    return [
      {
        label: 'if-let-binding',
        kind: CompletionItemKind.Snippet,
        detail: 'Single binding in if-let',
        insertText: "${1:name} ${2:value}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a binding in if-let that executes only if value is not null/false'
        }
      },
      {
        label: 'if-let-destructure',
        kind: CompletionItemKind.Snippet,
        detail: 'Destructuring in if-let',
        insertText: "[${1:a} ${2:b}] ${3:value}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Destructure a collection in if-let binding'
        }
      }
    ];
  }
}

/**
 * Provider for for-loop completions
 */
export class ForLoopCompletionProvider implements ICompletionProvider {
  provideCompletions(
    document: TextDocument,
    position: Position,
    linePrefix: string,
    fullText: string
  ): CompletionItem[] {
    // Check for for-loop completions
    const forLoopMatch = linePrefix.match(/\(for\s*\(\s*[a-zA-Z_][a-zA-Z0-9_]*\s*$/);
    if (forLoopMatch) {
      return this.getForLoopCompletions();
    }
    
    return [];
  }

  /**
   * Get completions for for-loop syntax
   */
  private getForLoopCompletions(): CompletionItem[] {
    return [
      {
        label: 'for-to',
        kind: CompletionItemKind.Snippet,
        detail: 'For loop with end value',
        insertText: "to: ${1:10}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a for loop with end value'
        }
      },
      {
        label: 'for-from-to',
        kind: CompletionItemKind.Snippet,
        detail: 'For loop with start and end values',
        insertText: "from: ${1:0} to: ${2:10}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a for loop with start and end values'
        }
      },
      {
        label: 'for-from-to-by',
        kind: CompletionItemKind.Snippet,
        detail: 'For loop with start, end, and step values',
        insertText: "from: ${1:0} to: ${2:10} by: ${3:2}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a for loop with start, end, and step values'
        }
      }
    ];
  }
}

/**
 * Special Syntax Completion Provider combines multiple specialized providers
 */
export class SpecialSyntaxCompletionProvider implements ICompletionProvider {
  private providers: ICompletionProvider[];
  
  constructor(symbolManager: SymbolManager) {
    this.providers = [
      new ClassStructFieldCompletionProvider(symbolManager),
      new EnumCaseCompletionProvider(),
      new LoopRecurCompletionProvider(),
      new ConditionalCompletionProvider(),
      new BindingCompletionProvider(),
      new ForLoopCompletionProvider()
    ];
  }
  
  provideCompletions(
    document: TextDocument,
    position: Position,
    linePrefix: string,
    fullText: string
  ): CompletionItem[] {
    for (const provider of this.providers) {
      const completions = provider.provideCompletions(document, position, linePrefix, fullText);
      if (completions.length > 0) {
        return completions;
      }
    }
    
    return [];
  }
} 