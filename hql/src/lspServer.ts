// src/lspServer.ts

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  DocumentSymbol,
  SymbolKind,
  Diagnostic,
  DiagnosticSeverity,
  Position,
  Range,
  Location,
  ReferenceParams,
  RenameParams,
  TextEdit,
  WorkspaceEdit,
  SemanticTokens,
  SemanticTokensParams,
  SemanticTokensRangeParams,
  FormattingOptions,
  DocumentFormattingParams
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";

import { 
  HQLValue,
  HQLSymbol,
  HQLList,
  HQLNumber,
  HQLString,
  HQLBoolean,
  HQLNil,
  HQLEnumCase
} from "./modules/type";

// Import from parser-adapter instead of direct parser
import { parse, extractParameters, extractReturnType, isTypeAnnotation } from "./parser-adapter";

/* ----------------------------------------------------------------------
   1. Interfaces & Type Definitions
----------------------------------------------------------------------*/
interface SymbolInfo {
  name: string;
  defStart: number;
  defEnd: number;
  references: number[];
  docString?: string;
}

interface ParamInfo { 
  name: string; 
  type?: string; 
  defaultValue?: string;
}

interface FunctionSignature {
  params: ParamInfo[];
  returnType?: string;
  isAsync?: boolean;
  docString?: string;
}

interface EnumInfo { 
  name: string; 
  cases: string[]; 
}

interface Scope { 
  start: number; 
  end: number; 
  bindings: string[]; 
}

// Cache and tables for language features
const functionSignatures: Map<string, FunctionSignature> = new Map();
const enumTable: Map<string, EnumInfo> = new Map();
const symbolTables: Map<string, Map<string, SymbolInfo>> = new Map();
const localScopes: Map<string, Scope[]> = new Map();
const documentVersions: Map<string, number> = new Map();

/* ----------------------------------------------------------------------
   2. Helper Functions
----------------------------------------------------------------------*/

/**
 * Format a function signature for display in hover or completion
 */
function formatFunctionSignature(fn: string, sig: FunctionSignature): string {
  let paramStr = sig.params.map(p => {
    if (p.type) {
      return `${p.name}: ${p.type}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`;
    }
    return p.name + (p.defaultValue ? ` = ${p.defaultValue}` : '');
  }).join(" ");
  
  let result = `(${fn} (${paramStr})`;
  if (sig.returnType) {
    result += ` -> ${sig.returnType}`;
  }
  result += ')';
  
  return result;
}

/**
 * Find parameter index in a labeled or positional argument list
 */
function findParamIndexByLabel(fnName: string, label: string): number {
  const sig = functionSignatures.get(fnName);
  if (!sig) return -1;
  
  for (let i = 0; i < sig.params.length; i++) {
    if (sig.params[i].name === label) return i;
  }
  
  return -1;
}

/* ----------------------------------------------------------------------
   3. Symbol Table Building & AST Walking
----------------------------------------------------------------------*/

/**
 * Walk the AST and build symbol tables, function signatures, and enums
 */
