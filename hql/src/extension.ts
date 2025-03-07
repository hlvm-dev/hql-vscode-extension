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
import { fetchEvaluation } from "./client";
import { startServer, stopServer, restartServer, isServerRunning } from './server-manager';

// Track active evaluation requests to support cancellation
let activeEvaluations: Map<string, AbortController> = new Map();

/**
 * Evaluate the current expression under cursor
 */
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
  if (!code.trim()) {
    vscode.window.showInformationMessage("No expression found to evaluate.");
    return;
  }

  // Show a "busy" indicator immediately
  const busyDecoration = showInlineEvaluation(editor, range, "Evaluating...");
  
  // Create an AbortController for this request
  const abortController = new AbortController();
  const requestId = `${doc.uri.toString()}:${range.start.line}:${range.start.character}`;
  activeEvaluations.set(requestId, abortController);
  
  try {
    const result = await fetchEvaluation(code, undefined, abortController.signal);
    if (!activeEvaluations.has(requestId)) {
      // This request was canceled, don't show the result
      return;
    }
    
    showInlineEvaluation(editor, range, result);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      // Request was canceled, don't show error
      return;
    }
    
    showInlineError(editor, range, err.message || String(err));
    vscode.window.showErrorMessage(`Evaluation Error: ${err.message || err}`);
  } finally {
    activeEvaluations.delete(requestId);
  }
}

/**
 * Evaluate the outermost expression containing the cursor
 */
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
    vscode.window.showInformationMessage("No expression found to evaluate.");
    return;
  }

  // Show a "busy" indicator immediately
  const busyDecoration = showInlineEvaluation(editor, range, "Evaluating...");
  
  // Create an AbortController for this request
  const abortController = new AbortController();
  const requestId = `${doc.uri.toString()}:${range.start.line}:${range.start.character}`;
  activeEvaluations.set(requestId, abortController);
  
  try {
    const result = await fetchEvaluation(code, undefined, abortController.signal);
    if (!activeEvaluations.has(requestId)) {
      // This request was canceled, don't show the result
      return;
    }
    
    showInlineEvaluation(editor, range, result);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      // Request was canceled, don't show error
      return;
    }
    
    showInlineError(editor, range, err.message || String(err));
    vscode.window.showErrorMessage(`Evaluation Error: ${err.message || err}`);
  } finally {
    activeEvaluations.delete(requestId);
  }
}

/**
 * Cancel all active evaluations
 */
