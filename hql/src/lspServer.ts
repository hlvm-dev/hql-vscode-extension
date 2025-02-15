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
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

/* ----------------------------------------------------------------------
   1. AST DEFINITIONS & PARSER
----------------------------------------------------------------------*/

export type HQLValue =
  | HQLSymbol
  | HQLList
  | HQLNumber
  | HQLString
  | HQLBoolean
  | HQLNil
  | HQLEnumCase;

export interface HQLSymbol  { type: "symbol";  name: string; start?: number; end?: number; }
export interface HQLList    { type: "list";    value: HQLValue[]; start?: number; end?: number; }
export interface HQLNumber  { type: "number";  value: number;     start?: number; end?: number; }
export interface HQLString  { type: "string";  value: string;     start?: number; end?: number; }
export interface HQLBoolean { type: "boolean"; value: boolean;    start?: number; end?: number; }
export interface HQLNil     { type: "nil";     start?: number; end?: number; }
// For enum cases like ".hlvm"
export interface HQLEnumCase { type: "enum-case"; name: string; start?: number; end?: number; }

function parseHQL(input: string): HQLValue[] {
  const result: HQLValue[] = [];
  let i = 0;
  const len = input.length;

  function skipWs() {
    while (i < len) {
      const ch = input.charAt(i);
      if (ch === ";") {
        while (i < len && input.charAt(i) !== "\n") i++;
      } else if (/\s/.test(ch)) {
        i++;
      } else {
        break;
      }
    }
  }

  function readString(): HQLValue {
    const startPos = i;
    i++; // skip opening "
    let buf = "";
    let parts: HQLValue[] = [];
    let interpolation = false;
    while (i < len) {
      if (input[i] === '"') {
        i++;
        break;
      }
      // detect \(
      if (input[i] === "\\" && i + 1 < len && input[i + 1] === "(") {
        interpolation = true;
        if (buf !== "") {
          parts.push({ type: "string", value: buf, start: startPos, end: i });
        }
        buf = "";
        i += 2; // skip "\("
        let exprStr = "";
        let parenCount = 1;
        while (i < len && parenCount > 0) {
          const c = input[i];
          if (c === "(") {
            parenCount++;
          } else if (c === ")") {
            parenCount--;
            if (parenCount === 0) {
              i++; // skip the closing ")"
              break;
            }
          }
          exprStr += c;
          i++;
        }
        const subForms = parseHQL(exprStr);
        if (subForms.length > 0) {
          parts.push(subForms[0]);
        }
      } else {
        buf += input[i];
        i++;
      }
    }
    if (!interpolation) {
      return { type: "string", value: buf, start: startPos, end: i };
    } else {
      if (buf !== "") {
        parts.push({ type: "string", value: buf, start: startPos, end: i });
      }
      return {
        type: "list",
        value: [{ type: "symbol", name: "str" }, ...parts],
        start: startPos,
        end: i
      };
    }
  }

  function readSymbolOrNumber(): HQLValue {
    const startPos = i;
    while (
      i < len &&
      !/\s/.test(input.charAt(i)) &&
      !["(", ")", "[", "]", ";"].includes(input.charAt(i))
    ) {
      i++;
    }
    const token = input.slice(startPos, i);
    if (token.startsWith(".")) {
      return { type: "enum-case", name: token.slice(1), start: startPos, end: i };
    }
    if (/^[+\-]?\d+(\.\d+)?$/.test(token)) {
      return { type: "number", value: parseFloat(token), start: startPos, end: i };
    }
    if (token === "true")  return { type: "boolean", value: true, start: startPos, end: i };
    if (token === "false") return { type: "boolean", value: false, start: startPos, end: i };
    if (token === "nil")   return { type: "nil", start: startPos, end: i };
    return { type: "symbol", name: token, start: startPos, end: i };
  }

  function readList(): HQLList {
    const startPos = i;
    i++; // skip '(' or '['
    const items: HQLValue[] = [];
    while (true) {
      skipWs();
      if (i >= len) break;
      const ch = input.charAt(i);
      if (ch === ")" || ch === "]") {
        i++;
        return { type: "list", value: items, start: startPos, end: i };
      }
      items.push(readForm());
    }
    return { type: "list", value: items, start: startPos, end: i };
  }

  function readForm(): HQLValue {
    skipWs();
    if (i >= len) return { type: "nil", start: i, end: i };
    const ch = input.charAt(i);
    if (ch === "(" || ch === "[") return readList();
    if (ch === '"') return readString();
    if (ch === ")" || ch === "]") {
      i++;
      return { type: "nil", start: i - 1, end: i };
    }
    return readSymbolOrNumber();
  }

  while (true) {
    skipWs();
    if (i >= len) break;
    result.push(readForm());
  }
  return result;
}

