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
  import * as path from 'path';
  import * as fs from 'fs';
  import { parse, SExp } from '../../parser';
  import { isList, isSymbol, isString } from '../../s-exp/types';
  import { SymbolManager, ExtendedSymbolInformation } from '../symbolManager';
  
/**
   * Get completions for class/struct fields
   */
  export function getClassStructFieldCompletions(isStruct: boolean): CompletionItem[] {
    const completions: CompletionItem[] = [];
    
    // Var fields (mutable)
    completions.push({
      label: 'var-field',
      kind: CompletionItemKind.Snippet,
      detail: `Mutable ${isStruct ? 'struct' : 'class'} field`,
      insertText: '(var ${1:fieldName})',
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
      insertText: '(var ${1:fieldName} ${2:defaultValue})',
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
      insertText: '(let ${1:fieldName})',
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
      insertText: '(let ${1:fieldName} ${2:defaultValue})',
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
        insertText: '(init (${1:param1} ${2:param2})\n  (do\n    (set! self.${1:param1} ${1:param1})\n    (set! self.${2:param2} ${2:param2})\n    self))',
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
        insertText: '(constructor (${1:param1} ${2:param2})\n  (do\n    (set! this.${1:param1} ${1:param1})\n    (set! this.${2:param2} ${2:param2})\n    this))',
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
      insertText: '(fn ${1:methodName} (${2:params})\n  ${0:body})',
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
      insertText: '(fx ${1:methodName} (${2:param}: ${3:Type}) (-> ${4:ReturnType})\n  ${0:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Defines a pure method for a ${isStruct ? 'struct' : 'class'}`
      }
    });
    
    return completions;
  }