function walkAST(ast: HQLValue[], text: string, uri: string): void {
  functionSignatures.clear();
  enumTable.clear();

  const st = new Map<string, SymbolInfo>();
  symbolTables.set(uri, st);
  localScopes.set(uri, []);

  function pushScope(start: number, end: number, bindings: string[]) {
    const scopes = localScopes.get(uri) || [];
    scopes.push({ start, end, bindings });
    localScopes.set(uri, scopes);
  }

  function visit(node: HQLValue) {
    if (!node || node.type !== "list") return;
    const items = node.value;
    if (items.length < 2) return;
    
    const head = items[0];
    if (head.type !== "symbol") return;
    
    const hname = (head as HQLSymbol).name;
    
    // Handle definitions (def, defsync, defn, defx, defmacro)
    if (["def", "defsync", "defn", "defx", "defmacro"].includes(hname)) {
      const symVal = items[1];
      if (symVal && symVal.type === "symbol") {
        const symName = (symVal as HQLSymbol).name;
        const pattern = "(" + hname + " " + symName;
        const idx = text.indexOf(pattern);
        if (idx >= 0) {
          const defStart = idx + ("(" + hname + " ").length;
          const defEnd = defStart + symName.length;
          
          // Check for docstring
          let docString: string | undefined;
          if (items.length > 3 && items[3].type === "string") {
            docString = (items[3] as HQLString).value;
          }

          st.set(symName, { name: symName, defStart, defEnd, references: [], ...(docString && { docString }) });
        }
        
        // Handle function definitions
        if ((hname === "defn" || hname === "defx") && items.length >= 3) {
          const paramNode = items[2];
          if (paramNode.type === "list") {
            // Extract parameter information
            const paramList = paramNode as HQLList;
            const paramResult = extractParameters(paramList);
            
            // Get parameter info with types
            const params: ParamInfo[] = paramResult.names.map(name => ({
              name,
              type: paramResult.types[name],
              defaultValue: paramResult.defaults[name] ? 
                (paramResult.defaults[name].type === "string" ? 
                  `"${(paramResult.defaults[name] as HQLString).value}"` :
                  String((paramResult.defaults[name] as any).value)) : 
                undefined
            }));
            
            // Check for return type
            let returnType: string | undefined;
            if (items.length >= 4) {
              returnType = extractReturnType(items.slice(3)) || undefined;
            }
            
            // Check if function is async
            const isAsync = hname === "defx";
            
            functionSignatures.set(symName, { 
              params, 
              returnType, 
              isAsync
            });
          }
        } 
        // Handle function values (def fn-name (fn ...))
        else if ((hname === "def" || hname === "defsync") && items.length >= 3 && items[2].type === "list") {
          const valueExpr = items[2] as HQLList;
          if (valueExpr.value.length > 0 && 
              valueExpr.value[0].type === "symbol" && 
              ["fn", "fx"].includes((valueExpr.value[0] as HQLSymbol).name)) {
            
            if (valueExpr.value.length >= 2 && valueExpr.value[1].type === "list") {
              const paramNode = valueExpr.value[1] as HQLList;
              
              // Extract parameter information
              const paramResult = extractParameters(paramNode);
              
              // Get parameter info with types
              const params: ParamInfo[] = paramResult.names.map(name => ({
                name,
                type: paramResult.types[name],
                defaultValue: paramResult.defaults[name] ? 
                  (paramResult.defaults[name].type === "string" ? 
                    `"${(paramResult.defaults[name] as HQLString).value}"` :
                    String((paramResult.defaults[name] as any).value)) : 
                  undefined
              }));
              
              // Check for return type
              let returnType: string | undefined;
              if (valueExpr.value.length >= 3) {
                returnType = extractReturnType(valueExpr.value.slice(2)) || undefined;
              }
              
              // Check if function is async
              const isAsync = (valueExpr.value[0] as HQLSymbol).name === "fx";
              
              functionSignatures.set(symName, { 
                params, 
                returnType, 
                isAsync
              });
            }
          }
        }
      }
    }
    
    // Handle enum definitions
    if (hname === "defenum" && items.length >= 2) {
      const enumSym = items[1];
      if (enumSym.type === "symbol") {
        const enumName = (enumSym as HQLSymbol).name;
        const pattern = "(defenum " + enumName;
        const idx = text.indexOf(pattern);
        let defStart = 0, defEnd = 0;
        if (idx >= 0) {
          defStart = idx + "(defenum ".length;
          defEnd = defStart + enumName.length;
        }
        st.set(enumName, { name: enumName, defStart, defEnd, references: [] });
        
        // Extract enum cases
        const cases = items.slice(2).flatMap((n: HQLValue) =>
          n.type === "symbol" ? [(n as HQLSymbol).name] : []
        );
        
        enumTable.set(enumName, { name: enumName, cases });
      }
    }
    
    // Process anonymous functions (fn and fx)
    if (hname === "fn" || hname === "fx") {
      if (items.length >= 2 && items[1].type === "list" && node.start !== undefined && node.end !== undefined) {
        const paramNode = items[1] as HQLList;
        const paramResult = extractParameters(paramNode);
        pushScope(node.start, node.end, paramResult.names);
      }
    }
    
    // Handle let expressions
    if (hname === "let" && items.length >= 2 && items[1].type === "list" && node.start !== undefined && node.end !== undefined) {
      const bindingList = items[1] as HQLList;
      const bindings: string[] = [];
      
      // Process bindings in pairs
      for (let i = 0; i < bindingList.value.length; i += 2) {
        const binding = bindingList.value[i];
        if (binding && binding.type === "symbol") {
          bindings.push((binding as HQLSymbol).name);
        }
      }
      
      pushScope(node.start, node.end, bindings);
    }

    // Recursively visit all elements
    for (const item of items) {
      visit(item);
    }
  }

  // Process all top-level forms
  for (const node of ast) {
    visit(node);
  }

  // Find symbol references in the text
  for (const [symName, info] of st.entries()) {
    const re = new RegExp("\\b" + symName + "\\b", "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const offset = match.index;
      if (offset !== info.defStart) {
        // Make sure this is not part of the definition
        const isInDefinition = offset >= info.defStart && offset <= info.defEnd;
        if (!isInDefinition) {
          info.references.push(offset);
        }
      }
    }
  }

  symbolTables.set(uri, st);
}

/* ----------------------------------------------------------------------
   4. Context-aware code analysis
----------------------------------------------------------------------*/

/**
 * Find the active argument position in a function call
 */
interface ArgContext { 
  fnName: string; 
  paramIndex: number; 
  paramLabel?: string; 
}

function insideNode(node: HQLValue, offset: number): boolean {
  if (node.start === undefined || node.end === undefined) return false;
  return offset >= node.start && offset <= node.end;
}

function findNodeAtOffset(node: HQLValue, offset: number): HQLValue | null {
  if (node.start === undefined || node.end === undefined) return null;
  if (offset < node.start || offset > node.end) return null;
  
  if (node.type === "list") {
    for (const child of (node as HQLList).value) {
      const found = findNodeAtOffset(child, offset);
      if (found) return found;
    }
    return node;
  }
  
  return node;
}

function findClosestList(ast: HQLValue[], node: HQLValue): HQLList | null {
  for (const top of ast) {
    if (top.type !== "list") continue;
    
    function findInList(list: HQLList): HQLList | null {
      for (const child of list.value) {
        if (child === node) return list;
        if (child.type === "list") {
          const result = findInList(child as HQLList);
          if (result) return result;
        }
      }
      return null;
    }
    
    const result = findInList(top as HQLList);
    if (result) return result;
  }
  
  return null;
}

