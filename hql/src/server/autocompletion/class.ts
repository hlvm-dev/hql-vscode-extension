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

/**
 * Get completions for class instantiation (after 'new' keyword)
 */
export function getClassInstantiationCompletions(document: TextDocument, symbolManager: SymbolManager): CompletionItem[] {
  console.log(`[HQL Completion] Class instantiation detected`);
  const symbols = symbolManager.getDocumentSymbols(document.uri);
  const classSymbols = symbols.filter(s => s.kind === 5); // Class type
  
  const completions: CompletionItem[] = [];
  
  // Create completion items for each class
  for (const classSymbol of classSymbols) {
    // Try to find constructor for this class
    const constructorSymbol = symbols.find(s => 
      s.kind === 9 && // Constructor
      s.name === `${classSymbol.name}.constructor`
    );
    
    let insertText = `${classSymbol.name}`;
    let detail = `Instantiate ${classSymbol.name} class`;
    let documentation = `Create a new instance of the ${classSymbol.name} class`;
    
    // If we found a constructor, add parameter information
    if (constructorSymbol && constructorSymbol.data?.params) {
      const params = constructorSymbol.data.params;
      // Create a snippet with parameter placeholders
      let paramSnippets = [];
      for (let i = 0; i < params.length; i++) {
        paramSnippets.push(`\${${i+1}:${params[i].name}}`);
      }
      
      if (paramSnippets.length > 0) {
        insertText = `${classSymbol.name} ${paramSnippets.join(' ')}`;
        detail = `Instantiate ${classSymbol.name} class with ${params.length} parameter(s)`;
        
        // Build parameter documentation
        const paramDocs = params.map(p => {
          const typeStr = p.type ? `: ${p.type}` : '';
          const defaultStr = p.defaultValue ? ` = ${p.defaultValue}` : '';
          return `- \`${p.name}${typeStr}${defaultStr}\``;
        }).join('\n');
        
        documentation = `Create a new instance of the ${classSymbol.name} class\n\n**Parameters:**\n${paramDocs}`;
      }
    }
    
    completions.push({
      label: classSymbol.name,
      kind: CompletionItemKind.Class,
      detail: detail,
      insertText: insertText,
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: `01-${classSymbol.name}`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: documentation
      }
    });
    
    // Add let binding with optional method call options
    if (constructorSymbol) {
      // Create let binding template
      const constructorParams = constructorSymbol.data?.params || [];
      const paramSnippets = constructorParams.map((p, i) => `\${${i+2}:${p.name}}`);
      const instantiationSnippet = `(new ${classSymbol.name}${paramSnippets.length ? ' ' + paramSnippets.join(' ') : ''})`;
      const letBindingSnippet = `(let \${1:${classSymbol.name.toLowerCase()}} ${instantiationSnippet})`;
      
      completions.push({
        label: `${classSymbol.name} (with let)`,
        kind: CompletionItemKind.Constructor,
        detail: `Create and bind instance of ${classSymbol.name}`,
        insertText: letBindingSnippet,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: `02-${classSymbol.name}-let`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `Create a new instance of ${classSymbol.name} and bind it to a variable\n\n${documentation}`
        }
      });
      
      // Find methods to add a method call example
      const classMethods = symbols.filter(s => 
        s.kind === 6 && // Method
        ((s.name.startsWith(`${classSymbol.name}.`) && s.name.split('.').length === 2) || 
        (s.data && s.data.parentClass === classSymbol.name))
      );
      
      if (classMethods.length > 0) {
        // Get first method for example
        const firstMethod = classMethods[0];
        const methodName = firstMethod.name.includes('.') ? 
          firstMethod.name.split('.')[1] : firstMethod.name;
          
        // Extract method parameters for dynamic completion
        let methodParamSnippets = '';
        
        if (firstMethod.data?.params) {
          const methodParams = firstMethod.data.params;
          // Create placeholders for method parameters
          const snippets = methodParams.map((p, idx) => {
            const index = constructorParams.length + 3 + idx;
            return `\${${index}:${p.name}}`;
          });
          
          if (snippets.length > 0) {
            methodParamSnippets = ' ' + snippets.join(' ');
          }
        }
        
        const fullMethodSnippet = `(let \${1:${classSymbol.name.toLowerCase()}} ${instantiationSnippet})\n\n;; Call method on instance\n(\${2:${classSymbol.name.toLowerCase()}}.${methodName}${methodParamSnippets || ` \${${constructorParams.length+2}:args}`})`;
        
        completions.push({
          label: `${classSymbol.name} (with method call)`,
          kind: CompletionItemKind.Constructor,
          detail: `Create instance with method call`,
          insertText: fullMethodSnippet,
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: `03-${classSymbol.name}-method`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `Create a new instance of ${classSymbol.name}, bind it to a variable, and call a method on it\n\n${documentation}`
          }
        });
      }
    }
  }
  
  // If we found class symbols, return them
  if (completions.length > 0) {
    console.log(`[HQL Completion] Found ${completions.length} classes for instantiation`);
    return completions;
  }
  
  return [];
}

