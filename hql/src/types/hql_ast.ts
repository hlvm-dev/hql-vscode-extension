// src/transpiler/hql_ast.ts
export type HQLNode = LiteralNode | SymbolNode | ListNode;

export interface LiteralNode {
  type: "literal";
  value: string | number | boolean | null;
}

export interface SymbolNode {
  type: "symbol";
  name: string;
}

export interface ListNode {
  type: "list";
  elements: HQLNode[];
}

/**
 * Check if a node is an import statement
 */
export function isImportNode(node: HQLNode): boolean {
  return (
    node.type === "list" &&
    node.elements.length >= 3 &&
    node.elements[0].type === "symbol" &&
    ((node.elements[0] as SymbolNode).name === "import" ||
      (node.elements[0] as SymbolNode).name === "js-import")
  );
}

/**
 * Detects if a node is an import statement
 */
export function isMacroImport(node: HQLNode): boolean {
  return (
    node.type === "list" &&
    (node as ListNode).elements.length >= 3 &&
    (node as ListNode).elements[0].type === "symbol" &&
    ((node as ListNode).elements[0] as SymbolNode).name === "import"
  );
}

/**
 * Helper to extract import path from a node
 */
export function extractImportPath(node: HQLNode): string | null {
  if (
    node.type === "list" &&
    node.elements.length >= 3 &&
    node.elements[0].type === "symbol" &&
    node.elements[0].name === "import" &&
    node.elements[2].type === "literal"
  ) {
    return String(node.elements[2].value);
  }
  return null;
}

/**
 * Check if a list node represents a vector-based export
 */
export function isVectorExport(list: ListNode): boolean {
  return (
    list.elements.length === 2 &&
    list.elements[0].type === "symbol" &&
    (list.elements[0] as SymbolNode).name === "export" &&
    list.elements[1].type === "list"
  );
}

/**
 * Check if a list node represents a vector-based import
 */
export function isVectorImport(list: ListNode): boolean {
  return (
    list.elements.length === 4 &&
    list.elements[0].type === "symbol" &&
    (list.elements[0] as SymbolNode).name === "import" &&
    list.elements[1].type === "list" &&
    list.elements[2].type === "symbol" &&
    (list.elements[2] as SymbolNode).name === "from" &&
    list.elements[3].type === "literal"
  );
}

/**
 * Check if a list node represents a namespace import with "from"
 */
export function isNamespaceImport(list: ListNode): boolean {
  return (
    list.elements.length === 4 &&
    list.elements[0].type === "symbol" &&
    (list.elements[0] as SymbolNode).name === "import" &&
    list.elements[1].type === "symbol" &&
    list.elements[2].type === "symbol" &&
    (list.elements[2] as SymbolNode).name === "from" &&
    list.elements[3].type === "literal"
  );
}