function findActiveArgument(ast: HQLValue[], offset: number): ArgContext | null {
  // Find the node at cursor position
  let activeNode: HQLValue | null = null;
  for (const top of ast) {
    const found = findNodeAtOffset(top, offset);
    if (found) {
      activeNode = found;
      break;
    }
  }
  
  if (!activeNode) return null;
  
  // Find the containing function call
  const callList = activeNode.type === "list" ? 
                   activeNode as HQLList : 
                   findClosestList(ast, activeNode);
  
  if (!callList || callList.value.length === 0) return null;
  
  const head = callList.value[0];
  if (head.type !== "symbol") return null;
  
  const fnName = (head as HQLSymbol).name;
  
  // Check if this is a labeled argument call
  let isLabeled = false;
  for (let i = 1; i < callList.value.length; i++) {
    const arg = callList.value[i];
    if (arg.type === "symbol" && (arg as HQLSymbol).name.endsWith(":")) {
      isLabeled = true;
      break;
    }
  }
  
  let paramIndex = -1;
  let paramLabel: string | undefined;
  
  if (isLabeled) {
    // Process labeled arguments (name: value pairs)
    for (let i = 1; i < callList.value.length; i += 2) {
      const label = callList.value[i];
      const value = callList.value[i + 1];
      
      // If we're out of values, we're at the end of the list
      if (!value) break;
      
      // Check if cursor is within this label or value
      if (insideNode(label, offset) || insideNode(value, offset)) {
        if (label.type === "symbol") {
          const labelText = (label as HQLSymbol).name;
          if (labelText.endsWith(":")) {
            paramLabel = labelText.slice(0, -1);
            paramIndex = findParamIndexByLabel(fnName, paramLabel);
            break;
          }
        }
      }
    }
  } else {
    // Process positional arguments
    for (let i = 1; i < callList.value.length; i++) {
      if (insideNode(callList.value[i], offset)) {
        paramIndex = i - 1;
        break;
      }
    }
    
    // If we didn't find a match, we might be at the end of the list
    if (paramIndex === -1 && callList.value.length > 1) {
      paramIndex = callList.value.length - 1;
    }
  }
  
  if (paramIndex < 0) return null;
  
  return { fnName, paramIndex, paramLabel };
}

/* ----------------------------------------------------------------------
   5. LSP Connection Setup
----------------------------------------------------------------------*/
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ["(", " ", ":", ".", "\"", "[", "{", "#"]
      },
      hoverProvider: true,
      documentSymbolProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: true,
      documentFormattingProvider: true,
      semanticTokensProvider: {
        legend: {
          tokenTypes: ["variable", "function", "keyword", "string", "number", "macro", "type", "enumMember", "parameter"],
          tokenModifiers: ["declaration", "definition", "defaultLibrary"]
        },
        full: true,
        range: true
      }
    }
  };
});

/* ----------------------------------------------------------------------
   6. Document Management
----------------------------------------------------------------------*/
documents.onDidChangeContent(change => {
  const doc = change.document;
  
  // Store document version
  documentVersions.set(doc.uri, doc.version);
  
  // Run diagnostics
  validateTextDocument(doc);
  
  // Parse and build symbol tables
  try {
    const text = doc.getText();
    const ast = parse(text);
    walkAST(ast, text, doc.uri);
  } catch (err) {
    connection.console.error("Parse error: " + String(err));
  }
});

function validateTextDocument(doc: TextDocument) {
  const text = doc.getText();
  const diagnostics: Diagnostic[] = [];
  
  // Check for unbalanced parentheses
  let parenBalance = 0;
  let braceBalance = 0;
  let bracketBalance = 0;
  let lastOpenParen = -1;
  let lastOpenBrace = -1;
  let lastOpenBracket = -1;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Handle parentheses
    if (char === '(') {
      parenBalance++;
      lastOpenParen = i;
    } else if (char === ')') {
      parenBalance--;
      if (parenBalance < 0) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: { start: doc.positionAt(i), end: doc.positionAt(i + 1) },
          message: "Unmatched closing parenthesis",
          source: "hql"
        });
        parenBalance = 0;
      }
    }
    
    // Handle braces (for object literals)
    if (char === '{') {
      braceBalance++;
      lastOpenBrace = i;
    } else if (char === '}') {
      braceBalance--;
      if (braceBalance < 0) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: { start: doc.positionAt(i), end: doc.positionAt(i + 1) },
          message: "Unmatched closing brace",
          source: "hql"
        });
        braceBalance = 0;
      }
    }
    
    // Handle brackets (for vector literals)
    if (char === '[') {
      bracketBalance++;
      lastOpenBracket = i;
    } else if (char === ']') {
      bracketBalance--;
      if (bracketBalance < 0) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: { start: doc.positionAt(i), end: doc.positionAt(i + 1) },
          message: "Unmatched closing bracket",
          source: "hql"
        });
        bracketBalance = 0;
      }
    }
  }
  
  // Check for unmatched opening delimiters
  if (parenBalance > 0 && lastOpenParen >= 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: { start: doc.positionAt(lastOpenParen), end: doc.positionAt(lastOpenParen + 1) },
      message: `Unmatched opening parenthesis (missing ${parenBalance} closing parenthesis)`,
      source: "hql"
    });
  }
  
  if (braceBalance > 0 && lastOpenBrace >= 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: { start: doc.positionAt(lastOpenBrace), end: doc.positionAt(lastOpenBrace + 1) },
      message: `Unmatched opening brace (missing ${braceBalance} closing brace)`,
      source: "hql"
    });
  }
  
  if (bracketBalance > 0 && lastOpenBracket >= 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: { start: doc.positionAt(lastOpenBracket), end: doc.positionAt(lastOpenBracket + 1) },
      message: `Unmatched opening bracket (missing ${bracketBalance} closing bracket)`,
      source: "hql"
    });
  }
  
  // Check for empty document
  if (text.trim().length === 0) {
    // Empty documents are fine - no diagnostics
  } else {
    // Try to parse the document
    try {
      const ast = parse(text);
      if (ast.length === 0) {
        // No expressions parsed
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: { start: doc.positionAt(0), end: doc.positionAt(text.length) },
          message: "No valid HQL expressions found in document",
          source: "hql"
        });
      }
    } catch (err) {
      // Parse error - probably reported by parentheses checks already
    }
  }
  
  // Send diagnostics to client
  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

