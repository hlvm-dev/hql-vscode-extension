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
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";

import { HQLValue, HQLSymbol, HQLList } from "./type.ts";

import { parse } from "./parser.ts";

/* ----------------------------------------------------------------------
   4. Symbol Table, Enums, Function Signatures
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
   5. Param Info Extraction for typed/untyped
----------------------------------------------------------------------*/
function extractParamInfos(paramNode: HQLValue): ParamInfo[] {
  if (!paramNode || paramNode.type !== "list") return [];
  const tokens = paramNode.value;
  const out: ParamInfo[] = [];
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
   6. AST Walker to Build Symbol Table, Enums, Signatures
----------------------------------------------------------------------*/
function walkAST(ast: HQLValue[], text: string, uri: string): void {
  functionSignatures.clear();
  enumTable.clear();

  const st = new Map<string, SymbolInfo>();
  symbolTables.set(uri, st);
  localScopes.set(uri, []);

  function pushScope(start: number, end: number, bindings: string[]) {
    localScopes.get(uri)!.push({ start, end, bindings });
  }

  function visit(node: HQLValue) {
    if (!node || node.type !== "list") return;
    const items = node.value;
    if (items.length >= 2) {
      const head = items[0];
      if (head.type === "symbol") {
        const hname = head.name;
        // def, defsync, defn, defx => top-level symbol
        if (["def", "defsync", "defn", "defx"].includes(hname)) {
          const symVal = items[1];
          if (symVal && symVal.type === "symbol") {
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
        // defenum => store enum
        if (hname === "defenum" && items.length >= 2) {
          const enumSym = items[1];
          if (enumSym.type === "symbol") {
            const enumName = enumSym.name;
            const pattern = "(defenum " + enumName;
            const idx = text.indexOf(pattern);
            let defStart = 0, defEnd = 0;
            if (idx >= 0) {
              defStart = idx + "(defenum ".length;
              defEnd = defStart + enumName.length;
            }
            st.set(enumName, { name: enumName, defStart, defEnd, references: [] });
            const cases = items.slice(2).flatMap((n: HQLValue) =>
              n.type === "symbol" ? [n.name] : []
            );            
            enumTable.set(enumName, { name: enumName, cases });
          }
        }
      }
    }
    // If it's an anonymous fn => local scope
    if (node.value.length >= 2) {
      const h2 = node.value[0];
      if (h2.type === "symbol" && (h2.name === "fn" || h2.name === "fx")) {
        if (node.start !== undefined && node.end !== undefined) {
          const paramInfos = extractParamInfos(node.value[1]);
          pushScope(node.start, node.end, paramInfos.map(p => p.name));
        }
      }
      // let => local scope
      if (h2.type === "symbol" && h2.name === "let") {
        const bindingNode = node.value[1];
        if (bindingNode && bindingNode.type === "list") {
          const letBindings: string[] = [];
          for (const b of bindingNode.value) {
            if (b.type === "list" && b.value.length >= 1) {
              const nm = b.value[0];
              if (nm.type === "symbol") {
                letBindings.push(nm.name);
              }
            }
          }
          if (node.start !== undefined && node.end !== undefined) {
            pushScope(node.start, node.end, letBindings);
          }
        }
      }
    }
    // Recurse
    for (const c of node.value) {
      if (c.type === "list") {
        visit(c);
      }
    }
  }

  for (const form of ast) {
    if (form.type === "list") {
      visit(form);
    }
  }

  // naive reference search
  for (const [symName, info] of st.entries()) {
    const re = new RegExp("\\b" + symName + "\\b", "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const offset = m.index;
      if (offset < info.defStart || offset > info.defEnd) {
        info.references.push(offset);
      }
    }
  }

  symbolTables.set(uri, st);
}

/* ----------------------------------------------------------------------
   7. findActiveArgument for typed calls + partial labeled calls
----------------------------------------------------------------------*/
interface ArgContext { fnName: string; paramIndex: number; paramLabel?: string; }

function insideNode(node: HQLValue, offset: number): boolean {
  if (!node.start || !node.end) return false;
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
        if (c === node) {
          best = n;
          return;
        }
        dfs(c);
      }
    }
  }
  for (const top of ast) {
    dfs(top);
  }
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

function findActiveArgument(ast: HQLValue[], offset: number): ArgContext | null {
  let bestNode: HQLValue | null = null;
  for (const top of ast) {
    const found = findNodeAtOffset(top, offset);
    if (found) bestNode = found;
  }
  if (!bestNode) return null;
  let callList: HQLList | null = bestNode.type === "list" ? bestNode : findClosestList(ast, bestNode);
  if (!callList || callList.value.length === 0) return null;
  const head = callList.value[0];
  if (head.type !== "symbol") return null;
  const fnName = head.name;

  let labeled = false;
  for (const arg of callList.value.slice(1)) {
    if (arg.type === "symbol" && arg.name.endsWith(":")) {
      labeled = true;
      break;
    }
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
      if (insideNode(arg, offset)) {
        paramIndex = i - 1;
        break;
      }
    }
    if (paramIndex < 0) {
      paramIndex = callList.value.length - 1;
    }
  }
  if (paramIndex < 0) return null;
  return { fnName, paramIndex, paramLabel };
}

