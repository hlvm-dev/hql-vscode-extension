// src/s-exp/types.ts - S-expression type definitions

/**
 * Core S-expression types representing the fundamental HQL building blocks
 */
export type SExp = SSymbol | SList | SLiteral | SString | SNumber | SBoolean | SNil;

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

export interface SString {
  type: "string";
  value: string;
}

export interface SNumber {
  type: "number";
  value: number;
}

export interface SBoolean {
  type: "boolean";
  value: boolean;
}

export interface SNil {
  type: "nil";
  value: null;
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

export function createStringLiteral(value: string): SString {
  return { type: "string", value };
}

export function createNumberLiteral(value: number): SNumber {
  return { type: "number", value };
}

export function createBooleanLiteral(value: boolean): SBoolean {
  return { type: "boolean", value };
}

export function createNilLiteral(): SNil {
  return { type: "nil", value: null };
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

export function isString(exp: SExp): exp is SString {
  return exp.type === "string";
}

export function isNumber(exp: SExp): exp is SNumber {
  return exp.type === "number";
}

export function isBoolean(exp: SExp): exp is SBoolean {
  return exp.type === "boolean";
}

export function isNil(exp: SExp): exp is SNil {
  return exp.type === "nil";
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
  } else if (isString(exp)) {
    return `"${exp.value}"`;
  } else if (isNumber(exp)) {
    return String(exp.value);
  } else if (isBoolean(exp)) {
    return exp.value ? "true" : "false";
  } else if (isNil(exp)) {
    return "nil";
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
  } else if (isString(exp)) {
    return createStringLiteral(exp.value);
  } else if (isNumber(exp)) {
    return createNumberLiteral(exp.value);
  } else if (isBoolean(exp)) {
    return createBooleanLiteral(exp.value);
  } else if (isNil(exp)) {
    return createNilLiteral();
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
    ((isLiteral(elements[3]) && typeof elements[3].value === "string") ||
     (isString(elements[3])));
}