/* ----------------------------------------------------------------------
   7. Completion
----------------------------------------------------------------------*/
connection.onCompletion(params => {
  try {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];
    const text = doc.getText();
    const offset = doc.offsetAt(params.position);
    const textBefore = text.substring(0, offset);
    
    // Get the line text and character
    const lineText = doc.getText({
      start: { line: params.position.line, character: 0 },
      end: { line: params.position.line, character: params.position.character }
    });
    
    // Define result array
    const completions: CompletionItem[] = [];
    
    // 1. Check if we're typing a definition
    const defRegex = /\((def|defsync|defmacro|defn|defx)\s+[^\s()]*$/;
    if (defRegex.test(textBefore)) {
      // Offer snippets for completing definitions
      return [
        {
          label: "Definition",
          kind: CompletionItemKind.Snippet,
          insertTextFormat: InsertTextFormat.Snippet,
          insertText: "${1:name} ${2:value})$0",
          documentation: { kind: MarkupKind.PlainText, value: "Complete a definition" }
        }
      ];
    }
    
    // 2. Check if we're inside a vector literal 
    const vectorRegex = /\[[^\]]*$/;
    if (vectorRegex.test(textBefore)) {
      // Offer snippet for vector items
      completions.push({
        label: "vector-item",
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "${1:item}${0:, }",
        documentation: { kind: MarkupKind.PlainText, value: "Add an item to the vector" }
      });
    }
    
    // 3. Check if we're inside an object literal
    const objectRegex = /\{[^}]*$/;
    if (objectRegex.test(textBefore)) {
      // Offer snippet for object properties
      completions.push({
        label: "key-value",
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "\"${1:key}\": ${2:value}${0:, }",
        documentation: { kind: MarkupKind.PlainText, value: "Add a key-value pair to the object" }
      });
    }
    
    // 4. Check if we're inside a function call and which parameter
    const ast = parse(text);
    const argCtx = findActiveArgument(ast, offset);
    
    if (argCtx) {
      const { fnName, paramIndex, paramLabel } = argCtx;
      const sig = functionSignatures.get(fnName);
      
      if (sig && paramIndex >= 0 && paramIndex < sig.params.length) {
        const param = sig.params[paramIndex];
        
        // If parameter type is an enum, offer enum values
        if (param.type && enumTable.has(param.type)) {
          const enumInfo = enumTable.get(param.type)!;
          
          // Return enum cases with dot prefix
          return enumInfo.cases.map(caseName => ({
            label: `.${caseName}`,
            kind: CompletionItemKind.EnumMember,
            documentation: {
              kind: MarkupKind.Markdown,
              value: `**Enum Case**: \`${param.type}.${caseName}\``
            }
          }));
        }
      }
    }
    
    // 5. Add standard completions
    
    // Add snippet completions for common forms
    const snippets = [
      {
        label: "def",
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "(def ${1:name} ${2:value})$0",
        documentation: { kind: MarkupKind.PlainText, value: "Define a variable" }
      },
      {
        label: "defn",
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "(defn ${1:name} (${2:params})\n  ${3:body})$0",
        documentation: { kind: MarkupKind.PlainText, value: "Define a function" }
      },
      {
        label: "defn-typed",
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "(defn ${1:name} (${2:param1}: ${3:Type1} ${4:param2}: ${5:Type2}) (-> ${6:ReturnType})\n  ${7:body})$0",
        documentation: { kind: MarkupKind.PlainText, value: "Define a typed function" }
      },
      {
        label: "fn",
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "(fn (${1:params})\n  ${2:body})$0",
        documentation: { kind: MarkupKind.PlainText, value: "Anonymous function" }
      },
      {
        label: "let",
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "(let [\n  ${1:name1} ${2:value1}\n  ${3:name2} ${4:value2}\n]\n  ${5:body})$0",
        documentation: { kind: MarkupKind.PlainText, value: "Let binding" }
      },
      {
        label: "if",
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "(if ${1:condition}\n  ${2:then-branch}\n  ${3:else-branch})$0",
        documentation: { kind: MarkupKind.PlainText, value: "If expression" }
      },
      {
        label: "cond",
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "(cond\n  ${1:condition1} ${2:result1}\n  ${3:condition2} ${4:result2}\n  true ${5:default-result})$0",
        documentation: { kind: MarkupKind.PlainText, value: "Conditional expression" }
      },
      {
        label: "defenum",
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "(defenum ${1:EnumName} ${2:value1} ${3:value2} ${4:value3})$0",
        documentation: { kind: MarkupKind.PlainText, value: "Define an enum" }
      },
      {
        label: "vector",
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "[${1:item1}, ${2:item2}]$0",
        documentation: { kind: MarkupKind.PlainText, value: "Vector literal" }
      },
      {
        label: "object",
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "{\"${1:key1}\": ${2:value1}, \"${3:key2}\": ${4:value2}}$0",
        documentation: { kind: MarkupKind.PlainText, value: "Object literal" }
      },
      {
        label: "set",
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "#[${1:item1}, ${2:item2}]$0",
        documentation: { kind: MarkupKind.PlainText, value: "Set literal" }
      },
      {
        label: "import",
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "(def ${1:moduleName} (import \"${2:path}\"))$0",
        documentation: { kind: MarkupKind.PlainText, value: "Import a module" }
      }
    ];
    
    completions.push(...snippets);
    
    // Add symbol completions from symbol table
    const symbolTable = symbolTables.get(params.textDocument.uri);
    if (symbolTable) {
      for (const [name, info] of symbolTable.entries()) {
        const sig = functionSignatures.get(name);
        
        if (sig) {
          // It's a function
          let insertText: string;
          let detail: string;
          
          if (sig.params.length > 0) {
            // Functions with parameters - create call snippet
            const hasTypes = sig.params.some(p => p.type !== undefined);
            
            if (hasTypes) {
              // Use named parameters for typed functions
              insertText = `${name} ${sig.params.map((p, i) => 
                `${p.name}: \${${i+1}:${p.type || 'value'}}`).join(' ')}`;
            } else {
              // Use positional parameters for untyped functions
              insertText = `${name} ${sig.params.map((p, i) => 
                `\${${i+1}:${p.name}}`).join(' ')}`;
            }
            
            detail = formatFunctionSignature(name, sig);
          } else {
            // Functions with no parameters - don't need snippet
            insertText = name;
            detail = `(${name})` + (sig.returnType ? ` -> ${sig.returnType}` : '');
          }
          
          completions.push({
            label: name,
            kind: CompletionItemKind.Function,
            detail,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText,
            documentation: sig.docString ? {
              kind: MarkupKind.PlainText,
              value: sig.docString
            } : undefined
          });
        } else {
          // It's a variable or other symbol
          completions.push({
            label: name,
            kind: CompletionItemKind.Variable,
            insertText: name
          });
        }
      }
    }
    
    // Add enum types
    for (const [enumName, enumInfo] of enumTable.entries()) {
      // Add the enum type itself
      completions.push({
        label: enumName,
        kind: CompletionItemKind.Class,
        detail: `Enum with ${enumInfo.cases.length} cases`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `**Enum**: \`${enumName}\`\n\nCases: ${enumInfo.cases.map(c => `.${c}`).join(', ')}`
        }
      });
      
      // Add each enum case
      for (const caseName of enumInfo.cases) {
        completions.push({
          label: `.${caseName}`,
          kind: CompletionItemKind.EnumMember,
          detail: `${enumName}.${caseName}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `**Enum Case**: \`${enumName}.${caseName}\``
          }
        });
      }
    }
    
    // Add keyword completions
    const keywords = [
      "def", "defsync", "defn", "defx", "fn", "fx", "if", "cond", "let", "loop", "recur",
      "export", "import", "->", "do", "when", "case", "for", "defenum", "defmacro",
      "str", "get", "set", "print", "keyword", "hash-map", "vector", "list", "new"
    ];
    
    for (const keyword of keywords) {
      completions.push({
        label: keyword,
        kind: CompletionItemKind.Keyword
      });
    }
    
    return completions;
  } catch (err) {
    connection.console.error("Completion error: " + String(err));
    return [];
  }
});

