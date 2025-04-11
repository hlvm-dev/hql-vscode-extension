import {
  TextDocument,
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Position
} from 'vscode-languageserver';

import { SExp, SList, SSymbol } from '../../parser';
import { isList, isSymbol, isString, isLiteral } from '../../s-exp/types';

/**
 * Helper for validating various HQL syntax forms
 */
export class SyntaxValidator {
  /**
   * Validate a function declaration
   */
  public validateFunction(
    document: TextDocument,
    expr: SList,
    diagnostics: Diagnostic[]
  ): void {
    // Check if first element is a symbol and get its name
    if (!isSymbol(expr.elements[0])) return;
    const isPure = (expr.elements[0] as SSymbol).name === 'fx';
    
    // Check for function name
    if (expr.elements.length < 2) {
      this.addDiagnostic(
        document,
        expr,
        `Function is missing a name`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    if (!isSymbol(expr.elements[1])) {
      this.addDiagnostic(
        document,
        expr,
        `Function name must be a symbol`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    // Check for parameter list
    if (expr.elements.length < 3) {
      this.addDiagnostic(
        document,
        expr,
        `Function is missing parameter list`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    if (!isList(expr.elements[2])) {
      this.addDiagnostic(
        document,
        expr,
        `Function parameter list must be a list`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    // For fx functions, validate return type
    if (isPure) {
      // Check for return type
      if (expr.elements.length < 4) {
        this.addDiagnostic(
          document,
          expr,
          `Pure function (fx) requires a return type with (-> Type) syntax`,
          DiagnosticSeverity.Error,
          diagnostics
        );
        return;
      }
      
      if (!isList(expr.elements[3]) || 
          expr.elements[3].elements.length < 2 ||
          !isSymbol(expr.elements[3].elements[0]) ||
          (expr.elements[3].elements[0] as SSymbol).name !== "->") {
        
        this.addDiagnostic(
          document,
          expr,
          `Pure function (fx) requires a return type with (-> Type) syntax`,
          DiagnosticSeverity.Error,
          diagnostics
        );
        return;
      }
    }
    
    // Check if function has a body
    if ((isPure && expr.elements.length < 5) || (!isPure && expr.elements.length < 4)) {
      this.addDiagnostic(
        document,
        expr,
        `Function is missing a body`,
        DiagnosticSeverity.Error,
        diagnostics
      );
    }
    
    // Check for parameter types in pure functions
    if (isPure && isList(expr.elements[2])) {
      this.validateParameterTypes(document, expr.elements[2], diagnostics);
    }
  }
  
  /**
   * Validate parameter types in pure functions
   */
  private validateParameterTypes(
    document: TextDocument,
    paramList: SList,
    diagnostics: Diagnostic[]
  ): void {
    const params = paramList.elements;
    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      // Skip rest parameters and their bindings
      if (isSymbol(param) && (param as SSymbol).name === '&') {
        i++; // Skip the next parameter
        continue;
      }
      
      // Check if parameter has a type annotation
      if (isSymbol(param) && i + 2 < params.length && 
          isSymbol(params[i+1]) && (params[i+1] as SSymbol).name === ':') {
        // It has a type, which is good
        i += 2; // Skip the colon and type
      } else if (isSymbol(param)) {
        // Parameter has no type annotation
        this.addDiagnostic(
          document,
          param,
          `Parameter '${(param as SSymbol).name}' in pure function should have a type annotation`,
          DiagnosticSeverity.Warning,
          diagnostics
        );
      }
    }
  }
  
  /**
   * Validate a class or struct declaration
   */
  public validateClass(
    document: TextDocument,
    expr: SList,
    diagnostics: Diagnostic[]
  ): void {
    if (!isSymbol(expr.elements[0])) return;
    const isClass = (expr.elements[0] as SSymbol).name === 'class';
    const formType = isClass ? 'Class' : 'Struct';
    
    // Check for class name
    if (expr.elements.length < 2) {
      this.addDiagnostic(
        document,
        expr,
        `${formType} is missing a name`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    if (!isSymbol(expr.elements[1])) {
      this.addDiagnostic(
        document,
        expr,
        `${formType} name must be a symbol`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    // Check class name starts with uppercase
    const className = (expr.elements[1] as SSymbol).name;
    if (!/^[A-Z]/.test(className)) {
      this.addDiagnostic(
        document,
        expr.elements[1],
        `${formType} name should start with an uppercase letter`,
        DiagnosticSeverity.Warning,
        diagnostics
      );
    }
    
    // Check for at least one member
    if (expr.elements.length < 3) {
      this.addDiagnostic(
        document,
        expr,
        `${formType} should have at least one member`,
        DiagnosticSeverity.Warning,
        diagnostics
      );
      return;
    }
    
    // Validate class members
    this.validateClassMembers(document, expr, diagnostics);
  }
  
  /**
   * Validate class members
   */
  private validateClassMembers(
    document: TextDocument,
    classExpr: SList,
    diagnostics: Diagnostic[]
  ): void {
    // Skip class/struct keyword and name
    for (let i = 2; i < classExpr.elements.length; i++) {
      const member = classExpr.elements[i];
      if (!isList(member) || member.elements.length === 0) {
        this.addDiagnostic(
          document,
          member,
          `Class member must be a list starting with a valid keyword`,
          DiagnosticSeverity.Error,
          diagnostics
        );
        continue;
      }
      
      if (!isSymbol(member.elements[0])) {
        this.addDiagnostic(
          document,
          member,
          `Class member must start with a valid keyword`,
          DiagnosticSeverity.Error,
          diagnostics
        );
        continue;
      }
      
      const memberType = (member.elements[0] as SSymbol).name;
      if (!['var', 'let', 'constructor', 'fn', 'fx', 'method', 'field'].includes(memberType)) {
        this.addDiagnostic(
          document,
          member.elements[0],
          `Invalid class member type '${memberType}'`,
          DiagnosticSeverity.Error,
          diagnostics
        );
      }
      
      // Validate specific member types
      switch (memberType) {
        case 'var':
        case 'let':
          this.validateClassField(document, member as SList, diagnostics);
          break;
        case 'field':
          this.validateStructField(document, member as SList, diagnostics);
          break;
        case 'constructor':
          this.validateConstructor(document, member as SList, diagnostics);
          break;
        case 'fn':
        case 'fx':
        case 'method':
          this.validateMethod(document, member as SList, diagnostics);
          break;
      }
    }
  }
  
  /**
   * Validate a class field (var/let)
   */
  private validateClassField(
    document: TextDocument,
    expr: SList,
    diagnostics: Diagnostic[]
  ): void {
    // Fields must have at least a name
    if (expr.elements.length < 2) {
      this.addDiagnostic(
        document,
        expr,
        `Class field is missing a name`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    if (!isSymbol(expr.elements[1])) {
      this.addDiagnostic(
        document,
        expr,
        `Class field name must be a symbol`,
        DiagnosticSeverity.Error,
        diagnostics
      );
    }
  }
  
  /**
   * Validate a struct field with type annotation
   */
  private validateStructField(
    document: TextDocument,
    expr: SList,
    diagnostics: Diagnostic[]
  ): void {
    // Fields must have at least a name
    if (expr.elements.length < 2) {
      this.addDiagnostic(
        document,
        expr,
        `Struct field is missing a name`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    if (!isSymbol(expr.elements[1])) {
      this.addDiagnostic(
        document,
        expr,
        `Struct field name must be a symbol`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    // Check for type annotation
    if (expr.elements.length < 4 ||
        !isSymbol(expr.elements[2]) ||
        (expr.elements[2] as SSymbol).name !== ':' ||
        !isSymbol(expr.elements[3])) {
      this.addDiagnostic(
        document,
        expr,
        `Struct field should have a type annotation (field name: Type)`,
        DiagnosticSeverity.Warning,
        diagnostics
      );
    }
  }
  
  /**
   * Validate a constructor
   */
  private validateConstructor(
    document: TextDocument,
    expr: SList,
    diagnostics: Diagnostic[]
  ): void {
    // Constructor must have a parameter list
    if (expr.elements.length < 2) {
      this.addDiagnostic(
        document,
        expr,
        `Constructor is missing parameter list`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    if (!isList(expr.elements[1])) {
      this.addDiagnostic(
        document,
        expr,
        `Constructor parameter list must be a list`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    // Constructor should have a body
    if (expr.elements.length < 3) {
      this.addDiagnostic(
        document,
        expr,
        `Constructor is missing a body`,
        DiagnosticSeverity.Warning,
        diagnostics
      );
    }
  }
  
  /**
   * Validate a method
   */
  private validateMethod(
    document: TextDocument,
    expr: SList,
    diagnostics: Diagnostic[]
  ): void {
    // Method must have a name
    if (expr.elements.length < 2) {
      this.addDiagnostic(
        document,
        expr,
        `Method is missing a name`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    if (!isSymbol(expr.elements[1])) {
      this.addDiagnostic(
        document,
        expr,
        `Method name must be a symbol`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    // Method must have a parameter list
    if (expr.elements.length < 3) {
      this.addDiagnostic(
        document,
        expr,
        `Method is missing parameter list`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    if (!isList(expr.elements[2])) {
      this.addDiagnostic(
        document,
        expr,
        `Method parameter list must be a list`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    // Method should have a body
    if (expr.elements.length < 4) {
      this.addDiagnostic(
        document,
        expr,
        `Method is missing a body`,
        DiagnosticSeverity.Warning,
        diagnostics
      );
    }
    
    // For fx method, check return type
    if (isSymbol(expr.elements[0]) && 
        (expr.elements[0] as SSymbol).name === 'fx' && 
        expr.elements.length >= 4) {
      if (!isList(expr.elements[3]) || 
          expr.elements[3].elements.length < 2 ||
          !isSymbol(expr.elements[3].elements[0]) ||
          (expr.elements[3].elements[0] as SSymbol).name !== "->") {
        
        this.addDiagnostic(
          document,
          expr,
          `Pure method (fx) requires a return type with (-> Type) syntax`,
          DiagnosticSeverity.Error,
          diagnostics
        );
      }
    }
  }
  
  /**
   * Validate an enum declaration
   */
  public validateEnum(
    document: TextDocument,
    expr: SList,
    diagnostics: Diagnostic[]
  ): void {
    // Check for enum name
    if (expr.elements.length < 2) {
      this.addDiagnostic(
        document,
        expr,
        `Enum is missing a name`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    if (!isSymbol(expr.elements[1])) {
      this.addDiagnostic(
        document,
        expr,
        `Enum name must be a symbol`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    // Check enum name starts with uppercase
    const enumName = (expr.elements[1] as SSymbol).name;
    if (!/^[A-Z]/.test(enumName)) {
      this.addDiagnostic(
        document,
        expr.elements[1],
        `Enum name should start with an uppercase letter`,
        DiagnosticSeverity.Warning,
        diagnostics
      );
    }
    
    // Skip type annotation if present
    let caseStartIndex = 2;
    if (expr.elements.length > 2 && 
        isSymbol(expr.elements[2]) && 
        (expr.elements[2] as SSymbol).name === ':') {
      caseStartIndex = 4; // Skip enum, name, :, type
    }
    
    // Check for at least one case
    if (expr.elements.length <= caseStartIndex) {
      this.addDiagnostic(
        document,
        expr,
        `Enum should have at least one case`,
        DiagnosticSeverity.Warning,
        diagnostics
      );
      return;
    }
    
    // Validate each case
    this.validateEnumCases(document, expr, caseStartIndex, diagnostics);
  }
  
  /**
   * Validate enum cases
   */
  private validateEnumCases(
    document: TextDocument,
    enumExpr: SList,
    caseStartIndex: number,
    diagnostics: Diagnostic[]
  ): void {
    if (!isSymbol(enumExpr.elements[1])) return;
    const enumName = (enumExpr.elements[1] as SSymbol).name;
    const caseNames = new Set<string>();
    
    for (let i = caseStartIndex; i < enumExpr.elements.length; i++) {
      const caseExpr = enumExpr.elements[i];
      if (!isList(caseExpr)) {
        this.addDiagnostic(
          document,
          caseExpr,
          `Enum case must be a list`,
          DiagnosticSeverity.Error,
          diagnostics
        );
        continue;
      }
      
      if (caseExpr.elements.length < 2 || 
          !isSymbol(caseExpr.elements[0]) || 
          (caseExpr.elements[0] as SSymbol).name !== 'case' ||
          !isSymbol(caseExpr.elements[1])) {
        
        this.addDiagnostic(
          document,
          caseExpr,
          `Enum case must have the form (case Name)`,
          DiagnosticSeverity.Error,
          diagnostics
        );
        continue;
      }
      
      // Check case name
      if (!isSymbol(caseExpr.elements[1])) continue;
      const caseName = (caseExpr.elements[1] as SSymbol).name;
      
      // Check for duplicate case names
      if (caseNames.has(caseName)) {
        this.addDiagnostic(
          document,
          caseExpr.elements[1],
          `Duplicate enum case name '${caseName}'`,
          DiagnosticSeverity.Error,
          diagnostics
        );
      } else {
        caseNames.add(caseName);
      }
      
      // Check case naming convention (camelCase recommendation)
      if (/^[A-Z]/.test(caseName)) {
        this.addDiagnostic(
          document,
          caseExpr.elements[1],
          `Consider using camelCase for enum case names for consistency`,
          DiagnosticSeverity.Hint,
          diagnostics
        );
      }
      
      // Validate case parameters and associated values
      if (caseExpr.elements.length > 2) {
        this.validateEnumCaseParameters(document, caseExpr as SList, diagnostics);
      }
    }
  }
  
  /**
   * Validate enum case parameters and associated values
   */
  private validateEnumCaseParameters(
    document: TextDocument,
    caseExpr: SList,
    diagnostics: Diagnostic[]
  ): void {
    // Skip 'case' and case name
    for (let i = 2; i < caseExpr.elements.length; i++) {
      const param = caseExpr.elements[i];
      
      // If it's a simple value (non-symbol), that's allowed
      if (!isSymbol(param)) {
        continue;
      }
      
      // If it's a parameter name, it should be followed by a colon and type
      if (isSymbol(param) && i + 2 < caseExpr.elements.length) {
        const colon = caseExpr.elements[i + 1];
        const type = caseExpr.elements[i + 2];
        
        if (!isSymbol(colon) || (colon as SSymbol).name !== ':' || !isSymbol(type)) {
          this.addDiagnostic(
            document,
            param,
            `Associated value parameter should have the form 'name: Type'`,
            DiagnosticSeverity.Warning,
            diagnostics
          );
        }
        
        // Skip colon and type
        i += 2;
      }
    }
  }
  
  /**
   * Validate an import statement
   */
  public validateImport(
    document: TextDocument,
    expr: SList,
    diagnostics: Diagnostic[]
  ): void {
    // Check for vector-style import: (import [sym1, sym2] from "module")
    if (expr.elements.length >= 4 && 
        isList(expr.elements[1]) && 
        isSymbol(expr.elements[2]) && 
        (expr.elements[2] as SSymbol).name === 'from') {
      
      // This is a vector-style import, validate symbols inside the vector
      const symbolList = expr.elements[1] as SList;
      for (const element of symbolList.elements) {
        if (!isSymbol(element) && !isList(element)) {
          this.addDiagnostic(
            document,
            element,
            `Import list should contain only symbols or [symbol as alias] forms`,
            DiagnosticSeverity.Error,
            diagnostics
          );
        }
        
        // Check for 'as' alias syntax: [original as alias]
        if (isList(element) && element.elements.length === 3) {
          const [original, as, alias] = element.elements;
          if (!isSymbol(original) || !isSymbol(as) || !isSymbol(alias) || 
              (as as SSymbol).name !== 'as') {
            this.addDiagnostic(
              document,
              element,
              `Import alias should have the form [original as alias]`,
              DiagnosticSeverity.Error,
              diagnostics
            );
          }
        }
      }
      
      // Check for module path
      const pathElement = expr.elements[3];
      if (!this.isString(pathElement) && !this.isLiteral(pathElement)) {
        this.addDiagnostic(
          document,
          pathElement,
          `Import path must be a string literal`,
          DiagnosticSeverity.Error,
          diagnostics
        );
      }
      
      return;
    }
    
    // Check for namespace-style import: (import name from "module")
    if (expr.elements.length >= 4 && 
        isSymbol(expr.elements[1]) && 
        isSymbol(expr.elements[2]) && 
        (expr.elements[2] as SSymbol).name === 'from') {
      
      // Check for module path
      const pathElement = expr.elements[3];
      if (!this.isString(pathElement) && !this.isLiteral(pathElement)) {
        this.addDiagnostic(
          document,
          pathElement,
          `Import path must be a string literal`,
          DiagnosticSeverity.Error,
          diagnostics
        );
      }
      
      return;
    }
    
    // If we got here, the import syntax is invalid
    this.addDiagnostic(
      document,
      expr,
      `Import must be either (import [symbols] from "module") or (import name from "module")`,
      DiagnosticSeverity.Error,
      diagnostics
    );
  }
  
  /**
   * Validate an export statement
   */
  public validateExport(
    document: TextDocument,
    expr: SList,
    diagnostics: Diagnostic[]
  ): void {
    // Check for vector-style export: (export [sym1, sym2])
    if (expr.elements.length >= 2 && isList(expr.elements[1])) {
      // Validate all symbols in the export list
      const exportList = expr.elements[1] as SList;
      for (const element of exportList.elements) {
        if (!isSymbol(element) && !isList(element)) {
          this.addDiagnostic(
            document,
            element,
            `Export list must contain only symbols or [symbol as alias] forms`,
            DiagnosticSeverity.Error,
            diagnostics
          );
        }
        
        // Check for 'as' alias syntax: [original as alias]
        if (isList(element) && element.elements.length === 3) {
          const [original, as, alias] = element.elements;
          if (!isSymbol(original) || !isSymbol(as) || !isSymbol(alias) || 
              (as as SSymbol).name !== 'as') {
            this.addDiagnostic(
              document,
              element,
              `Export alias should have the form [original as alias]`,
              DiagnosticSeverity.Error,
              diagnostics
            );
          }
        }
      }
      
      return;
    }
    
    // Check for string-symbol export: (export "name" symbol)
    if (expr.elements.length >= 3 && 
        (this.isString(expr.elements[1]) || this.isLiteral(expr.elements[1])) && 
        isSymbol(expr.elements[2])) {
      
      // This is a string-symbol export, this is valid
      return;
    }
    
    // If we got here, the export syntax is invalid
    this.addDiagnostic(
      document,
      expr,
      `Export must be either (export [symbols]) or (export "name" symbol)`,
      DiagnosticSeverity.Error,
      diagnostics
    );
  }
  
  /**
   * Add a diagnostic for an expression
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
      if ((expr as any).position) {
        const pos = (expr as any).position;
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
  
  /**
   * Check if a value is a string
   */
  private isString(value: any): boolean {
    return value && typeof value === 'object' && value.type === 'string';
  }
  
  /**
   * Check if a value is a literal
   */
  private isLiteral(value: any): boolean {
    return value && typeof value === 'object' && value.type === 'literal';
  }
}