/* ----------------------------------------------------------------------
   2. Symbol Table, Enums, Function Signatures
----------------------------------------------------------------------*/

interface SymbolInfo {
  name: string;
  defStart: number;
  defEnd: number;
  references: number[];
  docString?: string;
}
interface ParamInfo { name: string; type?: string; }
const functionSignatures: Map<string, { params: ParamInfo[]; returnType?: string }> = new Map();
interface EnumInfo { name: string; cases: string[]; }
const enumTable: Map<string, EnumInfo> = new Map();

interface Scope { start: number; end: number; bindings: string[]; }
const symbolTables: Map<string, Map<string, SymbolInfo>> = new Map();
const localScopes: Map<string, Scope[]> = new Map();

/* ----------------------------------------------------------------------
   3. Extract Param Infos
----------------------------------------------------------------------*/
function extractParamInfos(paramNode: HQLValue): ParamInfo[] {
  if (paramNode.type !== "list") return [];
  const out: ParamInfo[] = [];
  const tokens = paramNode.value;
  let i = 0;
  while (i < tokens.length) {
    const tk = tokens[i];
    if (tk.type === "symbol") {
      const nm = tk.name;
      if (nm.endsWith(":")) {
        const paramName = nm.slice(0, -1);
        let tname: string | undefined;
        if (i + 1 < tokens.length && tokens[i + 1].type === "symbol") {
          tname = (tokens[i + 1] as HQLSymbol).name;
          i += 2;
        } else {
          i++;
        }
        out.push({ name: paramName, type: tname });
      } else {
        out.push({ name: nm });
        i++;
      }
    } else {
      i++;
    }
  }
  return out;
}

/* ----------------------------------------------------------------------
   4. AST Walker: Build Symbol Table, Enums, Function Signatures
----------------------------------------------------------------------*/
function walkAST(ast: HQLValue[], text: string, uri: string): void {
  functionSignatures.clear();
  enumTable.clear();
  const st = new Map<string, SymbolInfo>();
  symbolTables.set(uri, st);
  localScopes.set(uri, []);
  const scopeStack: Scope[] = [];

  function pushScope(start: number, end: number, bindings: string[]) {
    scopeStack.push({ start, end, bindings });
    localScopes.get(uri)!.push({ start, end, bindings });
  }
  function popScope() { scopeStack.pop(); }

  function visit(node: HQLValue) {
    if (node.type === "list") {
      const items = node.value;
      if (items.length >= 2) {
        const head = items[0];
        if (head.type === "symbol") {
          const hname = head.name;
          if (["def", "defsync", "defn", "defx"].includes(hname)) {
            const symVal = items[1];
            if (symVal.type === "symbol") {
              const symName = symVal.name;
              const pattern = "(" + hname + " " + symName;
              const idx = text.indexOf(pattern);
              if (idx >= 0) {
                const defStart = idx + ("(" + hname + " ").length;
                const defEnd = defStart + symName.length;
                st.set(symName, { name: symName, defStart, defEnd, references: [] });
              }
              if (hname === "defn" || hname === "defx") {
                const paramNode = items[2];
                const paramInfos = extractParamInfos(paramNode);
                let returnType: string | undefined;
                if (items.length >= 4 && items[3].type === "list") {
                  const retList = items[3].value;
                  if (retList.length >= 2 && retList[0].type === "symbol" && retList[0].name === "->") {
                    if (retList[1].type === "symbol") {
                      returnType = retList[1].name;
                    }
                  }
                }
                functionSignatures.set(symName, { params: paramInfos, returnType });
              } else if (hname === "def" || hname === "defsync") {
                if (items.length >= 3 && items[2].type === "list") {
                  const maybeFn = items[2].value[0];
                  if (maybeFn && maybeFn.type === "symbol" && (maybeFn.name === "fn" || maybeFn.name === "fx")) {
                    const paramNode = items[2].value[1];
                    const paramInfos = extractParamInfos(paramNode);
                    let returnType: string | undefined;
                    if (items[2].value.length >= 3) {
                      const ret = items[2].value[2];
                      if (ret.type === "list" && ret.value.length >= 2 &&
                          ret.value[0].type === "symbol" && ret.value[0].name === "->") {
                        if (ret.value[1].type === "symbol") {
                          returnType = ret.value[1].name;
                        }
                      }
                    }
                    functionSignatures.set(symName, { params: paramInfos, returnType });
                  }
                }
              }
            }
          }
          if (hname === "defenum" && items.length >= 2) {
            const enumSym = items[1];
            if (enumSym.type === "symbol") {
              const enumName = enumSym.name;
              const pattern = "(defenum " + enumName;
              const idx = text.indexOf(pattern);
              let defStart = 0, defEnd = 0;
              if (idx >= 0) { defStart = idx + "(defenum ".length; defEnd = defStart + enumName.length; }
              st.set(enumName, { name: enumName, defStart, defEnd, references: [] });
              const cases = items.slice(2).flatMap(n => n.type === "symbol" ? [n.name] : []);
              enumTable.set(enumName, { name: enumName, cases });
            }
          }
        }
      }
      if (node.value.length >= 2) {
        const h2 = node.value[0];
        if (h2.type === "symbol" && (h2.name === "fn" || h2.name === "fx")) {
          if (node.start !== undefined && node.end !== undefined) {
            const paramInfos = extractParamInfos(node.value[1]);
            pushScope(node.start, node.end, paramInfos.map(p => p.name));
            for (let i = 2; i < node.value.length; i++) {
              visit(node.value[i]);
            }
            popScope();
            return;
          }
        }
        if (h2.type === "symbol" && h2.name === "let") {
          const bindingNode = node.value[1];
          if (bindingNode && bindingNode.type === "list") {
            const letBindings: string[] = [];
            for (const b of bindingNode.value) {
              if (b.type === "list" && b.value.length >= 1) {
                const nm = b.value[0];
                if (nm.type === "symbol") { letBindings.push(nm.name); }
              }
            }
            if (node.start !== undefined && node.end !== undefined) {
              pushScope(node.start, node.end, letBindings);
              for (let i = 2; i < node.value.length; i++) { visit(node.value[i]); }
              popScope();
              return;
            }
          }
        }
      }
      for (const c of node.value) {
        if (c.type === "list") { visit(c); }
      }
    }
  }

  for (const form of ast) {
    if (form.type === "list") { visit(form); }
  }

  for (const [symName, info] of st.entries()) {
    const re = new RegExp("\\b" + symName + "\\b", "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const offset = m.index;
      if (offset < info.defStart || offset > info.defEnd) { info.references.push(offset); }
    }
  }
}