connection.onCompletionResolve(item => {
  // Add any additional information to the completion item
  return item;
});

/* ----------------------------------------------------------------------
   8. Hover
----------------------------------------------------------------------*/
connection.onHover(params => {
  try {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;
    
    const offset = doc.offsetAt(params.position);
    const text = doc.getText();
    
    // Check for enum case (like .red)
    const wordRange = getWordRangeAtPosition(doc, params.position);
    if (!wordRange) return null;
    
    const word = doc.getText(wordRange);
    
    // Check if this is an enum case (starts with .)
    if (word.startsWith('.')) {
      const caseName = word.substring(1);
      for (const [enumName, enumInfo] of enumTable.entries()) {
        if (enumInfo.cases.includes(caseName)) {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: `**Enum Case**: \`${enumName}.${caseName}\``
            }
          };
        }
      }
    }
    
    // Check symbol tables
    const symbolTable = symbolTables.get(params.textDocument.uri);
    if (!symbolTable) return null;
    
    // Look for a symbol at this position
    for (const [name, info] of symbolTable.entries()) {
      // Check if our position matches the definition
      if (offset >= info.defStart && offset <= info.defEnd) {
        const sig = functionSignatures.get(name);
        
        if (sig) {
          // Function definition
          let content = `**Function**: \`${name}\`\n\n`;
          content += `\`\`\`hql\n${formatFunctionSignature(name, sig)}\n\`\`\``;
          
          if (sig.docString) {
            content += `\n\n${sig.docString}`;
          }
          
          return { contents: { kind: MarkupKind.Markdown, value: content } };
        } else {
          // Variable definition
          let content = `**Variable**: \`${name}\``;
          
          if (info.docString) {
            content += `\n\n${info.docString}`;
          }
          
          return { contents: { kind: MarkupKind.Markdown, value: content } };
        }
      }
      
      // Check if our position matches a reference
      for (const refOffset of info.references) {
        if (offset >= refOffset && offset <= refOffset + name.length) {
          const sig = functionSignatures.get(name);
          
          if (sig) {
            // Function reference
            let content = `**Function**: \`${name}\`\n\n`;
            content += `\`\`\`hql\n${formatFunctionSignature(name, sig)}\n\`\`\``;
            
            if (sig.docString) {
              content += `\n\n${sig.docString}`;
            }
            
            return { contents: { kind: MarkupKind.Markdown, value: content } };
          } else {
            // Variable reference
            let content = `**Variable**: \`${name}\``;
            
            if (info.docString) {
              content += `\n\n${info.docString}`;
            }
            
            return { contents: { kind: MarkupKind.Markdown, value: content } };
          }
        }
      }
    }
    
    // Check if we're hovering over an enum type
    for (const [enumName, enumInfo] of enumTable.entries()) {
      if (word === enumName) {
        let content = `**Enum**: \`${enumName}\`\n\n**Cases**:\n`;
        content += enumInfo.cases.map(c => `- \`.${c}\``).join('\n');
        
        return { contents: { kind: MarkupKind.Markdown, value: content } };
      }
    }
    
    return null;
  } catch (err) {
    connection.console.error("Hover error: " + String(err));
    return null;
  }
});

