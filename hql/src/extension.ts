import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from "vscode-languageclient/node";
import { ui } from "./ui-manager";
import { config } from "./config-manager";
import { evaluator } from "./evaluation-manager";
import { startServer, stopServer, restartServer, isServerRunning } from './server-manager';
import { Logger } from './logger';
import { activateParedit } from './paredit';

// Create a logger instance
const logger = new Logger(true);

let client: LanguageClient;
let statusBarItem: vscode.StatusBarItem;

/**
 * Update the REPL server status in the status bar
 */
async function updateServerStatus() {
  if (!statusBarItem) {
    return;
  }

  const running = await isServerRunning();
  if (running) {
    statusBarItem.text = "$(check) HQL REPL Server";
    statusBarItem.tooltip = "HQL REPL Server is running";
    statusBarItem.command = "hql.stopREPLServer";
  } else {
    statusBarItem.text = "$(stop) HQL REPL Server";
    statusBarItem.tooltip = "HQL REPL Server is not running";
    statusBarItem.command = "hql.startREPLServer";
  }
  statusBarItem.show();
}

export function activate(context: vscode.ExtensionContext) {
  logger.info("Activating HQL extension");
  
  // Set up the status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(statusBarItem);
  updateServerStatus();
  
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
    },
    outputChannelName: "HQL Language Server"
  };
  client = new LanguageClient("hqlLanguageServer", "HQL Language Server", serverOptions, clientOptions);
  
  // Start the client, which also starts the server
  context.subscriptions.push({ dispose: () => client.stop() });
  client.start();
  logger.info("HQL Language Server started");

  // Register commands for evaluation
  context.subscriptions.push(vscode.commands.registerCommand(
    "hql.evaluateExpression", 
    () => evaluator.evaluateExpression()
  ));
  
  context.subscriptions.push(vscode.commands.registerCommand(
    "hql.evaluateOutermostExpression", 
    () => evaluator.evaluateOutermostExpression()
  ));
  
  context.subscriptions.push(vscode.commands.registerCommand(
    "hql.cancelEvaluations", 
    () => evaluator.cancelAllEvaluations()
  ));

  // Register REPL server commands
  context.subscriptions.push(vscode.commands.registerCommand('hql.startREPLServer', async () => {
    await startServer();
    updateServerStatus();
  }));
  
  context.subscriptions.push(vscode.commands.registerCommand('hql.stopREPLServer', async () => {
    await stopServer();
    updateServerStatus();
  }));
  
  context.subscriptions.push(vscode.commands.registerCommand('hql.restartREPLServer', async () => {
    await restartServer();
    updateServerStatus();
  }));

  // Register diagnostic collection
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('hql');
  context.subscriptions.push(diagnosticCollection);

  // Update for text changes to clear decorations
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.languageId === 'hql') {
        ui.clearDecorations(e.document);
        
        // Reapply rainbow parentheses if enabled
        if (config.isPareEditEnabled() && vscode.window.activeTextEditor?.document === e.document) {
          ui.applyRainbowParentheses(vscode.window.activeTextEditor);
        }
      }
    })
  );
  
  // Apply rainbow parentheses when changing active editor
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && editor.document.languageId === 'hql') {
        if (config.isPareEditEnabled()) {
          ui.applyRainbowParentheses(editor);
        }
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
          ui.showInfo(`Added ${missingCloseCount} missing closing parenthese${missingCloseCount === 1 ? '' : 's'}`);
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
          ui.showInfo(`Removed ${extraCloseCount} extra closing parenthese${extraCloseCount === 1 ? '' : 's'}`);
        } else {
          ui.showInfo('Parentheses are already balanced.');
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
  
  // Register code actions provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider('hql', {
      provideCodeActions(document, range, context, token) {
        const codeActions: vscode.CodeAction[] = [];
        
        // Handle adding missing parentheses
        if (context.diagnostics.some(d => d.message.includes("Unmatched") || d.message.includes("parenthes"))) {
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
  
  // Activate paredit functionality
  activateParedit(context);
  
  // Optional: Auto-start the server if configured
  if (config.shouldAutoStartServer()) {
    startServer()
      .then(() => updateServerStatus())
      .catch(err => {
        ui.showError(`Failed to auto-start HQL server: ${err}`);
      });
  }
  
  // Notify user that the extension is ready
  ui.showInfo('HQL extension activated with enhanced syntax support');
  logger.info('HQL extension activated successfully');
}

export function deactivate(): Thenable<void> | undefined {
  logger.info('Deactivating HQL extension');
  
  // Clear any evaluations
  evaluator.cancelAllEvaluations();
  
  // Stop the server
  stopServer().catch(err => {
    logger.error(`Error stopping server: ${err}`);
  });
  
  if (client) {
    return client.stop();
  }
  return undefined;
}