/* ----------------------------------------------------------------------
   5. findActiveArgument
----------------------------------------------------------------------*/
interface ArgContext { fnName: string; paramIndex: number; paramLabel?: string; }

function findActiveArgument(ast: HQLValue[], offset: number): ArgContext | null {
  let bestNode: HQLValue | null = null;
  for (const top of ast) {
    const found = findNodeAtOffset(top, offset);
    if (found) bestNode = found;
  }
  if (!bestNode) return null;
  const callList = bestNode.type === "list" ? bestNode : findClosestList(ast, bestNode);
  if (!callList || callList.value.length === 0) return null;
  const head = callList.value[0];
  if (head.type !== "symbol") return null;
  const fnName = head.name;
  let labeled = false;
  for (const arg of callList.value.slice(1)) {
    if (arg.type === "symbol" && arg.name.endsWith(":")) { labeled = true; break; }
  }
  let paramIndex = -1;
  let paramLabel: string | undefined;
  if (labeled) {
    const args = callList.value.slice(1);
    for (let i = 0; i < args.length; i += 2) {
      const lab = args[i];
      const val = args[i + 1];
      if (!val) break;
      const inLabel = insideNode(lab, offset);
      const inValue = insideNode(val, offset);
      if (lab.type === "symbol" && lab.name.endsWith(":")) {
        const plabel = lab.name.slice(0, -1);
        if (inLabel || inValue) {
          paramLabel = plabel;
          paramIndex = findParamIndexByLabel(fnName, plabel);
          break;
        }
      }
    }
  } else {
    for (let i = 1; i < callList.value.length; i++) {
      const arg = callList.value[i];
      if (insideNode(arg, offset)) { paramIndex = i - 1; break; }
    }
    if (paramIndex < 0) { paramIndex = callList.value.length - 1; }
  }
  if (paramIndex < 0) return null;
  return { fnName, paramIndex, paramLabel };
}

function insideNode(node: HQLValue, offset: number): boolean {
  if (node.start === undefined || node.end === undefined) return false;
  if (offset >= node.start && offset < node.end) return true;
  const diff = offset - node.end;
  return diff >= 0 && diff <= 1;
}