/* ----------------------------------------------------------------------
   8. LSP SETUP
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
  validateTextDocument(doc);
  try {
    const text = doc.getText();
    const ast = parse(text);
    walkAST(ast, text, doc.uri);
  } catch (err) {
    connection.console.error("Parse error: " + String(err));
  }
});

/* ----------------------------------------------------------------------
   9. Validation for Parentheses + "No expression"
----------------------------------------------------------------------*/
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
  const forms = parse(text);
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
   10. COMPLETIONS (Context-Aware)
----------------------------------------------------------------------*/
connection.onCompletion(params => {
  try {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];
    const text = doc.getText();
    const offset = doc.offsetAt(params.position);
    const textBefore = text.substring(0, offset);

    // 1) If partial definition => show snippet only
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

    // 2) If inside a function call with typed enum param => show only enum completions
    const ast = parse(text);
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
              insertText: c // inserts only the case name
            });
          }
          return out;
        }
      }
    }

    // 3) Otherwise => normal completions
    const completions: CompletionItem[] = [];

    // Basic "def", "defsync", "defmacro", "defenum" snippet
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

    // typed/dynamic function snippet expansions
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

    // top-level symbols for function calls or variables
    const st = symbolTables.get(doc.uri);
    if (st) {
      for (const [symName, info] of st.entries()) {
        const sig = functionSignatures.get(symName);
        if (sig) {
          const typed = sig.params.some(p => p.type !== undefined);
          let snippet = "(" + symName;
          let i = 1;
          if (typed) {
            // labeled call
            for (const p of sig.params) {
              snippet += " " + p.name + ": ${" + i + ":" + (p.type || "Any") + "}";
              i++;
            }
          } else {
            // positional
            for (const p of sig.params) {
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
      // also suggest enum names themselves
      for (const [enm, einfo] of enumTable.entries()) {
        completions.push({
          label: enm,
          kind: CompletionItemKind.Class,
          insertText: enm
        });
      }
    }

    return completions;
  } catch (err) {
    connection.console.error("onCompletion error: " + err);
    return [];
  }
});

connection.onCompletionResolve(item => item);

/* ----------------------------------------------------------------------
   11. HOVER
----------------------------------------------------------------------*/
connection.onHover(params => {
  try {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return { contents: "HQL Language Server" };
    const rng = getWordRangeAtPosition(doc, params.position);
    if (!rng) return { contents: "HQL Language Server" };
    const word = doc.getText(rng);
    const st = symbolTables.get(doc.uri);
    if (!st) return { contents: "HQL Language Server" };
    const info = st.get(word);
    if (!info) return { contents: "HQL Language Server" };

    // If there's a function signature, show it
    const sig = functionSignatures.get(word);
    if (sig) {
      let out = `(defn ${word} (`;
      out += sig.params.map(p => p.name + (p.type ? ": " + p.type : "")).join(" ");
      out += ")";
      if (sig.returnType) out += " -> " + sig.returnType;
      out += ")";
      return { contents: { kind: MarkupKind.PlainText, value: out } };
    }
    // else show a def
    return { contents: { kind: MarkupKind.PlainText, value: `(def ${word} ...)` } };
  } catch (err) {
    connection.console.error("onHover error: " + err);
    return { contents: "HQL Language Server" };
  }
});

/* ----------------------------------------------------------------------
   12. Document Symbols
----------------------------------------------------------------------*/
connection.onDocumentSymbol(params => {
  try {
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
  } catch (err) {
    connection.console.error("onDocumentSymbol error: " + err);
    return [];
  }
});

/* ----------------------------------------------------------------------
   13. Definition
----------------------------------------------------------------------*/
connection.onDefinition(params => {
  try {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;
    const rng = getWordRangeAtPosition(doc, params.position);
    if (!rng) return null;
    const word = doc.getText(rng);
    const st = symbolTables.get(doc.uri);
    if (!st) return null;
    const info = st.get(word);
    if (!info) return null;
    return Location.create(
      doc.uri,
      Range.create(doc.positionAt(info.defStart), doc.positionAt(info.defEnd))
    );
  } catch (err) {
    connection.console.error("onDefinition error: " + err);
    return null;
  }
});

/* ----------------------------------------------------------------------
   14. References
----------------------------------------------------------------------*/
connection.onReferences((params: ReferenceParams) => {
  try {
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
    // definition
    out.push(Location.create(
      doc.uri,
      Range.create(doc.positionAt(info.defStart), doc.positionAt(info.defEnd))
    ));
    // references
    for (const off of info.references) {
      out.push(Location.create(
        doc.uri,
        Range.create(doc.positionAt(off), doc.positionAt(off + word.length))
      ));
    }
    return out;
  } catch (err) {
    connection.console.error("onReferences error: " + err);
    return [];
  }
});

/* ----------------------------------------------------------------------
   15. Rename
----------------------------------------------------------------------*/
connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
  try {
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
    // definition
    edits.push({
      range: Range.create(doc.positionAt(info.defStart), doc.positionAt(info.defEnd)),
      newText: newName
    });
    // references
    for (const off of info.references) {
      edits.push({
        range: Range.create(doc.positionAt(off), doc.positionAt(off + oldName.length)),
        newText: newName
      });
    }
    const changes: { [uri: string]: TextEdit[] } = {};
    changes[doc.uri] = edits;
    return { changes };
  } catch (err) {
    connection.console.error("onRenameRequest error: " + err);
    return null;
  }
});

/* ----------------------------------------------------------------------
   16. Semantic Tokens
----------------------------------------------------------------------*/
const tokenTypes: string[] = ["variable", "function", "keyword", "string", "number", "macro", "type"];
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
    connection.console.error("semanticTokens on: " + err);
    return { data: [] };
  }
});

connection.languages.semanticTokens.onRange((params: SemanticTokensRangeParams): SemanticTokens => {
  try {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return { data: [] };
    const all = computeSemanticTokens(doc);
    // we won't filter by range for simplicity
    return { data: all };
  } catch (err) {
    connection.console.error("semanticTokens onRange: " + err);
    return { data: [] };
  }
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
      tokens.push({
        line: pos.line,
        startChar: pos.character,
        length: f.length,
        tokenType: kwIndex,
        tokenMods: 0
      });
    }
  }
  tokens.sort((a, b) => (a.line - b.line) || (a.startChar - b.startChar));
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
   17. getWordRangeAtPosition
----------------------------------------------------------------------*/
function getWordRangeAtPosition(doc: TextDocument, pos: Position): Range | null {
  const text = doc.getText();
  const offset = doc.offsetAt(pos);
  if (offset >= text.length) return null;
  let start = offset;
  let end = offset;
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
