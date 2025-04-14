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
    
    // Skip special forms and method calls (containing dots)
    if (this.isSpecialForm(funcName) || funcName.includes('.')) {
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
    if (params.some((p: any) => p.name === '&' || p.type === 'Rest')) {
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
    if (params.some((p: any) => p.name === '&' || p.type === 'Rest')) {
      return;
    }
    
    // Calculate required parameters (those without defaults)
    const requiredParamCount = params.filter((p: any) => !p.defaultValue).length;
    const actualParamCount = expr.elements.length - 1;
    
    // Check for named parameters
    let namedArguments = false;
    for (let i = 1; i < expr.elements.length; i++) {
      if (isSymbol(expr.elements[i]) && 
          (expr.elements[i] as SSymbol).name.endsWith(':')) {
        namedArguments = true;
        break;
      }
    }
    
    // If using named arguments, handle differently
    if (namedArguments) {
      this.validateNamedParameters(document, expr, funcDef, diagnostics);
      return;
    }
    
    // Check parameter count for positional arguments
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
      
      if (!param.type || param.type === 'Any') {
        continue; // Skip if no type information or Any type
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
   * Validate a function call with named parameters
   */
  private validateNamedParameters(
    document: TextDocument,
    expr: SList,
    funcDef: any,
    diagnostics: Diagnostic[]
  ): void {
    const funcName = (expr.elements[0] as SSymbol).name;
    const params = funcDef.data.params;
    
    // Build a map of parameter names to their definitions
    const paramMap = new Map<string, any>();
    for (const param of params) {
      paramMap.set(param.name, param);
    }
    
    // Check each named argument
    for (let i = 1; i < expr.elements.length; i++) {
      const argExpr = expr.elements[i];
      
      // Skip non-symbol arguments
      if (!isSymbol(argExpr)) {
        continue;
      }
      
      const argName = (argExpr as SSymbol).name;
      if (!argName.endsWith(':')) {
        // Not a named parameter, skip
        continue;
      }
      
      // Extract the parameter name without colon
      const paramName = argName.substring(0, argName.length - 1);
      
      // Check if parameter exists
      if (!paramMap.has(paramName)) {
        this.addDiagnostic(
          document,
          argExpr,
          `Unknown parameter '${paramName}' in call to '${funcName}'`,
          DiagnosticSeverity.Warning,
          diagnostics
        );
        continue;
      }
      
      // Check if there's a value for this named parameter
      if (i + 1 >= expr.elements.length) {
        this.addDiagnostic(
          document,
          argExpr,
          `Missing value for parameter '${paramName}'`,
          DiagnosticSeverity.Warning,
          diagnostics
        );
        continue;
      }
      
      // Get the value and check its type
      const valueExpr = expr.elements[i + 1];
      const param = paramMap.get(paramName);
      
      if (param.type && param.type !== 'Any') {
        const valueType = this.inferExpressionType(valueExpr);
        if (valueType && !this.isTypeCompatible(valueType, param.type)) {
          this.addDiagnostic(
            document,
            valueExpr,
            `Type mismatch for parameter '${paramName}'. Expected ${param.type}, got ${valueType}`,
            DiagnosticSeverity.Warning,
            diagnostics
          );
        }
      }
      
      // Skip the value since we've processed it
      i++;
    }
  }
  
  /**
   * Infer the type of an expression
   */
  private inferExpressionType(expr: SExp): string | null {
    try {
      // Symbol might be a variable - we'd need symbol resolution
      if (isSymbol(expr)) {
        const name = (expr as SSymbol).name;
        
        // Handle dot notation (method calls or property access)
        if (name.includes('.')) {
          // For dot notation, we need to look at the base object type
          const baseName = name.split('.')[0];
          // Try to infer the base object type (but this would require a full type system)
          return 'Any'; // Simplified for now - allowing any dot access
        }
        
        // Check for enum values
        if (name.includes('.')) {
          const parts = name.split('.');
          if (parts.length === 2 && this.symbolManager.isEnumType(parts[0])) {
            return parts[0]; // Return enum type for enum values
          }
        }
        
        return null; // Can't determine reliably for other symbols
      }
      // Handle numeric literals
      else if (isNumber(expr)) {
        // Check if it's an integer or float
        return Number.isInteger(expr.value) ? 'Int' : 'Float';
      }
      // Handle string literals
      else if (isString(expr)) {
        return 'String';
      }
      // Handle boolean literals
      else if (isBoolean(expr)) {
        return 'Bool';
      }
      // Handle generic literals
      else if (isLiteral(expr)) {
        if (typeof expr.value === 'number') {
          return Number.isInteger(expr.value) ? 'Int' : 'Float';
        } else if (typeof expr.value === 'string') {
          return 'String';
        } else if (typeof expr.value === 'boolean') {
          return 'Bool';
        } else if (expr.value === null) {
          return 'nil';
        }
      }
      // Handle list expressions
      else if (isList(expr)) {
        const list = expr as SList;
        if (list.elements.length === 0) {
          return 'List';
        }
        
        // Check for vector/array literals
        if (isSymbol(list.elements[0])) {
          const firstSymbol = (list.elements[0] as SSymbol).name;
          if (firstSymbol === 'vector' || firstSymbol === 'empty-array') {
            return 'Vector';
          } else if (firstSymbol === 'list') {
            return 'List';
          } else if (firstSymbol === 'hash-map' || firstSymbol === 'empty-map') {
            return 'Map';
          } else if (firstSymbol === 'hash-set' || firstSymbol === 'empty-set') {
            return 'Set';
          }
          
          // Check for new expressions
          if (firstSymbol === 'new' && list.elements.length > 1 && isSymbol(list.elements[1])) {
            return (list.elements[1] as SSymbol).name;
          }
          
          // Check for array type annotations [Type]
          if (firstSymbol === 'array-type' && list.elements.length > 1 && isSymbol(list.elements[1])) {
            return `[${(list.elements[1] as SSymbol).name}]`;
          }
        }
      }
    } catch (_e) {
      // Ignore errors in type inference
    }
    
    return 'Any'; // Default to Any if can't determine
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
    if ((sourceType === 'Int' || sourceType === 'Float' || sourceType === 'Number' || sourceType === 'Double') &&
        (targetType === 'Int' || targetType === 'Float' || targetType === 'Number' || targetType === 'Double')) {
      return true;
    }
    
    // Collection compatibility (basic)
    if ((sourceType === 'List' || sourceType === 'Vector' || sourceType === 'Array') &&
        (targetType === 'List' || targetType === 'Vector' || targetType === 'Array')) {
      return true;
    }
    
    // Check for array type compatibility
    if (sourceType.startsWith('[') && targetType.startsWith('[')) {
      const sourceInnerType = sourceType.substring(1, sourceType.length - 1);
      const targetInnerType = targetType.substring(1, targetType.length - 1);
      return this.isTypeCompatible(sourceInnerType, targetInnerType);
    }
    
    // Check if the target type is an enum and source is a compatible value
    if (this.symbolManager.isEnumType(targetType)) {
      if (sourceType.startsWith(targetType + '.')) {
        return true; // direct enum value access
      }
      
      // Check if the source is in the list of enum cases
      const enumCases = this.symbolManager.getEnumCases(targetType);
      if (enumCases.includes(sourceType)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if a symbol is a special form
   */
  private isSpecialForm(name: string): boolean {
    const specialForms = [
      'fn', 'fx', 'if', 'do', 'let', 'var', 'loop', 'recur',
      'cond', 'when', 'unless', 'import', 'export', 'class',
      'struct', 'enum', 'macro', 'defmacro', 'return', 'set!'
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