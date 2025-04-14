import {
  TextDocument,
  Diagnostic,
  DiagnosticSeverity,
  Connection
} from 'vscode-languageserver';

import { parse, ParseError, SExp, SList, SSymbol } from '../../parser';
import { SymbolManager } from '../symbolManager';
import { SyntaxValidator } from './syntaxValidator';
import { TypeValidator } from './typeValidator';
import { ReservedKeywordsValidator } from './reservedKeywordsValidator';
import { isList, isSymbol } from '../../s-exp/types';

/**
* ValidatorManager - Central manager for all validation functionality
*/
export class ValidatorManager {
  private symbolManager: SymbolManager;
  private syntaxValidator: SyntaxValidator;
  private typeValidator: TypeValidator;
  private reservedKeywordsValidator: ReservedKeywordsValidator;
  
  constructor(symbolManager: SymbolManager) {
    this.symbolManager = symbolManager;
    this.syntaxValidator = new SyntaxValidator();
    this.typeValidator = new TypeValidator(symbolManager);
    this.reservedKeywordsValidator = new ReservedKeywordsValidator();
  }
  
  /**
  * Validate a text document and send diagnostics
  */
  public async validateTextDocument(
    textDocument: TextDocument, 
    connection: Connection,
    thorough: boolean = false
  ): Promise<void> {
    try {
      const text = textDocument.getText();
      const diagnostics: Diagnostic[] = [];
      
      try {
        // Try to parse the document with tolerant mode first to avoid unnecessary
        // diagnostic errors during typing
        const expressions = parse(text, true);
        
        // 1. First check for reserved keywords - high priority
        this.reservedKeywordsValidator.validateReservedKeywords(textDocument, expressions, diagnostics);
        
        // Send diagnostics immediately for reserved keywords
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [...diagnostics] });
        
        // 2. Check syntax errors
        if (thorough) {
          try {
            // Parse with strict mode to find actual errors
            parse(text, false);
          } catch (error) {
            if (error instanceof ParseError) {
              // Add diagnostic for parse error
              diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                  start: { line: error.position.line - 1, character: error.position.column - 1 },
                  end: { line: error.position.line - 1, character: error.position.column }
                },
                message: error.message,
                source: 'hql'
              });
            }
          }
        }
        
        // 3. Validate specific syntax constructs
        this.validateSyntaxForExpressions(textDocument, expressions, diagnostics);
        
        // 4. Check for unbalanced parentheses
        this.checkUnbalancedDelimiters(text, diagnostics);
        
        // 5. Check for undefined symbols
        await this.checkUndefinedSymbols(textDocument, expressions, diagnostics);
        
        // 6. Check for type errors (if enabled)
        if (thorough) {
          this.validateTypesForExpressions(textDocument, expressions, diagnostics);
        }
        
        // Send final diagnostics including all checks
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
      } catch (error) {
        // If tolerant parsing also fails, the code is very broken, so just report the error
        if (error instanceof ParseError) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: { line: error.position.line - 1, character: error.position.column - 1 },
              end: { line: error.position.line - 1, character: error.position.column }
            },
            message: error.message,
            source: 'hql'
          });
          connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
        } else {
          console.error(`Unhandled error in validation: ${error}`);
        }
      }
    } catch (error) {
      console.error(`Error validating document: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
  * Validate syntax for all expressions
  */
  private validateSyntaxForExpressions(
    document: TextDocument,
    expressions: any[],
    diagnostics: Diagnostic[]
  ): void {
    for (const expr of expressions) {
      // Only process lists
      if (!isList(expr)) continue;
      
      // Check for specific forms that need validation
      if (expr.elements.length > 0 && isSymbol(expr.elements[0])) {
        const formName = expr.elements[0].name;
        
        switch (formName) {
          case 'fn':
          case 'fx':
          this.syntaxValidator.validateFunction(document, expr, diagnostics);
          break;
          
          case 'class':
          case 'struct':
          this.syntaxValidator.validateClass(document, expr, diagnostics);
          break;
          
          case 'enum':
          this.syntaxValidator.validateEnum(document, expr, diagnostics);
          break;
          
          case 'import':
          this.syntaxValidator.validateImport(document, expr, diagnostics);
          break;
          
          case 'export':
          this.syntaxValidator.validateExport(document, expr, diagnostics);
          break;
          
          // Add more form validations as needed
        }
      }
      
      // Recursively validate nested lists
      for (const elem of expr.elements) {
        if (isList(elem)) {
          this.validateSyntaxForExpressions(document, [elem], diagnostics);
        }
      }
    }
  }
  
  /**
  * Validate types for expressions
  */
  private validateTypesForExpressions(
    document: TextDocument,
    expressions: any[],
    diagnostics: Diagnostic[]
  ): void {
    for (const expr of expressions) {
      // Only process lists
      if (!isList(expr)) continue;
      
      // Validate function calls
      if (expr.elements.length > 0 && isSymbol(expr.elements[0])) {
        this.typeValidator.validateFunctionCall(document, expr, diagnostics);
      }
      
      // Recursively validate nested lists
      for (const elem of expr.elements) {
        if (isList(elem)) {
          this.validateTypesForExpressions(document, [elem], diagnostics);
        }
      }
    }
  }
  
  /**
  * Check for unbalanced delimiters
  */
  private checkUnbalancedDelimiters(text: string, diagnostics: Diagnostic[]): void {
    // Create a stack to check for balanced delimiters
    const stack: { char: string, line: number, col: number }[] = [];
    const lines = text.split('\n');
    
    // Go through the text character by character
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      let inString = false;
      let inComment = false;
      
      for (let colNum = 0; colNum < line.length; colNum++) {
        const char = line[colNum];
        
        // Skip string contents
        if (char === '"' && !inComment) {
          inString = !inString;
          continue;
        }
        
        // Skip comments
        if (char === ';' && !inString) {
          inComment = true;
          continue;
        }
        
        // Skip if inside string or comment
        if (inString || inComment) continue;
        
        // Process delimiters
        if ('([{'.includes(char)) {
          stack.push({ char, line: lineNum, col: colNum });
        } else if (')]}'.includes(char)) {
          const matchingOpen = char === ')' ? '(' : (char === ']' ? '[' : '{');
          
          if (stack.length === 0 || stack[stack.length - 1].char !== matchingOpen) {
            // Unmatched closing delimiter
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line: lineNum, character: colNum },
                end: { line: lineNum, character: colNum + 1 }
              },
              message: `Unmatched closing delimiter '${char}'`,
              source: 'hql'
            });
          } else {
            // Matching pair found, pop from stack
            stack.pop();
          }
        }
      }
    }
    
    // Any remaining items in the stack are unmatched opening delimiters
    for (const item of stack) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: item.line, character: item.col },
          end: { line: item.line, character: item.col + 1 }
        },
        message: `Unmatched opening delimiter '${item.char}'`,
        source: 'hql'
      });
    }
  }
  
  
  /**
  * Check for undefined symbols
  */
  private async checkUndefinedSymbols(
    document: TextDocument,
    expressions: any[],
    diagnostics: Diagnostic[]
  ): Promise<void> {
    // Get all defined symbols in the document
    const documentSymbols = this.symbolManager.getDocumentSymbols(document.uri);
    const definedSymbols = new Set<string>(
      documentSymbols.map(s => s.name)
    );
    
    // Add built-in symbols
    const builtIns = this.getBuiltInSymbols();
    builtIns.forEach(s => definedSymbols.add(s));
    
    // Collect all used symbols
    const usedSymbols = new Set<string>();
    const symbolOffsets = new Map<string, number[]>();
    
    this.collectSymbolUsages(expressions, usedSymbols, symbolOffsets, document);
    
    // Check for undefined symbols
    for (const symbol of usedSymbols) {
      // Skip JS globals and dot notations (method calls or property access)
      if (this.isJsGlobal(symbol) || symbol.includes('.')) {
        continue;
      }
      
      if (!definedSymbols.has(symbol)) {
        // This symbol is used but not defined
        const offsets = symbolOffsets.get(symbol) || [];
        for (const offset of offsets) {
          // Find line and character for the offset
          const position = document.positionAt(offset);
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: position,
              end: { line: position.line, character: position.character + symbol.length }
            },
            message: `Symbol '${symbol}' is used but not defined`,
            source: 'hql'
          });
        }
      }
    }
  }
  
  /**
  * Collect all symbol usages in expressions
  */
  /**
  * Collect all symbol usages in expressions
  */
  private collectSymbolUsages(
    expressions: any[],
    usedSymbols: Set<string>,
    symbolOffsets: Map<string, number[]>,
    document: TextDocument
  ): void {
    // Special keywords that should not be checked as undefined symbols
    const reservedKeywords = [
      'from', 'as', 'case', 'class', 'enum', 'export', 'extends',
      'import', 'implements', 'interface', 'new', 'return', 'super',
      'this', 'throw', 'typeof', 'void', 'with', 'yield'
    ];
    
    // Track function parameters and local variables throughout the scope
    const parameterScopeStack: Map<string, Set<string>> = new Map();
    parameterScopeStack.set('global', new Set<string>());
    
    // Helper to check if a symbol is in the current scope
    const isInScope = (name: string, scope: string): boolean => {
      // First check if this is a dot access (which should always be allowed)
      if (name.includes('.')) {
        const baseName = name.split('.')[0];
        // If the base object is in scope, the whole dot access is valid
        return isInScope(baseName, scope);
      }
      
      if (parameterScopeStack.has(scope)) {
        const scopeParams = parameterScopeStack.get(scope)!;
        if (scopeParams.has(name)) {
          return true;
        }
      }
      
      // Check global scope if not in local scope
      if (scope !== 'global' && parameterScopeStack.has('global')) {
        return parameterScopeStack.get('global')!.has(name);
      }
      
      return false;
    };
    
    // Collect function and parameter definitions first
    const collectFunctionParameters = (expressions: SExp[], currentScope: string = 'global') => {
      for (const expr of expressions) {
        if (!isList(expr)) continue;
        
        const elements = (expr as SList).elements;
        if (elements.length === 0) continue;
        
        // Check for function definition
        if (isSymbol(elements[0]) && 
        ((elements[0] as SSymbol).name === 'fn' || 
        (elements[0] as SSymbol).name === 'fx')) {
          
          if (elements.length < 3) continue;
          
          // Get function name
          if (!isSymbol(elements[1])) continue;
          const funcName = (elements[1] as SSymbol).name;
          
          // Add function to current scope
          if (parameterScopeStack.has(currentScope)) {
            parameterScopeStack.get(currentScope)!.add(funcName);
          }
          
          // Create a new scope for this function
          const functionScope = `${currentScope}.${funcName}`;
          if (!parameterScopeStack.has(functionScope)) {
            parameterScopeStack.set(functionScope, new Set<string>());
          }
          
          // Process parameter list
          if (!isList(elements[2])) continue;
          const params = (elements[2] as SList).elements;
          
          // Collect parameter names and properly handle typed parameters
          for (let i = 0; i < params.length; i++) {
            const param = params[i];
            
            // Handle rest parameters
            if (isSymbol(param) && 
            (param as SSymbol).name === '&' && 
            i + 1 < params.length && 
            isSymbol(params[i + 1])) {
              
              const restParam = params[i + 1] as SSymbol;
              parameterScopeStack.get(functionScope)!.add(restParam.name);
              i++; // Skip rest parameter
              continue;
            }
            
            // Handle standard parameter - this includes params that look like "name: Type"
            if (isSymbol(param)) {
              const paramName = (param as SSymbol).name;
              // If this is a typed parameter (has a colon), extract just the name
              const actualParamName = paramName.includes(':') ? paramName.split(':')[0].trim() : paramName;
              parameterScopeStack.get(functionScope)!.add(actualParamName);
              
              // Skip type definition if present (after colon)
              if (i + 1 < params.length && isSymbol(params[i + 1]) && !((params[i + 1] as SSymbol).name.startsWith(':'))) {
                i++; // Skip the type
              }
              
              // Skip default value if present
              if (i + 2 < params.length && 
                isSymbol(params[i + 1]) && 
                (params[i + 1] as SSymbol).name === '=') {
                  i += 2; // Skip = and the value
                }
              }
              // Handle typed parameter as a list (name: Type)
              else if (isList(param) && (param as SList).elements.length >= 1) {
                const paramElements = (param as SList).elements;
                if (isSymbol(paramElements[0])) {
                  parameterScopeStack.get(functionScope)!.add((paramElements[0] as SSymbol).name);
                }
              }
            }
            
            // Process function body recursively with the new scope
            for (let i = 3; i < elements.length; i++) {
              collectFunctionParameters([elements[i]], functionScope);
            }
          }
          // Process let/var bindings
          else if (isSymbol(elements[0]) && 
          ((elements[0] as SSymbol).name === 'let' || 
          (elements[0] as SSymbol).name === 'var')) {
            
            if (elements.length < 3) continue;
            
            // Simple binding: (let name value)
            if (isSymbol(elements[1])) {
              const bindingName = (elements[1] as SSymbol).name;
              parameterScopeStack.get(currentScope)!.add(bindingName);
            }
            // Multi binding: (let (name1 value1 name2 value2) body)
            else if (isList(elements[1])) {
              const bindings = (elements[1] as SList).elements;
              for (let i = 0; i < bindings.length; i += 2) {
                if (i < bindings.length && isSymbol(bindings[i])) {
                  const bindingName = (bindings[i] as SSymbol).name;
                  parameterScopeStack.get(currentScope)!.add(bindingName);
                }
              }
            }
          }
          // Process enum definitions
          else if (isSymbol(elements[0]) && (elements[0] as SSymbol).name === 'enum') {
            if (elements.length < 2 || !isSymbol(elements[1])) continue;
            
            const enumName = (elements[1] as SSymbol).name;
            parameterScopeStack.get(currentScope)!.add(enumName);
            
            // Process enum cases
            for (let i = 2; i < elements.length; i++) {
              if (!isList(elements[i])) continue;
              
              const caseExpr = elements[i] as SList;
              if (caseExpr.elements.length < 2 || 
                !isSymbol(caseExpr.elements[0]) || 
                (caseExpr.elements[0] as SSymbol).name !== 'case' ||
                !isSymbol(caseExpr.elements[1])) continue;
                
                const caseName = (caseExpr.elements[1] as SSymbol).name;
                // Add both enum name and qualified case name to scope
                parameterScopeStack.get(currentScope)!.add(`${enumName}.${caseName}`);
              }
            }
            
            // Process nested expressions
            for (const elem of elements) {
              if (isList(elem)) {
                collectFunctionParameters([elem], currentScope);
              }
            }
          }
        };
        
        // Collect all defined parameters and variables
        collectFunctionParameters(expressions);
        
        // Now collect usage with the parameter scope information
        const collectSymbolsInExpr = (expr: any, currentScope: string = 'global') => {
          if (isSymbol(expr)) {
            const name = (expr as SSymbol).name;
            
            // Skip certain symbols based on context
            if (
              // Skip keyword literals (starting with :)
              name.startsWith(':') || 
              // Skip reserved keywords
              reservedKeywords.includes(name) ||
              // Skip parameters defined in function scope
              isInScope(name, currentScope)
            ) {
              return;
            }
            
            // Handle dot notation (method calls or property access)
            if (name.includes('.')) {
              const parts = name.split('.');
              // Only check the object part, not the method/property
              if (parts.length > 1 && !isInScope(parts[0], currentScope)) {
                // Check if the base object exists
                usedSymbols.add(parts[0]);
                
                // Record offset if position is available
                if (expr.position) {
                  const offset = document.offsetAt({
                    line: expr.position.line - 1,
                    character: expr.position.column - 1
                  });
                  
                  if (!symbolOffsets.has(parts[0])) {
                    symbolOffsets.set(parts[0], []);
                  }
                  symbolOffsets.get(parts[0])?.push(offset);
                }
              }
              return;
            }
            
            // Handle named parameters (symbols ending with a colon)
            if (name.endsWith(':')) {
              return;
            }
            
            // Add the symbol as used if not in current scope
            if (!isInScope(name, currentScope)) {
              usedSymbols.add(name);
              
              // Record offset if position is available
              if (expr.position) {
                const offset = document.offsetAt({
                  line: expr.position.line - 1,
                  character: expr.position.column - 1
                });
                
                if (!symbolOffsets.has(name)) {
                  symbolOffsets.set(name, []);
                }
                symbolOffsets.get(name)?.push(offset);
              }
            }
          } else if (isList(expr)) {
            const elements = (expr as SList).elements;
            if (elements.length === 0) return;
            
            // Check for function definition
            if (isSymbol(elements[0]) && 
            ((elements[0] as SSymbol).name === 'fn' || 
            (elements[0] as SSymbol).name === 'fx')) {
              
              if (elements.length < 3 || !isSymbol(elements[1])) return;
              
              const funcName = (elements[1] as SSymbol).name;
              const functionScope = `${currentScope}.${funcName}`;
              
              // Process function body with function scope
              for (let i = 3; i < elements.length; i++) {
                collectSymbolsInExpr(elements[i], functionScope);
              }
              return;
            }
            
            // Check for let/var with multiple bindings and body
            if (isSymbol(elements[0]) && 
            ((elements[0] as SSymbol).name === 'let' || 
            (elements[0] as SSymbol).name === 'var') && 
            elements.length >= 3 && 
            isList(elements[1])) {
              
              // Process binding values within current scope
              const bindings = (elements[1] as SList).elements;
              for (let i = 1; i < bindings.length; i += 2) {
                if (i < bindings.length) {
                  collectSymbolsInExpr(bindings[i], currentScope);
                }
              }
              
              // Create a new scope for the body
              const letScope = `${currentScope}.let${Date.now()}`;
              if (!parameterScopeStack.has(letScope)) {
                parameterScopeStack.set(letScope, new Set<string>());
              }
              
              // Add bindings to let scope
              for (let i = 0; i < bindings.length; i += 2) {
                if (i < bindings.length && isSymbol(bindings[i])) {
                  parameterScopeStack.get(letScope)!.add((bindings[i] as SSymbol).name);
                }
              }
              
              // Process body with let scope
              for (let i = 2; i < elements.length; i++) {
                collectSymbolsInExpr(elements[i], letScope);
              }
              return;
            }
            
            // Special handling for method chains
            if (elements.length > 0 && 
              isSymbol(elements[0]) && 
              (elements[0] as SSymbol).name.includes('.')) {
                
                // This is a method chain like (object.method arg1 arg2)
                // Extract the object part and check it
                const fullMethodName = (elements[0] as SSymbol).name;
                const objectName = fullMethodName.split('.')[0];
                
                // Only check if the base object is not in scope
                if (!isInScope(objectName, currentScope)) {
                  usedSymbols.add(objectName);
                  
                  // Record offset if position is available
                  if (elements[0].position) {
                    const offset = document.offsetAt({
                      line: elements[0].position.line - 1,
                      character: elements[0].position.column - 1
                    });
                    
                    if (!symbolOffsets.has(objectName)) {
                      symbolOffsets.set(objectName, []);
                    }
                    symbolOffsets.get(objectName)?.push(offset);
                  }
                }
                
                // Process other arguments in the method call
                for (let i = 1; i < elements.length; i++) {
                  collectSymbolsInExpr(elements[i], currentScope);
                }
                
                return;
              }
              
              // Process all other expressions
              for (const elem of elements) {
                collectSymbolsInExpr(elem, currentScope);
              }
            }
          };
          
          // Process all expressions
          for (const expr of expressions) {
            collectSymbolsInExpr(expr);
          }
        }
        
        
        /**
        * Get all built-in symbols for HQL
        */
        private getBuiltInSymbols(): string[] {
          return [
            // Control flow
            'if', 'do', 'when', 'unless', 'cond', 'loop', 'recur', 'while', 'for',
            
            // Definitions
            'fn', 'fx', 'let', 'var', 'class', 'struct', 'enum', 'import', 'export',
            'macro', 'defmacro',
            
            // Core functions
            'list', 'vector', 'hash-map', 'hash-set', 'str', 'print', 'println',
            'pr', 'prn', 'cons', 'first', 'rest', 'nth', 'get', 'assoc', 'dissoc',
            'count', 'empty?', 'map', 'filter', 'reduce', 'apply', 'concat', 'join',
            
            // Math
            '+', '-', '*', '/', 'rem', 'mod', 'inc', 'dec', 'min', 'max',
            'abs', 'rand', 'rand-int', 'quot',
            
            // Comparison
            '=', '<', '>', '<=', '>=', 'not=', 'and', 'or', 'not',
            
            // Type conversions/checks
            'int', 'float', 'str', 'keyword', 'symbol', 'vector', 'list?',
            'vector?', 'map?', 'set?', 'nil?', 'true?', 'false?', 'symbol?',
            'keyword?', 'number?', 'string?', 'fn?', 'instance?',
            
            // Method-like functions
            'length', 'contains?', 'find', 'indexOf', 'substring',
            'join', // Added join method explicitly
            
            // Object/collection access operators
            '.', '..', '->',
            
            // Others
            'throw', 'try', 'catch', 'finally', 'new', 'into', 'this', 'super',
            'return', 'set!',
            
            // Common short names that might be used in examples
            'x', 'y', 'z', 'a', 'b', 'c', 'i', 'j', 'k', 'n', 'm',
            
            // DOM and web APIs when in browser context
            'document', 'window',
            
            // Syntax symbols
            '->'  // Return type arrow
          ];
        }
        
        /**
        * Check if a symbol is a JavaScript global
        */
        private isJsGlobal(name: string): boolean {
          const jsGlobals = [
            'undefined', 'NaN', 'Infinity', 'Object', 'Array', 'String',
            'Number', 'Boolean', 'RegExp', 'Date', 'Math', 'JSON',
            'console', 'setTimeout', 'setInterval', 'clearTimeout',
            'clearInterval', 'parseInt', 'parseFloat', 'isNaN',
            'isFinite', 'encodeURI', 'decodeURI', 'encodeURIComponent',
            'decodeURIComponent', 'Error', 'Promise', 'Map', 'Set',
            'WeakMap', 'WeakSet', 'Symbol', 'Proxy', 'Reflect'
          ];
          
          return jsGlobals.includes(name);
        }
      }