/* ----------------------------------------------------------------------
   9. Document Symbols
----------------------------------------------------------------------*/
connection.onDocumentSymbol(params => {
  try {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];
    
    const symbolTable = symbolTables.get(params.textDocument.uri);
    if (!symbolTable) return [];
    
    const docSymbols: DocumentSymbol[] = [];
    
    for (const [name, info] of symbolTable.entries()) {
      const range = {
        start: doc.positionAt(info.defStart),
        end: doc.positionAt(info.defEnd)
      };
      
      const sig = functionSignatures.get(name);
      const enumInfo = enumTable.get(name);
      
      let kind: SymbolKind;
      let detail: string | undefined;
      
      if (sig) {
        // It's a function
        kind = SymbolKind.Function;
        detail = sig.params.length === 0 ? 
                 '()' : 
                 `(${sig.params.map(p => p.type ? `${p.name}: ${p.type}` : p.name).join(' ')})`;
        if (sig.returnType) {
          detail += ` -> ${sig.returnType}`;
        }
      } else if (enumInfo) {
        // It's an enum
        kind = SymbolKind.Enum;
        detail = `Enum with ${enumInfo.cases.length} cases`;
        
        // Add children for enum cases
        const children: DocumentSymbol[] = [];
        for (const caseName of enumInfo.cases) {
          children.push({
            name: `.${caseName}`,
            kind: SymbolKind.EnumMember,
            range,
            selectionRange: range
          });
        }
        
        docSymbols.push({
          name,
          kind,
          detail,
          range,
          selectionRange: range,
          children
        });
        
        // Skip adding this enum to the main list since we already added it with children
        continue;
      } else {
        // It's a variable
        kind = SymbolKind.Variable;
      }
      
      docSymbols.push({
        name,
        kind,
        detail,
        range,
        selectionRange: range
      });
    }
    
    return docSymbols;
  } catch (err) {
    connection.console.error("DocumentSymbol error: " + String(err));
    return [];
  }
});

/* ----------------------------------------------------------------------
   10. Go to Definition
----------------------------------------------------------------------*/
connection.onDefinition(params => {
  try {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;
    
    const position = params.position;
    const wordRange = getWordRangeAtPosition(doc, position);
    if (!wordRange) return null;
    
    const word = doc.getText(wordRange);
    const symbolTable = symbolTables.get(params.textDocument.uri);
    if (!symbolTable) return null;
    
    // Handle enum case (like .red)
    if (word.startsWith('.')) {
      const caseName = word.substring(1);
      for (const [enumName, enumInfo] of enumTable.entries()) {
        if (enumInfo.cases.includes(caseName)) {
          // Find the enum definition
          const enumInfo = symbolTable.get(enumName);
          if (enumInfo) {
            return Location.create(
              doc.uri,
              Range.create(doc.positionAt(enumInfo.defStart), doc.positionAt(enumInfo.defEnd))
            );
          }
        }
      }
    }
    
    // Check for normal symbol
    const info = symbolTable.get(word);
    if (!info) return null;
    
    return Location.create(
      doc.uri,
      Range.create(doc.positionAt(info.defStart), doc.positionAt(info.defEnd))
    );
  } catch (err) {
    connection.console.error("Definition error: " + String(err));
    return null;
  }
});

/* ----------------------------------------------------------------------
   11. Find References
----------------------------------------------------------------------*/
connection.onReferences((params: ReferenceParams) => {
  try {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];
    
    const position = params.position;
    const wordRange = getWordRangeAtPosition(doc, position);
    if (!wordRange) return [];
    
    const word = doc.getText(wordRange);
    const symbolTable = symbolTables.get(params.textDocument.uri);
    if (!symbolTable) return [];
    
    // Check for enum case (like .red)
    if (word.startsWith('.')) {
      const caseName = word.substring(1);
      const locations: Location[] = [];
      
      // Look for all instances of this enum case
      const text = doc.getText();
      const pattern = `\\.${caseName}\\b`;
      const regex = new RegExp(pattern, 'g');
      let match: RegExpExecArray | null;
      
      while ((match = regex.exec(text)) !== null) {
        const start = doc.positionAt(match.index);
        const end = doc.positionAt(match.index + match[0].length);
        
        locations.push(Location.create(doc.uri, Range.create(start, end)));
      }
      
      return locations;
    }
    
    // Handle normal symbols
    const info = symbolTable.get(word);
    if (!info) return [];
    
    const locations: Location[] = [];
    
    // Add the definition
    locations.push(Location.create(
      doc.uri,
      Range.create(doc.positionAt(info.defStart), doc.positionAt(info.defEnd))
    ));
    
    // Add all references
    for (const refOffset of info.references) {
      locations.push(Location.create(
        doc.uri,
        Range.create(doc.positionAt(refOffset), doc.positionAt(refOffset + word.length))
      ));
    }
    
    return locations;
  } catch (err) {
    connection.console.error("References error: " + String(err));
    return [];
  }
});

