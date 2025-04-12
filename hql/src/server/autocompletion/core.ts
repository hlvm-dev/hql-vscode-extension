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
  import { getClassStructFieldCompletions } from "./class"
  import { getEnumCaseCompletions } from "./enum"
  import { getJavaScriptObjectCompletions } from "./js"
  import * as path from 'path';
  import * as fs from 'fs';
  import { parse, SExp } from '../../parser';
  import { isList, isSymbol, isString } from '../../s-exp/types';
  import { SymbolManager, ExtendedSymbolInformation } from '../symbolManager';
  

    /**
   * Get completion kind for a symbol kind
   */
    export function getCompletionKindForSymbol(kind: number): CompletionItemKind {
        switch (kind) {
          case 12: // Function
            return CompletionItemKind.Function;
            
          case 13: // Variable
            return CompletionItemKind.Variable;
            
          case 6: // Method
            return CompletionItemKind.Method;
            
          case 5: // Class
            return CompletionItemKind.Class;
            
          case 22: // Struct
            return CompletionItemKind.Struct;
            
          case 10: // Enum
            return CompletionItemKind.Enum;
            
          case 11: // EnumMember
            return CompletionItemKind.EnumMember;
            
          case 8: // Field
            return CompletionItemKind.Field;
            
          case 9: // Constructor
            return CompletionItemKind.Constructor;
            
          default:
            return CompletionItemKind.Text;
        }
      }
      
      /**
       * Get template completions based on word
       */
      export function getTemplateCompletions(word: string): CompletionItem[] {
        const completions: CompletionItem[] = [];
        
        // Data structure template completions
        if ('vector'.startsWith(word)) {
          completions.push({
            label: 'vector-empty',
            kind: CompletionItemKind.Snippet,
            detail: 'Empty vector',
            insertText: '[]',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-vector-empty',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create an empty vector'
            }
          });
          
          completions.push({
            label: 'vector-numbers',
            kind: CompletionItemKind.Snippet,
            detail: 'Vector with numbers',
            insertText: '[1, 2, 3, 4, 5]',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-vector-numbers',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a vector with numeric items'
            }
          });
          
          completions.push({
            label: 'vector-strings',
            kind: CompletionItemKind.Snippet,
            detail: 'Vector with strings',
            insertText: '["item1", "item2", "item3"]',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-vector-strings',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a vector with string items'
            }
          });
          
          completions.push({
            label: 'vector-mixed',
            kind: CompletionItemKind.Snippet,
            detail: 'Vector with mixed types',
            insertText: '["string", 42, true, nil]',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-vector-mixed',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a vector with mixed data types'
            }
          });
          
          completions.push({
            label: 'vector-nested',
            kind: CompletionItemKind.Snippet,
            detail: 'Nested vectors',
            insertText: '[[1, 2], [3, 4], [5, 6]]',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-vector-nested',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a vector containing nested vectors'
            }
          });
        }
        
        if ('map'.startsWith(word) || 'json'.startsWith(word) || 'object'.startsWith(word)) {
          completions.push({
            label: 'map-empty',
            kind: CompletionItemKind.Snippet,
            detail: 'Empty map',
            insertText: '{}',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-map-empty',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create an empty map'
            }
          });
          
          completions.push({
            label: 'map-string-keys',
            kind: CompletionItemKind.Snippet,
            detail: 'Map with string keys',
            insertText: '{"name": "John", "age": 30, "active": true}',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-map-string-keys',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a map with string keys and various value types'
            }
          });
          
          completions.push({
            label: 'map-keyword-keys',
            kind: CompletionItemKind.Snippet,
            detail: 'Map with keyword keys',
            insertText: '{:host "localhost", :port 8080, :secure true}',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-map-keyword-keys',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a map with keyword keys'
            }
          });
          
          completions.push({
            label: 'map-nested',
            kind: CompletionItemKind.Snippet,
            detail: 'Nested map',
            insertText: '{"profile": {"id": 1, "settings": {"theme": "dark"}}}',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-map-nested',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a map with nested maps'
            }
          });
    
          completions.push({
            label: 'map-with-array',
            kind: CompletionItemKind.Snippet,
            detail: 'Map with array value',
            insertText: '{"items": [1, 2, 3, 4, 5], "active": true}',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-map-with-array',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a map containing array values'
            }
          });
        }
        
        if ('set'.startsWith(word)) {
          completions.push({
            label: 'set-empty',
            kind: CompletionItemKind.Snippet,
            detail: 'Empty set',
            insertText: '#[]',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-set-empty',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create an empty set'
            }
          });
          
          completions.push({
            label: 'set-numbers',
            kind: CompletionItemKind.Snippet,
            detail: 'Set with numbers',
            insertText: '#[1, 2, 3, 4, 5]',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-set-numbers',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a set with numeric items'
            }
          });
          
          completions.push({
            label: 'set-strings',
            kind: CompletionItemKind.Snippet,
            detail: 'Set with strings',
            insertText: '#["apple", "banana", "cherry"]',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-set-strings',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a set with string items'
            }
          });
        }
        
        if ('list'.startsWith(word)) {
          completions.push({
            label: 'list-empty',
            kind: CompletionItemKind.Snippet,
            detail: 'Empty list',
            insertText: '\'()',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-list-empty',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create an empty list'
            }
          });
          
          completions.push({
            label: 'list-numbers',
            kind: CompletionItemKind.Snippet,
            detail: 'List with numbers',
            insertText: '\'(1 2 3 4 5)',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-list-numbers',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a list with numeric items'
            }
          });
          
          completions.push({
            label: 'list-strings',
            kind: CompletionItemKind.Snippet,
            detail: 'List with strings',
            insertText: '\'("item1" "item2" "item3")',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-list-strings',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a list with string items'
            }
          });
          
          completions.push({
            label: 'list-mixed',
            kind: CompletionItemKind.Snippet,
            detail: 'List with mixed types',
            insertText: '\'("string" 42 true)',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-list-mixed',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a list with mixed data types'
            }
          });
          
          completions.push({
            label: 'list-nested',
            kind: CompletionItemKind.Snippet,
            detail: 'Nested lists',
            insertText: '\'((1 2) (3 4) (5 6))',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-list-nested',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a list containing nested lists'
            }
          });
        }
        
        if ('fn'.startsWith(word)) {
          completions.push({
            label: 'fn-function',
            kind: CompletionItemKind.Snippet,
            detail: 'Function Definition (fn)',
            insertText: '(fn ${1:name} (${2:x} ${3:y})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-fn',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a function with untyped parameters'
            }
          });
          
          completions.push({
            label: 'fn-defaults',
            kind: CompletionItemKind.Snippet,
            detail: 'Function with Default Parameters',
            insertText: '(fn ${1:name} (${2:x} = ${3:10} ${4:y} = ${5:20})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-fn-defaults',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a function with default parameter values'
            }
          });
          
          completions.push({
            label: 'fn-function-typed',
            kind: CompletionItemKind.Snippet,
            detail: 'Function Definition with Types (fn)',
            insertText: '(fn ${1:name} (${2:x}: ${3:Int} ${4:y}: ${5:Int}) (-> ${6:Int})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-fn-typed',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a function with typed parameters and return type'
            }
          });
          
          completions.push({
            label: 'fn-typed-defaults',
            kind: CompletionItemKind.Snippet,
            detail: 'Typed Function with Default Parameters',
            insertText: '(fn ${1:name} (${2:x}: ${3:Int} = ${4:10} ${5:y}: ${6:Int} = ${7:20}) (-> ${8:Int})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-fn-defaults',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a typed function with default parameter values'
            }
          });
          
          completions.push({
            label: 'fn-untyped',
            kind: CompletionItemKind.Snippet,
            detail: 'Untyped Function Definition',
            insertText: '(fn ${1:name} (${2:x} ${3:y})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-fn-untyped',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a function without type annotations'
            }
          });
          
          completions.push({
            label: 'fn-untyped-defaults',
            kind: CompletionItemKind.Snippet,
            detail: 'Untyped Function with Default Parameters',
            insertText: '(fn ${1:name} (${2:x} = ${3:10} ${4:y} = ${5:20})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-fn-untyped-defaults',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates an untyped function with default parameter values'
            }
          });
          
          completions.push({
            label: 'fn-untyped-rest',
            kind: CompletionItemKind.Snippet,
            detail: 'Untyped Function with Rest Parameters',
            insertText: '(fn ${1:sum} (${2:x} ${3:y} & ${4:rest})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-fn-untyped-rest',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a function with rest parameters to handle variable arguments'
            }
          });
        }
        
        if ('fx'.startsWith(word)) {
          completions.push({
            label: 'fx-pure',
            kind: CompletionItemKind.Snippet,
            detail: 'Pure Function Definition (fx)',
            insertText: '(fx ${1:name} (${2:x}: ${3:Int} ${4:y}: ${5:Int}) (-> ${6:Int})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-fx', // Highest priority
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a pure typed function with mandatory return type'
            }
          });
          
          completions.push({
            label: 'fx-defaults',
            kind: CompletionItemKind.Snippet,
            detail: 'Pure Function with Default Parameters',
            insertText: '(fx ${1:name} (${2:x}: ${3:Int} = ${4:10} ${5:y}: ${6:Int} = ${7:20}) (-> ${8:Int})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-fx-defaults',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a pure function with default parameter values'
            }
          });
          
          completions.push({
            label: 'fx-mixed-defaults',
            kind: CompletionItemKind.Snippet,
            detail: 'Pure Function with Mixed Default Parameters',
            insertText: '(fx ${1:name} (${2:x}: ${3:Int} = ${4:10} ${5:y}: ${6:Int}) (-> ${7:Int})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-fx-mixed',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a pure function with a mix of default and required parameters'
            }
          });
          
          completions.push({
            label: 'fx-rest',
            kind: CompletionItemKind.Snippet,
            detail: 'Pure Function with Rest Parameters',
            insertText: '(fx ${1:name} (${2:param1}: ${3:Type1} ${4:param2}: ${5:Type2} & ${6:rest}: [${7:Type3}]) (-> ${8:ReturnType})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-fx-rest',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a pure function with rest parameters'
            }
          });
        }
        
        if ('if'.startsWith(word)) {
          completions.push({
            label: 'if-cond',
            kind: CompletionItemKind.Snippet,
            detail: 'Conditional expression',
            insertText: '(if ${1:condition}\n  ${2:true-expr}\n  ${0:false-expr})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-if',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates an if conditional expression'
            }
          });
        }
        
        if ('enum'.startsWith(word)) {
          completions.push({
            label: 'enum-def',
            kind: CompletionItemKind.Snippet,
            detail: 'Enum definition',
            insertText: '(enum ${1:Name}\n  (case ${2:Case1})\n  (case ${0:Case2}))',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-enum',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a simple enumeration type definition without associated values'
            }
          });
          
          completions.push({
            label: 'enum-with-rawvalue',
            kind: CompletionItemKind.Snippet,
            detail: 'Enum with raw values',
            insertText: '(enum ${1:Name}: ${2:Int}\n  (case ${3:Case1} ${4:1})\n  (case ${5:Case2} ${0:2}))',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-enum-raw',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates an enumeration with associated raw values'
            }
          });
          
          completions.push({
            label: 'enum-with-associated',
            kind: CompletionItemKind.Snippet,
            detail: 'Enum with associated values',
            insertText: '(enum ${1:Name}\n  (case ${2:Case1} ${3:param1}: ${4:Type1})\n  (case ${5:Case2} ${6:param2}: ${0:Type2}))',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-enum-associated',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates an enumeration with associated values'
            }
          });
        }
        
        if ('case'.startsWith(word)) {
          completions.push({
            label: 'case-simple',
            kind: CompletionItemKind.Snippet,
            detail: 'Simple enum case',
            insertText: '(case ${1:Name})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-case',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a simple enum case without values'
            }
          });
          
          completions.push({
            label: 'case-rawvalue',
            kind: CompletionItemKind.Snippet,
            detail: 'Enum case with raw value',
            insertText: '(case ${1:Name} ${0:value})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-case-raw',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates an enum case with a raw value'
            }
          });
          
          completions.push({
            label: 'case-associated',
            kind: CompletionItemKind.Snippet,
            detail: 'Enum case with associated values',
            insertText: '(case ${1:Name} ${2:param1}: ${3:Type1} ${4:param2}: ${0:Type2})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-case-associated',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates an enum case with associated values'
            }
          });
        }
        
        if ('lambda'.startsWith(word)) {
          completions.push({
            label: 'lambda-fn',
            kind: CompletionItemKind.Snippet,
            detail: 'Lambda function',
            insertText: '(lambda (${1:params})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-lambda',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates an anonymous function'
            }
          });
        }
        
        if ('let'.startsWith(word)) {
          completions.push({
            label: 'let-binding',
            kind: CompletionItemKind.Snippet,
            detail: 'Simple let binding',
            insertText: '(let ${1:name} ${0:value})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-let',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a simple immutable binding'
            }
          });
          
          completions.push({
            label: 'let-multi',
            kind: CompletionItemKind.Snippet,
            detail: 'Multiple let bindings',
            insertText: '(let (${1:name1} ${2:value1}\n     ${3:name2} ${4:value2})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-let-multi',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates multiple bindings with a body'
            }
          });
        }
        
        if ('var'.startsWith(word)) {
          completions.push({
            label: 'var-binding',
            kind: CompletionItemKind.Snippet,
            detail: 'Mutable variable',
            insertText: '(var ${1:name} ${0:value})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-var',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a mutable variable'
            }
          });
        }
        
        if ('class'.startsWith(word)) {
          completions.push({
            label: 'class',
            kind: CompletionItemKind.Snippet,
            detail: 'Class definition',
            insertText: '(class ${1:Calculator}\n  ;; Class fields\n  (var ${2:value})\n\n  ;; Constructor\n  (constructor (${3:initialValue})\n    (do\n      (set! this.${2:value} ${3:initialValue})))\n      \n  ;; Method\n  (fn ${4:calculate} (${5:input})\n    ${0:body}))',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-class',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a class with fields, constructor, and methods'
            }
          });
          
          completions.push({
            label: 'class-with-fx',
            kind: CompletionItemKind.Snippet,
            detail: 'Class with pure method',
            insertText: '(class ${1:Calculator}\n  ;; Class fields\n  (var ${2:value})\n\n  ;; Constructor\n  (constructor (${3:initialValue})\n    (do\n      (set! this.${2:value} ${3:initialValue})))\n      \n  ;; Pure method\n  (fx ${4:multiply} (${5:x}: ${6:Int}) (-> ${7:Int})\n    ${0:body}))',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-class-with-fx',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a class with fields, constructor, and a pure method'
            }
          });
        }
        
        if ('struct'.startsWith(word)) {
          completions.push({
            label: 'struct',
            kind: CompletionItemKind.Snippet,
            detail: 'Struct definition',
            insertText: '(struct ${1:Point}\n  ;; Struct fields\n  (var ${2:x})\n  (var ${3:y})\n\n  ;; Initializer\n  (init (${4:x} ${5:y})\n    (do\n      (set! self.x x)\n      (set! self.y y)\n      self))\n      \n  ;; Method\n  (fn ${6:distance} (${7:other})\n    ${0:body}))',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-struct',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a struct with fields, initializer, and methods'
            }
          });
          
          completions.push({
            label: 'struct-with-fx',
            kind: CompletionItemKind.Snippet,
            detail: 'Struct with pure method',
            insertText: '(struct ${1:Point}\n  ;; Struct fields\n  (var ${2:x})\n  (var ${3:y})\n\n  ;; Initializer\n  (init (${4:x} ${5:y})\n    (do\n      (set! self.x x)\n      (set! self.y y)\n      self))\n      \n  ;; Pure method\n  (fx ${6:distanceTo} (${7:other}: ${8:Point}) (-> ${9:Double})\n    ${0:body}))',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-struct-with-fx',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a struct with fields, initializer, and a pure method'
            }
          });
        }
        
        if ('new'.startsWith(word)) {
          // Generic class instantiation template
          completions.push({
            label: 'new-class',
            kind: CompletionItemKind.Snippet,
            detail: 'Instantiate a class',
            insertText: '(new ${1:ClassName} ${0:args})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-new-class',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a new instance of a class'
            }
          });
          
          // Class instantiation with let binding and method call
          completions.push({
            label: 'new-class-with-methods',
            kind: CompletionItemKind.Snippet,
            detail: 'Instantiate a class and call methods',
            insertText: '(let ${1:instance} (new ${2:ClassName} ${3:args}))\n\n;; Call method on instance\n(${1:instance}.${4:methodName} ${0:args})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-new-class-usage',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Create a new instance of a class, bind it to a variable, and call methods on it'
            }
          });
        }
        
        if ('cond'.startsWith(word)) {
          completions.push({
            label: 'cond-expr',
            kind: CompletionItemKind.Snippet,
            detail: 'Conditional expression',
            insertText: '(cond\n  (${1:condition1}) ${2:result1}\n  (${3:condition2}) ${4:result2}\n  (else ${0:default-result}))',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-cond',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a multi-way conditional expression'
            }
          });
        }
        
        if ('when'.startsWith(word)) {
          completions.push({
            label: 'when-cond',
            kind: CompletionItemKind.Snippet,
            detail: 'Conditional execution',
            insertText: '(when ${1:condition}\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-when',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a conditional execution when true'
            }
          });
        }
        
        if ('unless'.startsWith(word)) {
          completions.push({
            label: 'unless-cond',
            kind: CompletionItemKind.Snippet,
            detail: 'Negative conditional execution',
            insertText: '(unless ${1:condition}\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-unless',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a conditional execution when false'
            }
          });
        }
        
        if ('do'.startsWith(word)) {
          completions.push({
            label: 'do-block',
            kind: CompletionItemKind.Snippet,
            detail: 'Sequential execution block',
            insertText: '(do\n  ${1:expr1}\n  ${0:expr2})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-do',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a sequential execution block'
            }
          });
        }
        
        if ('loop'.startsWith(word)) {
          completions.push({
            label: 'loop-recur',
            kind: CompletionItemKind.Snippet,
            detail: 'Loop with recur',
            insertText: 'recur ${0:values}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Recur back to the loop with new values'
            }
          });
        }
        
        if ('console.log'.startsWith(word)) {
          completions.push({
            label: 'String',
            kind: CompletionItemKind.Snippet,
            detail: 'Insert a string',
            insertText: '"${1}"',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Print a string'
            }
          });
          
          completions.push({
            label: 'String concatenation',
            kind: CompletionItemKind.Snippet,
            detail: 'Insert string formatting',
            insertText: '"${1:message}: " ${2:value}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Format values for printing with a label'
            }
          });
          
          completions.push({
            label: 'Simple value',
            kind: CompletionItemKind.Snippet,
            detail: 'Insert a simple value',
            insertText: '${1:value}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Print a simple value'
            }
          });
        }
        
        if ('fn'.startsWith(word)) {
          completions.push({
            label: 'param-with-type',
            kind: CompletionItemKind.Snippet,
            detail: 'Parameter with type annotation',
            insertText: '${1:name}: ${0:Type}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Add a parameter with type annotation'
            }
          });
          
          completions.push({
            label: 'param-with-default',
            kind: CompletionItemKind.Snippet,
            detail: 'Parameter with default value',
            insertText: '${1:name}: ${2:Type} = ${0:defaultValue}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Add a parameter with type and default value'
            }
          });
          
          completions.push({
            label: 'return-type',
            kind: CompletionItemKind.Snippet,
            detail: 'Function return type',
            insertText: '(-> ${0:ReturnType})',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Specify the function return type'
            }
          });
          
          completions.push({
            label: 'enum-param',
            kind: CompletionItemKind.Snippet,
            detail: 'Enum type parameter',
            insertText: '${1:paramName}: ${0:EnumType}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Parameter with enum type annotation'
            }
          });
        }
        
        if ('fx'.startsWith(word)) {
          completions.push({
            label: 'param-with-type',
            kind: CompletionItemKind.Snippet,
            detail: 'Parameter with type annotation',
            insertText: '${1:name}: ${0:Type}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Add a parameter with type annotation'
            }
          });
          
          completions.push({
            label: 'param-with-default',
            kind: CompletionItemKind.Snippet,
            detail: 'Parameter with default value',
            insertText: '${1:name}: ${2:Type} = ${0:defaultValue}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Add a parameter with type and default value'
            }
          });
          
          completions.push({
            label: 'return-type',
            kind: CompletionItemKind.Snippet,
            detail: 'Function return type',
            insertText: '(-> ${0:ReturnType})',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Specify the function return type'
            }
          });
          
          completions.push({
            label: 'enum-param',
            kind: CompletionItemKind.Snippet,
            detail: 'Enum type parameter',
            insertText: '${1:paramName}: ${0:EnumType}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Parameter with enum type annotation'
            }
          });
        }
        
        if ('for'.startsWith(word)) {
          completions.push({
            label: 'for-range',
            kind: CompletionItemKind.Snippet,
            detail: 'For range loop',
            insertText: '(for (${1:i} ${2:0} ${3:10})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-for',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a for loop over a numeric range'
            }
          });
          
          completions.push({
            label: 'for-range-step',
            kind: CompletionItemKind.Snippet,
            detail: 'For range loop with step',
            insertText: '(for (${1:i} ${2:0} ${3:10} ${4:2})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-for-step',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a for loop over a numeric range with custom step'
            }
          });
          
          completions.push({
            label: 'for-in',
            kind: CompletionItemKind.Snippet,
            detail: 'For-in loop',
            insertText: '(for (${1:item} in ${2:items})\n  ${0:body})',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-for-in',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a for loop that iterates through a collection'
            }
          });
          
          completions.push({
            label: 'for-index',
            kind: CompletionItemKind.Snippet,
            detail: 'For loop with index',
            insertText: '(for (${1:i} ${2:0} ${3:items.length})\n  (let (${4:item} (get ${3:items} ${1:i}))\n    ${0:body}))',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-for-index',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Creates a for loop with index access to a collection'
            }
          });
        }
        
        // Add more function-specific completions as needed
        
        // Apply match type priority to completions
        if (word) {
          const wordLower = word.toLowerCase();
          
          for (const item of completions) {
            const label = item.label.toLowerCase();
            const originalSortText = item.sortText || item.label;
            
            // Get original sort priority
            const sortPrefix = originalSortText.includes('-') ? 
              originalSortText.split('-')[0] : '99';
            
            // Add match type to sort text: 1=prefix, 2=suffix, 3=fuzzy
            if (label.startsWith(wordLower)) {
              // Prefix match (highest priority)
              item.sortText = `${sortPrefix}-1-${item.label}`;
            } else if (label.endsWith(wordLower)) {
              // Suffix match (medium priority)
              item.sortText = `${sortPrefix}-2-${item.label}`;
            } else {
              // Fuzzy match (lowest priority)
              item.sortText = `${sortPrefix}-3-${item.label}`;
            }
          }
        }
        
        return completions;
      }
      
      /**
       * Handle method chain completions (obj.method)
       */
      export function handleMethodChainCompletions(
        document: TextDocument,
        currentLine: string,
        symbolManager: SymbolManager
      ): CompletionItem[] {
        // Match object.method pattern
        const dotMatch = currentLine.match(/(\w+)\.\s*$/);
        if (!dotMatch) return [];
        
        const objectName = dotMatch[1];
        console.log(`[HQL Completion] Method chain for object: ${objectName}`);
        
        // First check if this is a JavaScript built-in object
        const jsObjectCompletions = getJavaScriptObjectCompletions(objectName);
        if (jsObjectCompletions.length > 0) {
          return jsObjectCompletions;
        }
        
        const symbols = symbolManager.getDocumentSymbols(document.uri);
        
        // Check if variable is a known collection type (Array, String)
        const varSymbol = symbols.find(s => 
          s.kind === 13 && // Variable
          s.name === objectName
        );
        
        if (varSymbol && varSymbol.data?.type) {
          // Handle collection types
          if (varSymbol.data.type === 'Array' || varSymbol.data.type === 'Vector') {
            return getJavaScriptObjectCompletions('Array');
          } else if (varSymbol.data.type === 'String') {
            return getJavaScriptObjectCompletions('String');
          }
          
          // Check if the variable is an instance of a class
          const classType = varSymbol.data.type;
          const classSymbol = symbols.find(s => 
            (s.kind === 5) && // Class
            s.name === classType
          );
          
          if (classSymbol) {
            console.log(`[HQL Completion] Variable ${objectName} is an instance of class ${classType}`);
            // Find all methods of this class
            const classMethods = symbols.filter(s => 
              s.kind === 6 && // Method
              s.data && s.data.parentClass === classType
            );
            
            return classMethods.map(method => {
              return {
                label: method.name,
                kind: CompletionItemKind.Method,
                detail: `Method of ${classType}`,
                insertText: method.name,
                insertTextFormat: InsertTextFormat.PlainText,
                sortText: `01-${method.name}`,
                documentation: {
                  kind: MarkupKind.Markdown,
                  value: method.data?.documentation || `Call the ${method.name} method`
                }
              };
            });
          }
        }
        
        // Check if this might be a class instance
        const classSymbol = symbols.find(s => 
          (s.kind === 5 || s.kind === 22) && // Class or Struct
          s.name.toLowerCase() === objectName.toLowerCase()
        );
        
        if (classSymbol) {
          const className = classSymbol.name;
          
          // Find all methods belonging to this class
          const classMethods = symbols.filter(s => 
            s.kind === 6 && // Method
            ((s.name.startsWith(`${className}.`) && s.name.split('.').length === 2) || 
             (s.data && s.data.parentClass === className))
          );
          
          if (classMethods.length > 0) {
            console.log(`[HQL Completion] Found ${classMethods.length} methods for class ${className}`);
            return classMethods.map(method => {
              // Extract method name without class prefix if present
              const methodName = method.name.includes('.') ? 
                method.name.split('.')[1] : method.name;
                
              return {
                label: methodName,
                kind: CompletionItemKind.Method,
                detail: `Method of ${className}`,
                insertText: methodName,
                insertTextFormat: InsertTextFormat.PlainText,
                sortText: `01-${methodName}`,
                documentation: {
                  kind: MarkupKind.Markdown,
                  value: method.data?.documentation || `Call the ${methodName} method`
                }
              };
            });
          }
        }
        
        // Look for instance variables with dot notation
        const instanceVar = symbols.find(s => 
          s.kind === 13 && // Variable 
          s.name === objectName && 
          (s.data?.type || false) // Check if it has a type that might be a class
        );
        
        if (instanceVar && instanceVar.data?.type) {
          const className = instanceVar.data.type;
          console.log(`[HQL Completion] Found instance variable of type ${className}`);
          
          // Find class methods
          const classMethods = symbols.filter(s => 
            s.kind === 6 && // Method
            ((s.data && s.data.parentClass === className) || 
             s.name.startsWith(`${className}.`))
          );
          
          if (classMethods.length > 0) {
            return classMethods.map(method => {
              // Extract method name without class prefix if present
              const methodName = method.name.includes('.') ? 
                method.name.split('.')[1] : method.name;
                
              return {
                label: methodName,
                kind: CompletionItemKind.Method,
                detail: `Method of ${className}`,
                insertText: methodName,
                insertTextFormat: InsertTextFormat.PlainText,
                sortText: `01-${methodName}`,
                documentation: {
                  kind: MarkupKind.Markdown,
                  value: method.data?.documentation || `Call the ${methodName} method`
                }
              };
            });
          }
        }
        
        return [];
      }

  export function getTypeCompletions(word: string): CompletionItem[] {
    const completions: CompletionItem[] = [];
    
    // Basic types
    const types = [
      { label: 'String', detail: 'String type', doc: 'String type for text values' },
      { label: 'Number', detail: 'Number type', doc: 'Numeric type for integers and floats' },
      { label: 'Boolean', detail: 'Boolean type', doc: 'Boolean type (true/false)' },
      { label: 'Any', detail: 'Any type', doc: 'Dynamic type that can hold any value' },
      { label: 'Void', detail: 'Void type', doc: 'Represents no value (for function returns)' },
      { label: 'Nil', detail: 'Nil type', doc: 'Represents the absence of a value' },
      { label: 'Date', detail: 'Date type', doc: 'Date and time representation' },
      { label: 'RegExp', detail: 'RegExp type', doc: 'Regular expression type' },
      { label: 'Error', detail: 'Error type', doc: 'Error type for exceptions' }
    ];
    
    // Generic types
    const genericTypes = [
      { label: 'Array<${1:T}>', detail: 'Array type', doc: 'Generic array type' },
      { label: 'Vector<${1:T}>', detail: 'Vector type', doc: 'Immutable vector type' },
      { label: 'Set<${1:T}>', detail: 'Set type', doc: 'Set collection type' },
      { label: 'Map<${1:K}, ${2:V}>', detail: 'Map type', doc: 'Key-value map type' },
      { label: 'Optional<${1:T}>', detail: 'Optional type', doc: 'Value that might be null/nil' },
      { label: 'Promise<${1:T}>', detail: 'Promise type', doc: 'Asynchronous promise type' },
      { label: 'Result<${1:T}, ${2:E}>', detail: 'Result type', doc: 'Success or error result type' },
      { label: 'Function<(${1:Args}) -> ${2:ReturnType}>', detail: 'Function type', doc: 'Function type signature' }
    ];
    
    // Add basic types
    for (const type of types) {
      if (type.label.toLowerCase().startsWith(word.toLowerCase())) {
        completions.push({
          label: type.label,
          kind: CompletionItemKind.TypeParameter,
          detail: type.detail,
          insertText: type.label,
          sortText: `02-type-${type.label}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: type.doc
          }
        });
      }
    }
    
    // Add generic type patterns
    for (const type of genericTypes) {
      if (type.label.split('<')[0].toLowerCase().startsWith(word.toLowerCase())) {
        completions.push({
          label: type.label.split('<')[0],
          kind: CompletionItemKind.TypeParameter,
          detail: type.detail,
          insertText: type.label,
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: `02-generic-${type.label.split('<')[0]}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: type.doc
          }
        });
      }
    }
    
    // Type annotation patterns
    if ('type'.startsWith(word)) {
      completions.push({
        label: 'type-alias',
        kind: CompletionItemKind.Snippet,
        detail: 'Type alias definition',
        insertText: '(type ${1:AliasName} ${0:TargetType})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-type-alias',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines a type alias'
        }
      });
      
      completions.push({
        label: 'type-union',
        kind: CompletionItemKind.Snippet,
        detail: 'Union type definition',
        insertText: '(type ${1:UnionName} (union ${2:Type1} ${3:Type2} ${0:Type3}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-type-union',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines a union type'
        }
      });
      
      completions.push({
        label: 'type-intersection',
        kind: CompletionItemKind.Snippet,
        detail: 'Intersection type definition',
        insertText: '(type ${1:IntersectionName} (intersection ${2:Type1} ${3:Type2} ${0:Type3}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-type-intersection',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines an intersection type'
        }
      });
    }
    
    return completions;
  }

  /**
   * Get completions for data structure literals ([, {, #[)
   */
  export function getDataStructureLiteralCompletions(openBracket: string): CompletionItem[] {
    const completions: CompletionItem[] = [];
    
    console.log(`Getting completions for: "${openBracket}"`);
    
    if (openBracket === '[') {
      // Vector completions
      completions.push({
        label: 'vector-empty',
        kind: CompletionItemKind.Snippet,
        detail: 'Empty vector',
        insertText: "",
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
        insertText: "${1:1}, ${2:2}, ${3:3}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a vector with items'
        }
      });

      completions.push({
        label: 'vector-numbers',
        kind: CompletionItemKind.Snippet,
        detail: 'Vector with numbers',
        insertText: "1, 2, 3, 4, 5",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a vector with numeric items'
        }
      });

      completions.push({
        label: 'vector-strings',
        kind: CompletionItemKind.Snippet,
        detail: 'Vector with strings',
        insertText: "\"item1\", \"item2\", \"item3\"",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a vector with string items'
        }
      });

      completions.push({
        label: 'vector-mixed',
        kind: CompletionItemKind.Snippet,
        detail: 'Vector with mixed types',
        insertText: "\"string\", 42, true, nil",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a vector with mixed data types'
        }
      });

      completions.push({
        label: 'vector-nested',
        kind: CompletionItemKind.Snippet,
        detail: 'Nested vectors',
        insertText: "[1, 2], [3, 4], [5, 6]",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a vector containing nested vectors'
        }
      });
    } else if (openBracket === '{') {
      // Map completions
      completions.push({
        label: 'map-empty',
        kind: CompletionItemKind.Snippet,
        detail: 'Empty map',
        insertText: "",
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
        insertText: "\"${1:key1}\": ${2:\"value1\"},\n  \"${3:key2}\": ${4:\"value2\"}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a map with key-value pairs'
        }
      });

      completions.push({
        label: 'map-string-keys',
        kind: CompletionItemKind.Snippet,
        detail: 'Map with string keys',
        insertText: "\"name\": \"John\", \"age\": 30, \"active\": true",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a map with string keys and various value types'
        }
      });

      completions.push({
        label: 'map-keyword-keys',
        kind: CompletionItemKind.Snippet,
        detail: 'Map with keyword keys',
        insertText: ":host \"localhost\", :port 8080, :secure true",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a map with keyword keys'
        }
      });

      completions.push({
        label: 'map-nested',
        kind: CompletionItemKind.Snippet,
        detail: 'Nested map',
        insertText: "\"profile\": {\"id\": 1, \"settings\": {\"theme\": \"dark\"}}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a map with nested maps'
        }
      });

      completions.push({
        label: 'map-with-array',
        kind: CompletionItemKind.Snippet,
        detail: 'Map with array value',
        insertText: "\"items\": [1, 2, 3, 4, 5], \"active\": true",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a map containing array values'
        }
      });
    } else if (openBracket === '#[') {
      // Set completions
      completions.push({
        label: 'set-empty',
        kind: CompletionItemKind.Snippet,
        detail: 'Empty set',
        insertText: "",
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
        insertText: "${1:1}, ${2:2}, ${3:3}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a set with items'
        }
      });

      completions.push({
        label: 'set-numbers',
        kind: CompletionItemKind.Snippet,
        detail: 'Set with numbers',
        insertText: "1, 2, 3, 4, 5",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a set with numeric items'
        }
      });

      completions.push({
        label: 'set-strings',
        kind: CompletionItemKind.Snippet,
        detail: 'Set with strings',
        insertText: "\"apple\", \"banana\", \"cherry\"",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a set with string items'
        }
      });
    } else if (openBracket === "'") {
      // List completions for quote syntax
      completions.push({
        label: 'list-empty',
        kind: CompletionItemKind.Snippet,
        detail: 'Empty list',
        insertText: "()",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create an empty list'
        }
      });
      
      completions.push({
        label: 'list-items',
        kind: CompletionItemKind.Snippet,
        detail: 'List with items',
        insertText: "(${1:1} ${2:2} ${3:3})",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a list with items'
        }
      });

      completions.push({
        label: 'list-numbers',
        kind: CompletionItemKind.Snippet,
        detail: 'List with numbers',
        insertText: "(1 2 3 4 5)",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a list with numeric items'
        }
      });

      completions.push({
        label: 'list-strings',
        kind: CompletionItemKind.Snippet,
        detail: 'List with strings',
        insertText: "(\"item1\" \"item2\" \"item3\")",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a list with string items'
        }
      });

      completions.push({
        label: 'list-mixed',
        kind: CompletionItemKind.Snippet,
        detail: 'List with mixed types',
        insertText: "(\"string\" 42 true)",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a list with mixed data types'
        }
      });

      completions.push({
        label: 'list-nested',
        kind: CompletionItemKind.Snippet,
        detail: 'Nested lists',
        insertText: "((1 2) (3 4) (5 6))",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a list containing nested lists'
        }
      });
    }
    
    return completions;
  }

  /**
   * Get completions for cond patterns
   */
  export function getCondPatternCompletions(): CompletionItem[] {
    return [
      {
        label: 'cond-branch',
        kind: CompletionItemKind.Snippet,
        detail: 'Condition branch',
        insertText: '(${1:condition}) ${2:result})',
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
        insertText: '((else) ${1:result})',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Add a default else branch to cond expression'
        }
      },
      {
        label: 'cond-multiple-branches',
        kind: CompletionItemKind.Snippet,
        detail: 'Multiple condition branches',
        insertText: '(${1:condition1}) ${2:result1})\n((${3:condition2}) ${4:result2})\n((else) ${5:defaultResult})',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Add multiple condition branches and an else branch'
        }
      }
    ];
  }

  /**
   * Get completions for loop/recur patterns
   */
  export function getLoopRecurCompletions(): CompletionItem[] {
    return [
      {
        label: 'recur-call',
        kind: CompletionItemKind.Snippet,
        detail: 'Recursive loop call',
        insertText: '(recur ${1:updatedValues})',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a recursive call to loop'
        }
      },
      {
        label: 'multiple-bindings',
        kind: CompletionItemKind.Snippet,
        detail: 'Multiple loop bindings',
        insertText: '${1:value1} ${2:initialValue1} ${3:value2} ${4:initialValue2})',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Multiple bindings for loop construction'
        }
      },
      {
        label: 'loop-while-pattern',
        kind: CompletionItemKind.Snippet,
        detail: 'Loop with while-like condition',
        insertText: '${1:i} ${2:0})\n  (if (< ${1:i} ${3:10})\n    (do\n      ${4:body}\n      (recur (+ ${1:i} 1)))\n    ${5:result}))',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a loop with a while-like condition pattern'
        }
      },
      {
        label: 'loop-accumulator',
        kind: CompletionItemKind.Snippet,
        detail: 'Loop with accumulator',
        insertText: '${1:i} ${2:0} ${3:acc} ${4:0})\n  (if (< ${1:i} ${5:10})\n    (recur (+ ${1:i} 1) (+ ${3:acc} ${1:i}))\n    ${3:acc}))',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a loop with an accumulator'
        }
      }
    ];
  }

  /**
   * Get completions for for-loop syntax
   */
  export function getForLoopCompletions(): CompletionItem[] {
    return [
      {
        label: 'for-to',
        kind: CompletionItemKind.Snippet,
        detail: 'For loop with end value',
        insertText: 'to: ${1:10}',
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
        insertText: 'from: ${1:0} to: ${2:10}',
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
        insertText: 'from: ${1:0} to: ${2:10} by: ${3:2}',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Create a for loop with start, end, and step values'
        }
      },
      {
        label: 'for-range',
        kind: CompletionItemKind.Snippet,
        detail: 'For range loop',
        insertText: '(for (${1:i} ${2:0} ${3:10})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-for',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a for loop over a numeric range'
        }
      },
      {
        label: 'for-range-step',
        kind: CompletionItemKind.Snippet,
        detail: 'For range loop with step',
        insertText: '(for (${1:i} ${2:0} ${3:10} ${4:2})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-for-step',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a for loop over a numeric range with custom step'
        }
      },
      {
        label: 'for-in',
        kind: CompletionItemKind.Snippet,
        detail: 'For-in loop',
        insertText: '(for (${1:item} in ${2:items})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-for-in',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a for loop that iterates through a collection'
        }
      },
      {
        label: 'for-index',
        kind: CompletionItemKind.Snippet,
        detail: 'For loop with index',
        insertText: '(for (${1:i} ${2:0} ${3:items.length})\n  (let (${4:item} (get ${3:items} ${1:i}))\n    ${0:body}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-for-index',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a for loop with index access to a collection'
        }
      }
    ];
  }

  /**
   * Get completions for loop bindings
   */
  export function getLoopBindingCompletions(): CompletionItem[] {
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
   * Get completions for recur arguments based on the enclosing loop
   */
  function getRecurArgumentCompletions(document: TextDocument, position: Position): CompletionItem[] {
    // Try to find the enclosing loop to get its bindings
    const text = document.getText();
    const lines = text.split('\n');
    
    // Get the line prefix for current line
    const linePrefix = document.getText({
      start: { line: position.line, character: 0 },
      end: position
    });
    
    // Scan backward to find the most recent loop
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

  /**
   * Get completions for conditional (when/unless) body
   */
  function getConditionalBodyCompletions(): CompletionItem[] {
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
   * Get completions for multiple bindings in let/var
   */
  function getMultiBindingCompletions(isLet: boolean): CompletionItem[] {
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
  function getIfLetBindingCompletions(): CompletionItem[] {
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

  /**
   * Handle dot chain method completions
   */
  export function handleDotChainCompletions(document: TextDocument, linePrefix: string): CompletionItem[] {
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

  /**
   * Handle special syntax completions (class/struct/enum/loop)
   */
  export function handleSpecialSyntaxCompletions(
    document: TextDocument,
    linePrefix: string,
    position: Position
  ): CompletionItem[] {
    // Check for class/struct body completions
    const classStructMatch = linePrefix.match(/\((class|struct)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*$/);
    if (classStructMatch) {
      const isStruct = classStructMatch[1] === 'struct';
      return getClassStructFieldCompletions(isStruct);
    }
    
    // Check for enum completions
    const enumDefMatch = linePrefix.match(/\(enum\s+[a-zA-Z_][a-zA-Z0-9_]*\s*$/);
    if (enumDefMatch) {
      return getEnumCaseCompletions();
    }
    
    // Check for loop body completions
    const loopMatch = linePrefix.match(/\(loop\s*\($/);
    if (loopMatch) {
      return getLoopBindingCompletions();
    }
    
    // Check for recur argument completions
    const recurMatch = linePrefix.match(/\(recur\s+$/);
    if (recurMatch) {
      return getRecurArgumentCompletions(document, position);
    }
    
    // Check for conditional body completions
    const conditionalMatch = linePrefix.match(/\((when|unless)\s+.+\s*$/);
    if (conditionalMatch) {
      return getConditionalBodyCompletions();
    }
    
    // Check for let/var binding completions
    const letVarMatch = linePrefix.match(/\((let|var)\s*\($/);
    if (letVarMatch) {
      const isLet = letVarMatch[1] === 'let';
      return getMultiBindingCompletions(isLet);
    }
    
    // Check for if-let completions
    const ifLetMatch = linePrefix.match(/\(if-let\s*\($/);
    if (ifLetMatch) {
      return getIfLetBindingCompletions();
    }
    
    return [];
  }