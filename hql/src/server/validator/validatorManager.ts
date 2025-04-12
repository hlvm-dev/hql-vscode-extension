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
                    start: { line: error.position.line, character: error.position.column },
                    end: { line: error.position.line, character: error.position.column + 1 }
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
                start: { line: error.position.line, character: error.position.column },
                end: { line: error.position.line, character: error.position.column + 1 }
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
        // Skip JS globals
        if (this.isJsGlobal(symbol)) {
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
      
      const collectSymbolsInExpr = (expr: any, context: { 
        isImport: boolean,
        isEnum: boolean,
        isParamName: boolean,
        isNamedParam: boolean,
        paramNames?: Set<string>  // New: track function parameters
      } = { 
        isImport: false, 
        isEnum: false, 
        isParamName: false, 
        isNamedParam: false 
      }) => {
        if (isSymbol(expr)) {
          const name = (expr as SSymbol).name;
          
          // Skip certain symbols based on context
          if (
            // Skip keyword literals (starting with :)
            name.startsWith(':') || 
            // Skip 'from' in imports
            (context.isImport && name === 'from') ||
            // Skip reserved keywords
            reservedKeywords.includes(name) ||
            // Skip parameters defined in function scope
            (context.paramNames && context.paramNames.has(name))
          ) {
            return;
          }
          
          // Handle named parameters (symbols ending with a colon)
          if (name.endsWith(':')) {
            // Remove the colon before checking if it's a valid symbol
            const paramName = name.substring(0, name.length - 1);
            // Named parameters are not undefined symbols - they're parameter names
            // Don't add them to usedSymbols
            return;
          }
          
          // In enum cases, don't consider the case names as undefined
          if (context.isEnum) {
            return;
          }
          
          // Don't flag parameter names as undefined
          if (context.isParamName) {
            return;
          }
          
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
        } else if (isList(expr)) {
          // Check for special forms
          if (expr.elements.length > 0 && isSymbol(expr.elements[0])) {
            const firstSymbol = (expr.elements[0] as SSymbol).name;
            
            // Handle import statements
            if (firstSymbol === 'import') {
              // Process import statement elements
              if (expr.elements.length > 1) {
                // Process the import vector or symbol
                if (isList(expr.elements[1])) {
                  // Vector import: (import [symbol1 symbol2] from "...")
                  collectSymbolsInExpr(expr.elements[1], { ...context, isImport: true });
                } else if (isSymbol(expr.elements[1])) {
                  // Default import: (import default from "...")
                  collectSymbolsInExpr(expr.elements[1], { ...context, isImport: true });
                }
                
                // Skip checking 'from' and the module path
                for (let i = 2; i < expr.elements.length; i++) {
                  if (isSymbol(expr.elements[i]) && (expr.elements[i] as SSymbol).name === 'from') {
                    // Skip 'from' and the next element (the module path)
                    i++;
                    continue;
                  }
                  collectSymbolsInExpr(expr.elements[i], { ...context, isImport: true });
                }
                return; // Skip default processing of elements
              }
            }
            
            // Handle enum definitions
            else if (firstSymbol === 'enum' && expr.elements.length > 1) {
              // Skip the enum name (it's a definition)
              for (let i = 2; i < expr.elements.length; i++) {
                const caseExpr = expr.elements[i];
                if (isList(caseExpr) && 
                    caseExpr.elements.length > 0 && 
                    isSymbol(caseExpr.elements[0]) && 
                    (caseExpr.elements[0] as SSymbol).name === 'case') {
                  // This is a case definition, skip checking the case name
                  for (let j = 2; j < caseExpr.elements.length; j++) {
                    collectSymbolsInExpr(caseExpr.elements[j], context);
                  }
                } else {
                  collectSymbolsInExpr(caseExpr, context);
                }
              }
              return; // Skip default processing of elements
            }
            
            // Handle function definitions
            else if ((firstSymbol === 'fn' || firstSymbol === 'fx') && 
                     expr.elements.length > 2 && 
                     isList(expr.elements[2])) {
              // Skip the function name (element 1, it's a definition)
              
              // Create a list of parameter names to skip in the function body
              const paramNames = new Set<string>();
              
              // Handle parameter list (element 2)
              const paramList = expr.elements[2];
              for (const param of paramList.elements) {
                if (isSymbol(param)) {
                  // Regular parameter, don't check as undefined
                  // And add to parameter names to skip in function body
                  paramNames.add((param as SSymbol).name);
                  continue;
                } else if (isList(param)) {
                  // Typed parameter like (name: Type)
                  if (param.elements.length >= 1 && isSymbol(param.elements[0])) {
                    // Add parameter name to list of names to skip
                    paramNames.add((param.elements[0] as SSymbol).name);
                    
                    // Still check the type
                    for (let i = 1; i < param.elements.length; i++) {
                      collectSymbolsInExpr(param.elements[i], context);
                    }
                  }
                }
              }
              
              // Process function body with parameter context
              const functionContext = { 
                ...context, 
                // Custom contextual data for function scope
                paramNames 
              };
              
              for (let i = 3; i < expr.elements.length; i++) {
                collectSymbolsInExpr(expr.elements[i], functionContext);
              }
              return; // Skip default processing of elements
            }
            
            // Handle function calls with named parameters
            else if (!['let', 'var', 'class', 'struct', 'macro', 'defmacro'].includes(firstSymbol)) {
              // This might be a function call with named parameters
              collectSymbolsInExpr(expr.elements[0], context); // Check the function name
              
              for (let i = 1; i < expr.elements.length; i++) {
                const arg = expr.elements[i];
                
                if (isSymbol(arg) && (arg as SSymbol).name.endsWith(':')) {
                  // This is a named parameter, skip checking it
                  // But check the value in the next element
                  if (i + 1 < expr.elements.length) {
                    collectSymbolsInExpr(expr.elements[i + 1], context);
                    i++; // Skip the value since we've processed it
                  }
                } else {
                  collectSymbolsInExpr(arg, context);
                }
              }
              return; // Skip default processing of elements
            }
          }
          
          // Process list elements for cases not handled above
          for (const elem of expr.elements) {
            collectSymbolsInExpr(elem, context);
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
        'count', 'empty?', 'map', 'filter', 'reduce', 'apply', 'concat',
        
        // Math
        '+', '-', '*', '/', 'rem', 'mod', 'inc', 'dec', 'min', 'max',
        'abs', 'rand', 'rand-int', 'quot',
        
        // Comparison
        '=', '<', '>', '<=', '>=', 'not=', 'and', 'or', 'not',
        
        // Type conversions/checks
        'int', 'float', 'str', 'keyword', 'symbol', 'vector', 'list?',
        'vector?', 'map?', 'set?', 'nil?', 'true?', 'false?', 'symbol?',
        'keyword?', 'number?', 'string?', 'fn?', 'instance?',
        
        // Others
        'throw', 'try', 'catch', 'finally', 'new', 'into', 'this', 'super',
        'return',
        
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