/* ----------------------------------------------------------------------
   12. Rename Symbol
----------------------------------------------------------------------*/
connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
  try {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;
    
    const position = params.position;
    const wordRange = getWordRangeAtPosition(doc, position);
    if (!wordRange) return null;
    
    const oldName = doc.getText(wordRange);
    const newName = params.newName;
    
    if (!newName || newName.trim() === '' || newName === oldName) return null;
    
    const symbolTable = symbolTables.get(params.textDocument.uri);
    if (!symbolTable) return null;
    
    // Handle enum case (like .red)
    if (oldName.startsWith('.')) {
      const caseName = oldName.substring(1);
      const newCaseName = newName.startsWith('.') ? newName.substring(1) : newName;
      const edits: TextEdit[] = [];
      
      // Look for all instances of this enum case
      const text = doc.getText();
      const pattern = `\\.${caseName}\\b`;
      const regex = new RegExp(pattern, 'g');
      let match: RegExpExecArray | null;
      
      while ((match = regex.exec(text)) !== null) {
        const start = doc.positionAt(match.index);
        const end = doc.positionAt(match.index + match[0].length);
        
        edits.push(TextEdit.replace(Range.create(start, end), `.${newCaseName}`));
      }
      
      return { changes: { [doc.uri]: edits } };
    }
    
    // Handle normal symbols
    const info = symbolTable.get(oldName);
    if (!info) return null;
    
    const edits: TextEdit[] = [];
    
    // Edit the definition
    edits.push(TextEdit.replace(
      Range.create(doc.positionAt(info.defStart), doc.positionAt(info.defEnd)),
      newName
    ));
    
    // Edit all references
    for (const refOffset of info.references) {
      edits.push(TextEdit.replace(
        Range.create(doc.positionAt(refOffset), doc.positionAt(refOffset + oldName.length)),
        newName
      ));
    }
    
    return { changes: { [doc.uri]: edits } };
  } catch (err) {
    connection.console.error("Rename error: " + String(err));
    return null;
  }
});

/* ----------------------------------------------------------------------
   13. Document Formatting
----------------------------------------------------------------------*/
connection.onDocumentFormatting((params: DocumentFormattingParams) => {
  try {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];
    
    const text = doc.getText();
    const formattedText = formatHQL(text, params.options);
    
    // Return a single edit that replaces the entire document
    return [
      TextEdit.replace(
        Range.create(doc.positionAt(0), doc.positionAt(text.length)),
        formattedText
      )
    ];
  } catch (err) {
    connection.console.error("Formatting error: " + String(err));
    return [];
  }
});

/**
 * Format HQL code with proper indentation
 */
function formatHQL(text: string, options: FormattingOptions): string {
  const tabSize = options.tabSize || 2;
  const lines = text.split('\n');
  const formattedLines: string[] = [];
  let indent = 0;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Skip empty lines and comments
    if (line === '' || line.startsWith(';')) {
      formattedLines.push(line);
      continue;
    }
    
    // Count opening and closing delimiters to adjust indentation
    const openCount = (line.match(/[\(\[\{]/g) || []).length;
    const closeCount = (line.match(/[\)\]\}]/g) || []).length;
    
    // If a line starts with a closing delimiter, decrease indent before adding it
    if (line.startsWith(')') || line.startsWith(']') || line.startsWith('}')) {
      indent = Math.max(0, indent - 1);
    }
    
    // Calculate current indentation
    const currentIndent = ' '.repeat(indent * tabSize);
    formattedLines.push(currentIndent + line);
    
    // Update indentation for the next line
    indent += openCount;
    indent -= closeCount;
    
    // Ensure indent never goes negative
    indent = Math.max(0, indent);
  }
  
  return formattedLines.join('\n');
}

/* ----------------------------------------------------------------------
   14. Semantic Tokens
----------------------------------------------------------------------*/
const tokenTypes = [
  "variable", "function", "keyword", "string", "number", "macro", "type", "enumMember", "parameter"
];

interface TokenData {
  line: number;
  startChar: number;
  length: number;
  tokenType: number;
  tokenMods: number;
}

connection.languages.semanticTokens.on((params: SemanticTokensParams): SemanticTokens => {
  try {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return { data: [] };
    
    const data = computeSemanticTokens(doc);
    return { data };
  } catch (err) {
    connection.console.error("SemanticTokens error: " + String(err));
    return { data: [] };
  }
});

connection.languages.semanticTokens.onRange((params: SemanticTokensRangeParams): SemanticTokens => {
  try {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return { data: [] };
    
    // For simplicity, we'll return all tokens
    const data = computeSemanticTokens(doc);
    return { data };
  } catch (err) {
    connection.console.error("SemanticTokensRange error: " + String(err));
    return { data: [] };
  }
});

