import {
    TextDocument,
    Diagnostic,
    DiagnosticSeverity,
    Range,
    Position
  } from 'vscode-languageserver';
  
  import { SExp, SList, SSymbol, SourcePosition } from '../../parser';
  import { isList, isSymbol, isLiteral, isString, isNumber, isBoolean } from '../../s-exp/types';
  import { SymbolManager } from '../symbolManager';
  
  /**
   * TypeValidator provides type checking for HQL
   */
  export class TypeValidator {
    private symbolManager: SymbolManager;
    
    constructor(symbolManager: SymbolManager) {
      this.symbolManager = symbolManager;
    }
    
    /**
     * Check for type errors in function calls
     */
    public validateFunctionCall(
      document: TextDocument,
      expr: SList,
      diagnostics: Diagnostic[]
    ): void {
      if (expr.elements.length === 0 || !isSymbol(expr.elements[0])) {
        return;
      }
      
      const funcSymbol = expr.elements[0] as SSymbol;
      const funcName = funcSymbol.name;
      
      // Skip special forms
      if (this.isSpecialForm(funcName)) {
        return;
      }
      
      // Find function definition in document symbols
      const funcDef = this.symbolManager.getDocumentSymbols(document.uri).find(
        sym => sym.kind === 12 && sym.name === funcName // 12 = Function
      );
      
      if (!funcDef || !funcDef.data?.params) {
        return; // Can't validate without function definition
      }
      
      const params = funcDef.data.params;
      const isPure = funcDef.data?.isFx === true;
      
      // If it's a pure function (fx), do more strict type checking
      if (isPure) {
        this.validatePureFunctionCall(document, expr, funcDef, diagnostics);
        return;
      }
      
      // For regular functions, just check parameter count
      // Skip if function has rest parameters
      if (params.some((p: any) => p.name === '&')) {
        return;
      }
      
      // Calculate required parameters (those without defaults)
      const requiredParamCount = params.filter((p: any) => !p.defaultValue).length;
      const actualParamCount = expr.elements.length - 1;
      
      if (actualParamCount > params.length) {
        this.addDiagnostic(
          document,
          expr,
          `Too many arguments in call to '${funcName}'. Expected at most ${params.length}, got ${actualParamCount}`,
          DiagnosticSeverity.Warning,
          diagnostics
        );
      } else if (actualParamCount < requiredParamCount) {
        this.addDiagnostic(
          document,
          expr,
          `Too few arguments in call to '${funcName}'. Expected at least ${requiredParamCount}, got ${actualParamCount}`,
          DiagnosticSeverity.Warning,
          diagnostics
        );
      }
    }
    
    /**
     * Validate a pure function call with type checking
     */
    private validatePureFunctionCall(
      document: TextDocument,
      expr: SList,
      funcDef: any,
      diagnostics: Diagnostic[]
    ): void {
      if (!isSymbol(expr.elements[0])) {
        return;
      }
      
      const funcSymbol = expr.elements[0] as SSymbol;
      const funcName = funcSymbol.name;
      const params = funcDef.data.params;
      
      // Skip if function has rest parameters
      if (params.some((p: any) => p.name === '&')) {
        return;
      }
      
      // Calculate required parameters (those without defaults)
      const requiredParamCount = params.filter((p: any) => !p.defaultValue).length;
      const actualParamCount = expr.elements.length - 1;
      
      if (actualParamCount > params.length) {
        this.addDiagnostic(
          document,
          expr,
          `Too many arguments in call to '${funcName}'. Expected at most ${params.length}, got ${actualParamCount}`,
          DiagnosticSeverity.Warning,
          diagnostics
        );
        return;
      } else if (actualParamCount < requiredParamCount) {
        this.addDiagnostic(
          document,
          expr,
          `Too few arguments in call to '${funcName}'. Expected at least ${requiredParamCount}, got ${actualParamCount}`,
          DiagnosticSeverity.Warning,
          diagnostics
        );
        return;
      }
      
      // Check each argument against expected type
      for (let i = 0; i < Math.min(actualParamCount, params.length); i++) {
        const argExpr = expr.elements[i + 1];
        const param = params[i];
        
        if (!param.type) {
          continue; // Skip if no type information
        }
        
        // Check argument type against parameter type
        const argType = this.inferExpressionType(argExpr);
        if (argType && !this.isTypeCompatible(argType, param.type)) {
          this.addDiagnostic(
            document,
            argExpr,
            `Type mismatch for parameter '${param.name}'. Expected ${param.type}, got ${argType}`,
            DiagnosticSeverity.Warning,
            diagnostics
          );
        }
      }
    }
    
    /**
     * Infer the type of an expression
     */
    private inferExpressionType(expr: SExp): string | null {
      if (isSymbol(expr)) {
        // Symbol might be a variable - we'd need symbol resolution
        return null; // Can't determine reliably
      } else if (isNumber(expr)) {
        // Check if it's an integer or float
        return Number.isInteger(expr.value) ? 'Int' : 'Float';
      } else if (isString(expr)) {
        return 'String';
      } else if (isBoolean(expr)) {
        return 'Bool';
      } else if (isLiteral(expr)) {
        if (typeof expr.value === 'number') {
          return Number.isInteger(expr.value) ? 'Int' : 'Float';
        } else if (typeof expr.value === 'string') {
          return 'String';
        } else if (typeof expr.value === 'boolean') {
          return 'Bool';
        } else if (expr.value === null) {
          return 'nil';
        }
      } else if (isList(expr)) {
        if (expr.elements.length === 0) {
          return 'List';
        }
        
        // Check if it's a vector or constructor call
        if (isSymbol(expr.elements[0])) {
          const firstSymbol = (expr.elements[0] as SSymbol).name;
          if (firstSymbol === 'vector') {
            return 'Vector';
          } else if (firstSymbol === 'list') {
            return 'List';
          } else if (firstSymbol === 'hash-map') {
            return 'Map';
          } else if (firstSymbol === 'hash-set') {
            return 'Set';
          }
          
          // Check if it's a new expression
          if (firstSymbol === 'new' && expr.elements.length > 1 && isSymbol(expr.elements[1])) {
            return (expr.elements[1] as SSymbol).name;
          }
        }
      }
      
      return null; // Unknown type
    }
    
    /**
     * Check if two types are compatible
     */
    private isTypeCompatible(sourceType: string, targetType: string): boolean {
      if (sourceType === targetType) {
        return true;
      }
      
      // Any can be assigned to any type
      if (targetType === 'Any' || sourceType === 'Any') {
        return true;
      }
      
      // Numeric type compatibility
      if ((sourceType === 'Int' || sourceType === 'Float') &&
          (targetType === 'Int' || targetType === 'Float' || targetType === 'Number')) {
        return true;
      }
      
      // Collection compatibility (basic)
      if ((sourceType === 'List' || sourceType === 'Vector' || sourceType === 'Array') &&
          (targetType === 'List' || targetType === 'Vector' || targetType === 'Array')) {
        return true;
      }
      
      // Enum compatibility would need knowledge of the enum hierarchy
      
      return false;
    }
    
    /**
     * Check if a symbol is a special form
     */
    private isSpecialForm(name: string): boolean {
      const specialForms = [
        'fn', 'fx', 'if', 'do', 'let', 'var', 'loop', 'recur',
        'cond', 'when', 'unless', 'import', 'export', 'class',
        'struct', 'enum', 'macro', 'defmacro', 'return'
      ];
      return specialForms.includes(name);
    }
    
    /**
     * Add a diagnostic message for an expression
     */
    private addDiagnostic(
      document: TextDocument,
      expr: SExp,
      message: string,
      severity: DiagnosticSeverity,
      diagnostics: Diagnostic[]
    ): void {
      try {
        // Get the position information if available
        const pos = (expr as any).position as SourcePosition | undefined;
        if (pos) {
          // Convert from 1-indexed to 0-indexed
          const startLine = Math.max(0, pos.line - 1);
          const startChar = Math.max(0, pos.column - 1);
          
          let endChar = startChar;
          // Try to determine the length from the name
          if (isSymbol(expr)) {
            endChar = startChar + (expr as SSymbol).name.length;
          } else {
            // Default to a reasonable span
            endChar = startChar + 1;
          }
          
          diagnostics.push({
            severity,
            range: {
              start: { line: startLine, character: startChar },
              end: { line: startLine, character: endChar }
            },
            message,
            source: 'hql'
          });
          
          return;
        }
        
        // If no position info, try to use a fallback
        diagnostics.push({
          severity,
          range: Range.create(Position.create(0, 0), Position.create(0, 1)),
          message: `${message} (position unknown)`,
          source: 'hql'
        });
      } catch (error) {
        // If all else fails, use document start
        diagnostics.push({
          severity,
          range: Range.create(Position.create(0, 0), Position.create(0, 1)),
          message: `${message} (error: ${error})`,
          source: 'hql'
        });
      }
    }
  }