function findNodeAtOffset(node: HQLValue, offset: number): HQLValue | null {
  if (node.start !== undefined && node.end !== undefined) {
    if (offset < node.start || offset >= node.end + 2) return null;
  }
  if (node.type === "list") {
    for (const c of node.value) {
      const found = findNodeAtOffset(c, offset);
      if (found) return found;
    }
    return node;
  }
  return node;
}

function findClosestList(ast: HQLValue[], node: HQLValue): HQLList | null {
  let best: HQLList | null = null;
  function dfs(n: HQLValue) {
    if (n.type === "list") {
      for (const c of n.value) {
        if (c === node) { best = n; return; }
        dfs(c);
      }
    }
  }
  for (const top of ast) { dfs(top); }
  return best;
}

function findParamIndexByLabel(fnName: string, label: string): number {
  const sig = functionSignatures.get(fnName);
  if (!sig) return -1;
  for (let i = 0; i < sig.params.length; i++) {
    if (sig.params[i].name === label) return i;
  }
  return -1;
}

/* ----------------------------------------------------------------------
   6. LSP SETUP
----------------------------------------------------------------------*/
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ["(", " ", ":", ".", "\""]
      },
      hoverProvider: true,
      documentSymbolProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: true,
      semanticTokensProvider: {
        legend: {
          tokenTypes: ["variable", "function", "keyword", "string", "number", "macro", "type"],
          tokenModifiers: []
        },
        full: true,
        range: true
      }
    }
  };
});

documents.onDidChangeContent(change => {
  const doc = change.document;
  const text = doc.getText();
  validateTextDocument(doc);
  try {
    const ast = parseHQL(text);
    walkAST(ast, text, doc.uri);
  } catch (err) {
    connection.console.error("Parse error: " + err);
  }
});

function validateTextDocument(doc: TextDocument) {
  const text = doc.getText();
  const diagnostics: Diagnostic[] = [];
  let balance = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") balance++;
    else if (text[i] === ")") {
      balance--;
      if (balance < 0) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: { start: doc.positionAt(i), end: doc.positionAt(i + 1) },
          message: "Unmatched closing parenthesis",
          source: "hql"
        });
        balance = 0;
      }
    }
  }
  if (balance > 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: { start: doc.positionAt(text.length - 1), end: doc.positionAt(text.length) },
      message: "Unmatched opening parenthesis",
      source: "hql"
    });
  }
  // If there's code but no top-level forms, warn the user.
  const forms = parseHQL(text);
  if (forms.length === 0 && text.trim().length > 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      range: { start: doc.positionAt(0), end: doc.positionAt(text.length) },
      message: "No expression found in file",
      source: "hql"
    });
  }
  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

