// src/s-exp/types.ts - S-expression type definitions

/**
 * Core S-expression types representing the fundamental HQL building blocks
 */
export type SExp = SSymbol | SList | SLiteral;

export interface SSymbol {
  type: "symbol";
  name: string;
}

export interface SList {
  type: "list";
  elements: SExp[];
}

export interface SLiteral {
  type: "literal";
  value: string | number | boolean | null;
}

/**
 * Helper functions to create S-expressions
 */
export function createSymbol(name: string): SSymbol {
  return { type: "symbol", name };
}

export function createList(...elements: SExp[]): SList {
  return { type: "list", elements };
}

export function createLiteral(
  value: string | number | boolean | null,
): SLiteral {
  return { type: "literal", value };
}

export function createNilLiteral(): SLiteral {
  return { type: "literal", value: null };
}

/**
 * Type guards for S-expressions
 */
export function isSymbol(exp: SExp): exp is SSymbol {
  return exp.type === "symbol";
}

export function isList(exp: SExp): exp is SList {
  return exp.type === "list";
}

export function isLiteral(exp: SExp): exp is SLiteral {
  return exp.type === "literal";
}

/**
 * Check if an S-expression is a specific form
 */
export function isForm(exp: SExp, formName: string): boolean {
  return isList(exp) &&
    exp.elements.length > 0 &&
    isSymbol(exp.elements[0]) &&
    exp.elements[0].name === formName;
}

export function isDefMacro(exp: SExp): boolean {
  return isForm(exp, "defmacro");
}

export function isUserMacro(exp: SExp): boolean {
  return isForm(exp, "macro");
}

export function isImport(exp: SExp): boolean {
  return isForm(exp, "import");
}

/**
 * Convert S-expression to a readable string for debugging
 */
export function sexpToString(exp: SExp): string {
  if (isSymbol(exp)) {
    return exp.name;
  } else if (isLiteral(exp)) {
    if (exp.value === null) {
      return "nil";
    } else if (typeof exp.value === "string") {
      return `"${exp.value}"`;
    } else {
      return String(exp.value);
    }
  } else if (isList(exp)) {
    return `(${exp.elements.map(sexpToString).join(" ")})`;
  } else {
    return String(exp);
  }
}

/**
 * Deep clone an S-expression
 */
export function cloneSExp(exp: SExp): SExp {
  if (isSymbol(exp)) {
    return createSymbol(exp.name);
  } else if (isLiteral(exp)) {
    return createLiteral(exp.value);
  } else if (isList(exp)) {
    return createList(...exp.elements.map(cloneSExp));
  } else {
    throw new Error(`Unknown expression type: ${JSON.stringify(exp)}`);
  }
}

/**
 * Check if an import is vector-based
 */
export function isSExpVectorImport(elements: SExp[]): boolean {
  return elements.length >= 4 &&
    elements[1].type === "list" &&
    isSymbol(elements[2]) &&
    elements[2].name === "from";
}

/**
 * Check if an import is namespace-based with "from" syntax
 * Format: (import name from "path")
 */
export function isSExpNamespaceImport(elements: SExp[]): boolean {
  return elements.length === 4 &&
    isSymbol(elements[1]) &&
    isSymbol(elements[2]) &&
    elements[2].name === "from" &&
    isLiteral(elements[3]) &&
    typeof elements[3].value === "string";
}