/**
 * Get completions for class name typing (suggesting instantiation)
 */
export function getClassNameCompletions(document: TextDocument, word: string, symbolManager: SymbolManager): CompletionItem[] {
    if (!word || word.length === 0) {
      return [];
    }
  
    console.log(`[HQL Completion] Potential class name detected: ${word}`);
    
    const symbols = symbolManager.getDocumentSymbols(document.uri);
    const classSymbols = symbols.filter(s => 
      s.kind === 5 && // Class type
      s.name.toLowerCase().startsWith(word.toLowerCase())
    );
    
    if (classSymbols.length === 0) {
      return [];
    }
    
    console.log(`[HQL Completion] Found ${classSymbols.length} matching classes`);
    const completions: CompletionItem[] = [];
    
    for (const classSymbol of classSymbols) {
      // Try to find constructor for this class
      const constructorSymbol = symbols.find(s => 
        s.kind === 9 && // Constructor
        s.name === `${classSymbol.name}.constructor`
      );
      
      // Create basic class completion
      completions.push({
        label: classSymbol.name,
        kind: CompletionItemKind.Class,
        detail: `Class ${classSymbol.name}`,
        insertText: classSymbol.name,
        sortText: `04-class-${classSymbol.name}`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `Class ${classSymbol.name}`
        }
      });
      
      // Build a plain text version of the constructor parameters (no snippet placeholders)
      const constructorParams = constructorSymbol?.data?.params || [];
      const constructorParamsText = constructorParams.length > 0 
        ? ' ' + constructorParams.map(p => p.name).join(' ') 
        : '';
      const instantiationText = `(new ${classSymbol.name}${constructorParamsText})`;
      
      // Add instantiation template as a plain text insertion (so no extra editable placeholders)
      completions.push({
        label: `${classSymbol.name} (instantiate)`,
        kind: CompletionItemKind.Constructor,
        detail: `Instantiate ${classSymbol.name}${constructorParams.length ? ` with ${constructorParams.length} parameter(s)` : ''}`,
        insertText: instantiationText,
        insertTextFormat: InsertTextFormat.PlainText,
        sortText: `03-new-${classSymbol.name}`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `Create a new instance of ${classSymbol.name}`
        }
      });
      
      // Add let binding option that only makes the instance name editable
      const letBindingSnippet = `(let \${1:${classSymbol.name.toLowerCase()}} ${instantiationText})`;
      completions.push({
        label: `${classSymbol.name} (let instance)`,
        kind: CompletionItemKind.Constructor,
        detail: `Create and bind instance of ${classSymbol.name}`,
        insertText: letBindingSnippet,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: `02-let-${classSymbol.name}`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `Create a new instance of ${classSymbol.name} and bind it to a variable`
        }
      });
      
      // Find methods to add a method call example
      const classMethods = symbols.filter(s => 
        s.kind === 6 && // Method
        ((s.name.startsWith(`${classSymbol.name}.`) && s.name.split('.').length === 2) || 
         (s.data && s.data.parentClass === classSymbol.name))
      );
      
      if (classMethods.length > 0) {
        // Use the first method for the example
        const firstMethod = classMethods[0];
        const methodName = firstMethod.name.includes('.') ? 
          firstMethod.name.split('.')[1] : firstMethod.name;
          
        // Build a plain text version of the method parameters
        const methodParams = firstMethod.data?.params || [];
        const methodParamsText = methodParams.length > 0 
          ? ' ' + methodParams.map(p => p.name).join(' ') 
          : '';
        
        // Create a let-instance-with-method snippet that only provides one placeholder for the instance name.
        const fullMethodSnippet = `(let \${1:${classSymbol.name.toLowerCase()}} ${instantiationText})\n\n;; Call method on instance\n(\${1}.${methodName}${methodParamsText || ' args'})`;
        
        completions.push({
          label: `${classSymbol.name} (let instance with method)`,
          kind: CompletionItemKind.Constructor,
          detail: `Create instance of ${classSymbol.name} with method call`,
          insertText: fullMethodSnippet,
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: `01-let-method-${classSymbol.name}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `Create a new instance of ${classSymbol.name}, bind it to a variable, and call a method on it`
          }
        });
      }
    }
    
    return completions;
  }
  