/* ----------------------------------------------------------------------
   7. COMPLETIONS (Context-Aware)
----------------------------------------------------------------------*/
connection.onCompletion(params => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const fullText = doc.getText();
  const offset = doc.offsetAt(params.position);
  const textBefore = fullText.substring(0, offset);
  
  // 1) If in a partial definition, suppress normal symbol completions.
  const defRegex = /\((def|defsync|defmacro|defn|defx)\s+[^\s()]*$/;
  if (defRegex.test(textBefore)) {
    return [
      {
        label: "Definition snippet",
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: " ${1:name} ${2:value})$0",
        documentation: { kind: MarkupKind.PlainText, value: "Complete a definition with name & value" }
      }
    ];
  }
  
  // 2) If inside a function call with an enum parameter, offer only enum completions.
  const ast = parseHQL(fullText);
  const argCtx = findActiveArgument(ast, offset);
  if (argCtx) {
    const { fnName, paramIndex } = argCtx;
    const sig = functionSignatures.get(fnName);
    if (sig && paramIndex >= 0 && paramIndex < sig.params.length) {
      const param = sig.params[paramIndex];
      if (param.type && enumTable.has(param.type)) {
        const e = enumTable.get(param.type)!;
        const out: CompletionItem[] = [];
        for (const c of e.cases) {
          out.push({
            label: "." + c,
            kind: CompletionItemKind.EnumMember,
            insertText: c  // inserts only the case name
          });
        }
        return out;
      }
    }
  }
  
  // 3) Otherwise, provide normal completions.
  const completions: CompletionItem[] = [];
  
  const baseSnippets: CompletionItem[] = [
    {
      label: "def",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "(def ${1:name} ${2:value})$0"
    },
    {
      label: "defsync",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "(defsync ${1:name} ${2:value})$0"
    },
    {
      label: "defmacro",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "(defmacro ${1:name} (${2:args})\n  ${3:body})$0"
    },
    {
      label: "defenum",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "(defenum ${1:EnumName} ${2:case1} ${3:case2})$0"
    }
  ];
  completions.push(...baseSnippets);
  
  const fnSnippets: CompletionItem[] = [
    {
      label: "fn (typed)",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "(fn (${1:x}: ${2:Type} ${3:y}: ${4:Type}) (-> ${5:ReturnType})\n  ${6:body})$0"
    },
    {
      label: "fn (dynamic)",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "(fn (${1:x} ${2:y})\n  ${3:body})$0"
    },
    {
      label: "fx (typed)",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "(fx (${1:x}: ${2:Type} ${3:y}: ${4:Type}) (-> ${5:ReturnType})\n  ${6:body})$0"
    },
    {
      label: "fx (dynamic)",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "(fx (${1:x} ${2:y})\n  ${3:body})$0"
    },
    {
      label: "defn (typed)",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "(defn ${1:name} (${2:x}: ${3:Type} ${4:y}: ${5:Type}) (-> ${6:ReturnType})\n  ${7:body})$0"
    },
    {
      label: "defn (dynamic)",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "(defn ${1:name} (${2:x} ${3:y})\n  ${4:body})$0"
    },
    {
      label: "defx (typed)",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "(defx ${1:name} (${2:x}: ${3:Type} ${4:y}: ${5:Type}) (-> ${6:ReturnType})\n  ${7:body})$0"
    },
    {
      label: "defx (dynamic)",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "(defx ${1:name} (${2:x} ${3:y})\n  ${4:body})$0"
    }
  ];
  completions.push(...fnSnippets);
  
  // Top-level symbols for function calls or variables.
  const st = symbolTables.get(doc.uri);
  if (st) {
    for (const [symName, info] of st.entries()) {
      const s = functionSignatures.get(symName);
      if (s) {
        const typed = s.params.some(p => p.type !== undefined);
        let snippet = "(" + symName;
        let i = 1;
        if (typed) {
          for (const p of s.params) {
            snippet += " " + p.name + ": ${" + i + ":" + (p.type || "Any") + "}";
            i++;
          }
        } else {
          for (const p of s.params) {
            snippet += " ${" + i + ":" + p.name + "}";
            i++;
          }
        }
        snippet += ")$0";
        completions.push({
          label: symName,
          kind: CompletionItemKind.Function,
          insertTextFormat: InsertTextFormat.Snippet,
          insertText: snippet
        });
      } else {
        completions.push({
          label: symName,
          kind: CompletionItemKind.Variable,
          insertText: symName
        });
      }
    }
    // Also suggest enum names
    for (const [enm, einfo] of enumTable.entries()) {
      completions.push({
        label: enm,
        kind: CompletionItemKind.Class,
        insertText: enm
      });
    }
  }
  return completions;
});

connection.onCompletionResolve(item => item);

/* ----------------------------------------------------------------------
   8. Hover, DocumentSymbol, Definition, References, Rename
----------------------------------------------------------------------*/
connection.onHover(params => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return { contents: "HQL Language Server" };
  const rng = getWordRangeAtPosition(doc, params.position);
  if (!rng) return { contents: "HQL Language Server" };
  const word = doc.getText(rng);
  const st = symbolTables.get(doc.uri);
  if (!st) return { contents: "HQL Language Server" };
  const info = st.get(word);
  if (!info) return { contents: "HQL Language Server" };
  const sig = functionSignatures.get(word);
  if (sig) {
    let out = `(defn ${word} (`;
    out += sig.params.map(p => p.name + (p.type ? ": " + p.type : "")).join(" ");
    out += ")";
    if (sig.returnType) out += " -> " + sig.returnType;
    out += ")";
    return { contents: { kind: MarkupKind.PlainText, value: out } };
  } else {
    return { contents: { kind: MarkupKind.PlainText, value: `(def ${word} ...)` } };
  }
});

connection.onDocumentSymbol(params => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const st = symbolTables.get(doc.uri);
  if (!st) return [];
  const out: DocumentSymbol[] = [];
  for (const [symName, info] of st.entries()) {
    const start = doc.positionAt(info.defStart);
    const end = doc.positionAt(info.defEnd);
    out.push({
      name: symName,
      kind: SymbolKind.Variable,
      range: { start, end },
      selectionRange: { start, end },
      children: []
    });
  }
  return out;
});

