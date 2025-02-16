// src/extension.ts

import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from "vscode-languageclient/node";
import {
  getCurrentExpressionRange,
  getOutermostExpressionRange
} from "./helpers/getCurrentExpressionRange";

let client: LanguageClient;

async function evaluateCurrentExpression() {
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
  if (!code.trim()) {
    vscode.window.showErrorMessage("No code to evaluate");
    return;
  }
  // Instead of calling fakeEvaluate, we directly show the result.
  vscode.window.showInformationMessage(`Evaluated => ${code}`);
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
  if (!code.trim()) {
    vscode.window.showErrorMessage("No code to evaluate");
    return;
  }
  // Directly display the "evaluated" code.
  vscode.window.showInformationMessage(`Evaluated => ${code}`);
}

async function cancelEvaluations() {
  vscode.window.showInformationMessage("Evaluations canceled");
}

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

  client = new LanguageClient(
    "hqlLanguageServer",
    "HQL Language Server",
    serverOptions,
    clientOptions
  );
  client.start();
  context.subscriptions.push(client);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "hql.evaluateExpression",
      evaluateCurrentExpression
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "hql.evaluateOutermostExpression",
      evaluateOutermostExpression
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("hql.cancelEvaluations", cancelEvaluations)
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      // Clear inline decorations if needed.
    })
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (client) {
    return client.stop();
  }
  return undefined;
}