/**
 * Compute semantic tokens for syntax highlighting
 */
function computeSemanticTokens(doc: TextDocument): number[] {
  const tokens: TokenData[] = [];
  const text = doc.getText();
  
  // Get parsed AST
  const ast = parse(text);
  
  // Add tokens for known keywords
  const keywords = [
    "def", "defsync", "defn", "defx", "fn", "fx", "if", "cond", "let", "loop", "recur",
    "export", "import", "->", "do", "when", "case", "for", "defenum", "defmacro",
    "str", "get", "set", "print", "keyword", "hash-map", "vector", "list", "new"
  ];
  
  // Find keywords in the text
  for (const keyword of keywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'g');
    let match: RegExpExecArray | null;
    
    while ((match = regex.exec(text)) !== null) {
      const pos = doc.positionAt(match.index);
      tokens.push({
        line: pos.line,
        startChar: pos.character,
        length: keyword.length,
        tokenType: tokenTypes.indexOf("keyword"),
        tokenMods: 0
      });
    }
  }
  
  // Add tokens for enum cases
  for (const [enumName, enumInfo] of enumTable.entries()) {
    for (const caseName of enumInfo.cases) {
      const regex = new RegExp(`\\.${caseName}\\b`, 'g');
      let match: RegExpExecArray | null;
      
      while ((match = regex.exec(text)) !== null) {
        const pos = doc.positionAt(match.index);
        tokens.push({
          line: pos.line,
          startChar: pos.character,
          length: caseName.length + 1, // Include the dot
          tokenType: tokenTypes.indexOf("enumMember"),
          tokenMods: 0
        });
      }
    }
  }
  
  // Add tokens for named parameters
  const namedParamRegex = /\b([a-zA-Z][a-zA-Z0-9-_]*):(?=\s)/g;
  let namedMatch: RegExpExecArray | null;
  
  while ((namedMatch = namedParamRegex.exec(text)) !== null) {
    const pos = doc.positionAt(namedMatch.index);
    tokens.push({
      line: pos.line,
      startChar: pos.character,
      length: namedMatch[1].length + 1, // Include the colon
      tokenType: tokenTypes.indexOf("parameter"),
      tokenMods: 0
    });
  }
  
  // Add tokens for defined symbols and functions
  const symbolTable = symbolTables.get(doc.uri);
  if (symbolTable) {
    for (const [name, info] of symbolTable.entries()) {
      const pos = doc.positionAt(info.defStart);
      
      // Add token for definition
      tokens.push({
        line: pos.line,
        startChar: pos.character,
        length: name.length,
        tokenType: functionSignatures.has(name) ? 
                  tokenTypes.indexOf("function") : 
                  tokenTypes.indexOf("variable"),
        tokenMods: 1 // Definition modifier
      });
      
      // Add tokens for all references
      for (const refOffset of info.references) {
        const refPos = doc.positionAt(refOffset);
        tokens.push({
          line: refPos.line,
          startChar: refPos.character,
          length: name.length,
          tokenType: functionSignatures.has(name) ? 
                    tokenTypes.indexOf("function") : 
                    tokenTypes.indexOf("variable"),
          tokenMods: 0
        });
      }
    }
  }
  
  // Sort tokens by position
  tokens.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.startChar - b.startChar;
  });
  
  // Encode tokens in the format expected by VS Code
  return encodeTokens(tokens);
}

/**
 * Encode token data into the format expected by VS Code
 */
function encodeTokens(tokenData: TokenData[]): number[] {
  let prevLine = 0, prevChar = 0;
  const result: number[] = [];
  
  for (const token of tokenData) {
    const lineDelta = token.line - prevLine;
    const charDelta = lineDelta === 0 ? token.startChar - prevChar : token.startChar;
    
    result.push(
      lineDelta,
      charDelta,
      token.length,
      token.tokenType,
      token.tokenMods
    );
    
    prevLine = token.line;
    prevChar = token.startChar;
  }
  
  return result;
}

/* ----------------------------------------------------------------------
   15. Helper Function: getWordRangeAtPosition
----------------------------------------------------------------------*/
function getWordRangeAtPosition(doc: TextDocument, pos: Position): Range | null {
  const text = doc.getText();
  const offset = doc.offsetAt(pos);
  
  if (offset >= text.length) return null;
  
  // Special case for enum cases starting with a dot
  if (offset > 0 && text[offset - 1] === '.') {
    // Include the dot in the range
    let start = offset - 1;
    let end = offset;
    
    // Find the end of the word
    while (end < text.length && /[\w-]/.test(text[end])) {
      end++;
    }
    
    if (end > offset) {
      return Range.create(doc.positionAt(start), doc.positionAt(end));
    }
  }
  
  // Normal word detection
  let start = offset;
  let end = offset;
  
  // Move start backwards to the beginning of the word
  while (start > 0 && /[\w\-\._]/.test(text[start - 1])) {
    start--;
  }
  
  // Move end forward to the end of the word
  while (end < text.length && /[\w\-\._]/.test(text[end])) {
    end++;
  }
  
  if (start === end) return null;
  
  return Range.create(doc.positionAt(start), doc.positionAt(end));
}

/* ----------------------------------------------------------------------
   16. Start Listening for Connections
----------------------------------------------------------------------*/
documents.listen(connection);
connection.listen();