connection.onDefinition(params => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const rng = getWordRangeAtPosition(doc, params.position);
  if (!rng) return null;
  const word = doc.getText(rng);
  const st = symbolTables.get(doc.uri);
  if (!st) return null;
  const info = st.get(word);
  if (!info) return null;
  return Location.create(doc.uri, Range.create(doc.positionAt(info.defStart), doc.positionAt(info.defEnd)));
});

connection.onReferences((params: ReferenceParams) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const rng = getWordRangeAtPosition(doc, params.position);
  if (!rng) return [];
  const word = doc.getText(rng);
  const st = symbolTables.get(doc.uri);
  if (!st) return [];
  const info = st.get(word);
  if (!info) return [];
  const out: Location[] = [];
  out.push(Location.create(doc.uri, Range.create(doc.positionAt(info.defStart), doc.positionAt(info.defEnd))));
  for (const off of info.references) {
    out.push(Location.create(doc.uri, Range.create(doc.positionAt(off), doc.positionAt(off + word.length))));
  }
  return out;
});

connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const rng = getWordRangeAtPosition(doc, params.position);
  if (!rng) return null;
  const oldName = doc.getText(rng);
  const newName = params.newName;
  if (!newName || newName.trim() === "" || newName === oldName) return null;
  const st = symbolTables.get(doc.uri);
  if (!st) return null;
  const info = st.get(oldName);
  if (!info) return null;
  const edits: TextEdit[] = [];
  edits.push({
    range: Range.create(doc.positionAt(info.defStart), doc.positionAt(info.defEnd)),
    newText: newName
  });
  for (const off of info.references) {
    edits.push({
      range: Range.create(doc.positionAt(off), doc.positionAt(off + oldName.length)),
      newText: newName
    });
  }
  const changes: { [uri: string]: TextEdit[] } = {};
  changes[doc.uri] = edits;
  return { changes };
});

/* ----------------------------------------------------------------------
   9. Semantic Tokens
----------------------------------------------------------------------*/
const tokenTypes: string[] = ["variable", "function", "keyword", "string", "number", "macro", "type"];
interface TokenData { line: number; startChar: number; length: number; tokenType: number; tokenMods: number; }

connection.languages.semanticTokens.on((params: SemanticTokensParams): SemanticTokens => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return { data: [] };
  const data = computeSemanticTokens(doc);
  return { data };
});

connection.languages.semanticTokens.onRange((params: SemanticTokensRangeParams): SemanticTokens => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return { data: [] };
  const all = computeSemanticTokens(doc);
  return { data: all };
});

function computeSemanticTokens(doc: TextDocument): number[] {
  const text = doc.getText();
  const tokens: TokenData[] = [];
  const kwIndex = tokenTypes.indexOf("keyword");
  const forms = ["def", "defsync", "defn", "defx", "fn", "fx", "if", "export", "import", "->", "defmacro", "defenum", "let", "loop"];
  for (const f of forms) {
    const re = new RegExp("\\b" + f + "\\b", "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const pos = doc.positionAt(m.index);
      tokens.push({ line: pos.line, startChar: pos.character, length: f.length, tokenType: kwIndex, tokenMods: 0 });
    }
  }
  tokens.sort((a, b) => a.line - b.line || a.startChar - b.startChar);
  return encodeTokens(tokens);
}

function encodeTokens(tokenData: TokenData[]): number[] {
  let prevLine = 0, prevChar = 0;
  const out: number[] = [];
  for (const tk of tokenData) {
    const dLine = tk.line - prevLine;
    const dChar = dLine === 0 ? tk.startChar - prevChar : tk.startChar;
    out.push(dLine, dChar, tk.length, tk.tokenType, tk.tokenMods);
    prevLine = tk.line;
    prevChar = tk.startChar;
  }
  return out;
}

/* ----------------------------------------------------------------------
   10. getWordRangeAtPosition
----------------------------------------------------------------------*/
function getWordRangeAtPosition(doc: TextDocument, pos: Position): Range | null {
  const text = doc.getText();
  const offset = doc.offsetAt(pos);
  if (offset >= text.length) return null;
  let start = offset, end = offset;
  while (start > 0 && /\w/.test(text[start - 1])) start--;
  while (end < text.length && /\w/.test(text[end])) end++;
  if (start === end) return null;
  return Range.create(doc.positionAt(start), doc.positionAt(end));
}

/* ----------------------------------------------------------------------
   Listen
----------------------------------------------------------------------*/
documents.listen(connection);
connection.listen();
