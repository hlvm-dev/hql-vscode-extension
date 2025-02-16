import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from "vscode-languageclient/node";
import { getCurrentExpressionRange, getOutermostExpressionRange } from "./helpers/getCurrentExpressionRange";
import { showInlineEvaluation, showInlineError, clearInlineDecorations } from "./ui";

async function evaluateExpression() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }
  const doc = editor.document;
  const range = editor.selection.isEmpty
    ? getCurrentExpressionRange(doc, editor.selection.active)
    : editor.selection;
  const code = doc.getText(range);
  const resultStr = "=> " + code;

  try {
    showInlineEvaluation(editor, range, resultStr);
  } catch (err: any) {
    showInlineError(editor, range, err.message || String(err));
    vscode.window.showErrorMessage(`Evaluation Error: ${err.message || err}`);
  }
}

async function evaluateOutermostExpression() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }
  const doc = editor.document;
  const range = editor.selection.isEmpty
    ? getOutermostExpressionRange(doc, editor.selection.active)
    : editor.selection;
  const code = doc.getText(range);
  const resultStr = "=> " + code;

  try {
    showInlineEvaluation(editor, range, resultStr);
  } catch (err: any) {
    showInlineError(editor, range, err.message || String(err));
    vscode.window.showErrorMessage(`Evaluation Error: ${err.message || err}`);
  }
}

function cancelEvaluations() {
  for (const ed of vscode.window.visibleTextEditors) {
    clearInlineDecorations(ed.document);
  }
}

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
  const serverModule = context.asAbsolutePath(path.join("out", "lspServer.js"));
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] }
    }
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "hql" }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.hql")
    }
  };
  client = new LanguageClient("hqlLanguageServer", "HQL Language Server", serverOptions, clientOptions);
  client.start();
  context.subscriptions.push(client);

  context.subscriptions.push(vscode.commands.registerCommand("hql.evaluateExpression", evaluateExpression));
  context.subscriptions.push(vscode.commands.registerCommand("hql.evaluateOutermostExpression", evaluateOutermostExpression));
  context.subscriptions.push(vscode.commands.registerCommand("hql.cancelEvaluations", cancelEvaluations));

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      clearInlineDecorations(e.document);
    })
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (client) {
    return client.stop();
  }
  return undefined;
}