function cancelEvaluations() {
  // Cancel all active requests
  for (const [id, controller] of activeEvaluations.entries()) {
    controller.abort();
    activeEvaluations.delete(id);
  }
  
  // Clear UI decorations
  for (const ed of vscode.window.visibleTextEditors) {
    clearInlineDecorations(ed.document);
  }
  
  vscode.window.showInformationMessage("All evaluations canceled.");
}

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
  // Set up the LSP server
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

  // Register commands
  context.subscriptions.push(vscode.commands.registerCommand("hql.evaluateExpression", evaluateExpression));
  context.subscriptions.push(vscode.commands.registerCommand("hql.evaluateOutermostExpression", evaluateOutermostExpression));
  context.subscriptions.push(vscode.commands.registerCommand("hql.cancelEvaluations", cancelEvaluations));

  context.subscriptions.push(vscode.commands.registerCommand('hql.startREPLServer', startServer));
  context.subscriptions.push(vscode.commands.registerCommand('hql.stopREPLServer', stopServer));
  context.subscriptions.push(vscode.commands.registerCommand('hql.restartREPLServer', restartServer));


  // Register diagnostic collection
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('hql');
  context.subscriptions.push(diagnosticCollection);

  // Update the client.ts file to support cancellation
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      clearInlineDecorations(e.document);
    })
  );
  
  // Register code actions provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider('hql', {
      provideCodeActions(document, range, context, token) {
        const codeActions: vscode.CodeAction[] = [];
        
        // Handle adding missing parentheses
        if (context.diagnostics.some(d => d.message.includes("Unmatched"))) {
          const fixAction = new vscode.CodeAction("Fix unmatched parentheses", vscode.CodeActionKind.QuickFix);
          fixAction.command = {
            title: "Fix parentheses",
            command: "hql.fixParentheses",
            arguments: [document.uri, range]
          };
          codeActions.push(fixAction);
        }
        
        // Handle extracting expressions
        const selectedText = document.getText(range);
        if (selectedText && !selectedText.startsWith("(") && !selectedText.endsWith(")")) {
          const extractAction = new vscode.CodeAction("Extract to variable", vscode.CodeActionKind.RefactorExtract);
          extractAction.command = {
            title: "Extract to variable",
            command: "hql.extractVariable",
            arguments: [document.uri, range, selectedText]
          };
          codeActions.push(extractAction);
        }
        
        return codeActions;
      }
    })
  );
  
  // Register extract variable command
  context.subscriptions.push(
    vscode.commands.registerCommand("hql.extractVariable", async (uri: vscode.Uri, range: vscode.Range, text: string) => {
      const varName = await vscode.window.showInputBox({
        prompt: "Enter variable name",
        placeHolder: "my-var"
      });
      
      if (!varName) return;
      
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.toString() !== uri.toString()) return;
      
      // Insert a let binding at the start of the current form
      const document = editor.document;
      const line = document.lineAt(range.start.line);
      const indent = line.text.substring(0, line.firstNonWhitespaceCharacterIndex);
      
      // Find the start of the containing form
      let formStart = range.start;
      for (let lineNum = range.start.line; lineNum >= 0; lineNum--) {
        const currLine = document.lineAt(lineNum).text;
        const openParenIndex = currLine.indexOf("(");
        if (openParenIndex >= 0) {
          formStart = new vscode.Position(lineNum, openParenIndex);
          break;
        }
      }
      
      // Perform the edit
      await editor.edit(editBuilder => {
        // Replace the selected text with the variable name
        editBuilder.replace(range, varName);
        
        // Insert the let binding
        const letBinding = `(let [\n${indent}  ${varName} ${text}\n${indent}]\n${indent}  `;
        editBuilder.insert(formStart, letBinding);
        
        // Insert closing parenthesis at the end of the form
        const lastLine = document.lineAt(document.lineCount - 1);
        editBuilder.insert(new vscode.Position(lastLine.lineNumber, lastLine.text.length), "\n)");
      });
    })
  );
  
  // Register fix parentheses command
  context.subscriptions.push(
    vscode.commands.registerCommand("hql.fixParentheses", (uri: vscode.Uri, range: vscode.Range) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.toString() !== uri.toString()) return;
      
      const document = editor.document;
      const text = document.getText();
      
      // Count open and closing parentheses
      let openCount = 0;
      let closeCount = 0;
      
      for (const char of text) {
        if (char === '(') openCount++;
        else if (char === ')') closeCount++;
      }
      
      editor.edit(editBuilder => {
        if (openCount > closeCount) {
          // Add missing closing parentheses
          const missingCloseCount = openCount - closeCount;
          editBuilder.insert(document.positionAt(text.length), ')'.repeat(missingCloseCount));
        } else if (closeCount > openCount) {
          // Remove extra closing parentheses
          const extraCloseCount = closeCount - openCount;
          let lastPos = text.length - 1;
          for (let i = 0; i < extraCloseCount; i++) {
            while (lastPos >= 0 && text[lastPos] !== ')') {
              lastPos--;
            }
            if (lastPos >= 0) {
              editBuilder.delete(new vscode.Range(
                document.positionAt(lastPos),
                document.positionAt(lastPos + 1)
              ));
              lastPos--;
            }
          }
        }
      });
    })
  );
  
  // Set up document formatting provider 
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider('hql', {
      provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
        const text = document.getText();
        
        // Simple HQL formatting - maintain indentation based on parentheses
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
          
          // Handle parentheses
          const openCount = (line.match(/\(/g) || []).length;
          const closeCount = (line.match(/\)/g) || []).length;
          
          // Calculate the right indent for this line
          const currIndent = ' '.repeat(indent * 2);
          formattedLines.push(currIndent + line);
          
          // Adjust indent for the next line
          indent += openCount;
          indent -= closeCount;
          
          // Keep indent non-negative
          indent = Math.max(0, indent);
        }
        
        // Create a TextEdit for the whole document
        const formatted = formattedLines.join('\n');
        return [vscode.TextEdit.replace(
          new vscode.Range(0, 0, document.lineCount, 0),
          formatted
        )];
      }
    })
  );
  
  // Notify user that the extension is ready
  vscode.window.showInformationMessage('HQL extension activated with enhanced syntax support');

  // Optional: Auto-start the server if configured
  const autoStart = vscode.workspace.getConfiguration('hql').get('server.autoStart', false);
  if (autoStart) {
    startServer().catch(err => {
      vscode.window.showErrorMessage(`Failed to auto-start HQL server: ${err}`);
    });
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (client) {
    return client.stop();
  }
  return undefined;
}