// src/parser-adapter.ts
// Adapter that uses the transpiler's parser for HQL but converts to the LSP-expected format

import { parse as transpilerParse } from "./transpiler/parser";
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./transpiler/hql_ast";
import {
  HQLValue,
  HQLSymbol,
  HQLList,
  HQLNumber,
  HQLString,
  HQLBoolean,
  HQLNil,
  HQLEnumCase,
  makeSymbol,
  makeList,
  makeNumber,
  makeString,
  makeBoolean,
  makeNil,
  makeEnumCase
} from "./modules/type";

/**
 * Convert a node from the transpiler's AST to the LSP server's AST structure
 */
export function convertNode(node: HQLNode): HQLValue {
  if (!node) return makeNil();
  
  switch (node.type) {
    case "literal": {
      const lit = node as LiteralNode;
      if (typeof lit.value === "string") {
        return makeString(lit.value);
      } else if (typeof lit.value === "number") {
        return makeNumber(lit.value);
      } else if (typeof lit.value === "boolean") {
        return makeBoolean(lit.value);
      } else if (lit.value === null) {
        return makeNil();
      }
      return makeNil();
    }
    case "symbol": {
      const sym = node as SymbolNode;
      // Handle enum case syntax (.enumValue)
      if (sym.name.startsWith(".")) {
        return makeEnumCase(sym.name.slice(1));
      }
      return makeSymbol(sym.name);
    }
    case "list": {
      const list = node as ListNode;
      const elements = list.elements.map(convertNode);
      const result = makeList(elements);
      
      // Preserve the isArrayLiteral flag for vector/array syntax
      if ((list as any).isArrayLiteral) {
        (result as any).isArrayLiteral = true;
      }
      
      // Safely preserve start/end positions if available
      if ((list as any).start !== undefined && (list as any).end !== undefined) {
        (result as any).start = (list as any).start;
        (result as any).end = (list as any).end;
      }
      
      return result;
    }
    default:
      // Fix for TypeScript error - use as any to avoid 'never' type issue
      console.error(`Unknown HQL node type: ${String((node as any).type)}`);
      return makeNil();
  }
}

/**
 * Parse HQL source code using the transpiler's parser and return an AST 
 * in the structure expected by the LSP server
 */
export function parse(input: string): HQLValue[] {
  if (!input || input.trim() === "") {
    return [];
  }
  
  try {
    const transpilerNodes = transpilerParse(input);
    return transpilerNodes.map(convertNode);
  } catch (error) {
    console.error("Error parsing HQL:", error);
    return [];
  }
}

/**
 * Determine if a node represents a type annotation or is a type-related syntax
 */
export function isTypeAnnotation(node: HQLValue): boolean {
  if (node.type !== "list") return false;
  
  const list = node as HQLList;
  if (list.value.length === 0) return false;
  
  const head = list.value[0];
  if (head.type !== "symbol") return false;
  
  const sym = head as HQLSymbol;
  return ["type-annotated", "->", "return-type"].includes(sym.name);
}

/**
 * Extract parameter information from a parameter list node
 * Handles both traditional and modern parameter syntax including:
 * - Named parameters (param:)
 * - Type annotations (param: Type)
 * - Default values (param = default)
 */
export function extractParameters(paramList: HQLList): {
  names: string[];
  types: Record<string, string>;
  defaults: Record<string, HQLValue>;
  named: string[];
} {
  const names: string[] = [];
  const types: Record<string, string> = {};
  const defaults: Record<string, HQLValue> = {};
  const named: string[] = [];
  
  if (!paramList || !paramList.value) {
    return { names, types, defaults, named };
  }

  for (let i = 0; i < paramList.value.length; i++) {
    const param = paramList.value[i];
    
    // Handle regular symbol parameters
    if (param.type === "symbol") {
      const name = (param as HQLSymbol).name;
      
      // Named parameter with colon suffix
      if (name.endsWith(":")) {
        const baseName = name.slice(0, -1);
        names.push(baseName);
        named.push(baseName);
        continue;
      }
      
      // Check for type annotation with colon 
      // Format: paramName: Type
      if (name.includes(":") && !name.endsWith(":")) {
        const [paramName, typeName] = name.split(":");
        names.push(paramName.trim());
        types[paramName.trim()] = typeName.trim();
        continue;
      }
      
      // Check for default value
      // Format: param = defaultValue
      if (i + 2 < paramList.value.length && 
          paramList.value[i + 1].type === "symbol" &&
          (paramList.value[i + 1] as HQLSymbol).name === "=") {
        names.push(name);
        defaults[name] = paramList.value[i + 2];
        i += 2; // Skip the = and defaultValue
        continue;
      }
      
      // Regular parameter
      names.push(name);
    } 
    // Handle type-annotated parameters (type-annotated param type)
    else if (param.type === "list") {
      const list = param as HQLList;
      if (list.value.length >= 3 && 
          list.value[0].type === "symbol" && 
          (list.value[0] as HQLSymbol).name === "type-annotated") {
        
        if (list.value[1].type === "symbol") {
          const paramName = (list.value[1] as HQLSymbol).name;
          names.push(paramName);
          
          if (list.value[2].type === "symbol") {
            types[paramName] = (list.value[2] as HQLSymbol).name;
          }
        }
        continue;
      }
      
      // Handle default-param form (default-param param defaultValue)
      if (list.value.length >= 3 && 
          list.value[0].type === "symbol" && 
          (list.value[0] as HQLSymbol).name === "default-param") {
        
        if (list.value[1].type === "symbol") {
          const paramName = (list.value[1] as HQLSymbol).name;
          names.push(paramName);
          defaults[paramName] = list.value[2];
        }
        continue;
      }
    }
  }

  return { names, types, defaults, named };
}

/**
 * Extract return type from a function definition
 */
export function extractReturnType(nodes: HQLValue[]): string | null {
  // Look for arrow syntax: (-> ReturnType)
  for (const node of nodes) {
    if (node.type === "list") {
      const list = node as HQLList;
      if (list.value.length >= 2 && 
          list.value[0].type === "symbol" &&
          (list.value[0] as HQLSymbol).name === "->") {
        
        if (list.value[1].type === "symbol") {
          return (list.value[1] as HQLSymbol).name;
        }
      }
    }
  }
  
  // Look for return-type node: (return-type Type)
  for (const node of nodes) {
    if (node.type === "list") {
      const list = node as HQLList;
      if (list.value.length >= 2 && 
          list.value[0].type === "symbol" &&
          (list.value[0] as HQLSymbol).name === "return-type") {
        
        if (list.value[1].type === "symbol") {
          return (list.value[1] as HQLSymbol).name;
        }
      }
    }
  }
  
  return null;
}