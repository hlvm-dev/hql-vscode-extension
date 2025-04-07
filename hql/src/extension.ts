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
let statusBarItem: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
let outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('HQL Language Server');

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

// This method is called when the extension is activated
export function activate(context: vscode.ExtensionContext) {
  logger.info('Activating HQL extension');
  outputChannel.appendLine('HQL extension activated');
  
  // Update the UI
  statusBarItem.show();
  updateServerStatus();
  
  // Create the language client and start the client
  client = startLanguageServer(context);
  
  // Register the paredit functionality
  activateParedit(context);
  
  // Add the language client to the list of disposables
  context.subscriptions.push(client);
  
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
    () => {
      // Only run if we're in an HQL file
      if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'hql') {
        // Check if the suggest widget is visible - if it is, we should let VSCode handle it
        const widgetVisible = vscode.window.activeTextEditor.document.uri.toString().includes('suggest');
        
        if (!widgetVisible) {
          // No suggestion widget, safe to cancel evaluations
          evaluator.cancelAllEvaluations();
        }
      } else {
        evaluator.cancelAllEvaluations();
      }
    }
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

  // Register manual diagnostics command
  context.subscriptions.push(vscode.commands.registerCommand('hql.diagnostics', () => {
    runDiagnostics(context);
  }));

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
  
  // Register format command manually as a fallback
  context.subscriptions.push(
    vscode.commands.registerCommand('hql.formatDocument', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'hql') {
        return;
      }
      
      // Simple HQL formatting - maintain indentation based on parentheses
      const text = editor.document.getText();
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
      
      editor.edit(editBuilder => {
        const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0);
        editBuilder.replace(fullRange, formatted);
      });
    })
  );
  
  // Add a diagnostic command
  context.subscriptions.push(vscode.commands.registerCommand(
    "hql.checkLsp",
    () => {
      outputChannel.show(true); // Force show the output channel
      outputChannel.appendLine("--- HQL Language Server Diagnostics ---");
      
      // Check if server module exists
      const fs = require('fs');
      const serverModule = context.asAbsolutePath(path.join("out", "server", "lspServer.ts"));
      outputChannel.appendLine(`Server module path: ${serverModule}`);
      outputChannel.appendLine(`Server module exists: ${fs.existsSync(serverModule)}`);
      
      // Check output directory contents
      const outDir = context.asAbsolutePath("out");
      outputChannel.appendLine(`Out directory exists: ${fs.existsSync(outDir)}`);
      if (fs.existsSync(outDir)) {
        const files = fs.readdirSync(outDir);
        outputChannel.appendLine(`Files in out directory: ${files.join(', ')}`);
      }
      
      // Check language client status
      outputChannel.appendLine(`Language client created: ${client ? "Yes" : "No"}`);
      if (client) {
        outputChannel.appendLine(`Language client state: ${client.state}`);
        outputChannel.appendLine(`Language client running: ${client.needsStart() ? "No" : "Yes"}`);
      }
      
      // Extension context
      outputChannel.appendLine(`Extension path: ${context.extensionPath}`);
      outputChannel.appendLine(`Extension mode: ${context.extensionMode}`);
      
      // VSCode info
      outputChannel.appendLine(`VSCode version: ${vscode.version}`);
      outputChannel.appendLine(`HQL Extension registered: ${vscode.languages.getLanguages().then(langs => langs.includes('hql'))}`);
      
      vscode.window.showInformationMessage("HQL diagnostic information written to output channel");
    }
  ));
  
  // Notify user that the extension is ready
  ui.showInfo('HQL extension activated with enhanced syntax support');
  logger.info('HQL extension activated successfully');

  // Register commands to explicitly hide autocompletion popups
  context.subscriptions.push(vscode.commands.registerCommand(
    'hql.hideSuggestWidget',
    () => {
      vscode.commands.executeCommand('hideSuggestWidget');
    }
  ));
  
  context.subscriptions.push(vscode.commands.registerCommand(
    'hql.hideInlineSuggest',
    () => {
      vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
    }
  ));

  // Update UI when client is ready - using the promise returned by start() 
  client.start().then(() => {
    ui.updateLspStatus("Running");
  }).catch((error: Error) => {
    logger.error(`Language server failed to start: ${error.message}`);
    ui.updateLspStatus("Failed", false);
  });
}

// This method starts the language server
function startLanguageServer(context: vscode.ExtensionContext): LanguageClient {
  // The server is implemented in Node
  const serverModule = context.asAbsolutePath(path.join('out', 'server', 'lspServer.ts'));
  
  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] }
    }
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for HQL documents
    documentSelector: [{ scheme: 'file', language: 'hql' }],
    synchronize: {
      // Notify the server about file changes to .hql files contained in the workspace
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.hql')
    },
    outputChannel: outputChannel,
    revealOutputChannelOn: 4 // Only on error
  };

  // Create the language client and start it
  const client = new LanguageClient(
    'hqlLanguageServer',
    'HQL Language Server',
    serverOptions,
    clientOptions
  );
  
  // Start the client
  client.start();
  
  return client;
}

// This method is called when the extension is deactivated
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

/**
 * Simple diagnostic function to help users troubleshoot
 */
function runDiagnostics(context: vscode.ExtensionContext): void {
  const diagnosticOutput = vscode.window.createOutputChannel('HQL Diagnostics');
  diagnosticOutput.clear();
  diagnosticOutput.show();
  
  diagnosticOutput.appendLine('HQL Extension Diagnostics');
  diagnosticOutput.appendLine('==========================');
  
  // Check if VSCode recognizes HQL language
  vscode.languages.getLanguages().then(langs => {
    if (langs.includes('hql')) {
      diagnosticOutput.appendLine('✅ HQL language is registered');
    } else {
      diagnosticOutput.appendLine('❌ HQL language is NOT registered!');
    }
    
    // Check for the server file
    const serverPath = context.asAbsolutePath(path.join("out", "server", "lspServer.ts"));
    const fs = require('fs');
    if (fs.existsSync(serverPath)) {
      diagnosticOutput.appendLine(`✅ Server module found at: ${serverPath}`);
    } else {
      diagnosticOutput.appendLine(`❌ Server module NOT found at: ${serverPath}`);
    }
    
    // Check grammar file
    const grammarPath = context.asAbsolutePath(path.join("syntaxes", "hql.tmLanguage.json"));
    if (fs.existsSync(grammarPath)) {
      diagnosticOutput.appendLine(`✅ Grammar file found at: ${grammarPath}`);
    } else {
      diagnosticOutput.appendLine(`❌ Grammar file NOT found at: ${grammarPath}`);
    }
    
    diagnosticOutput.appendLine('\nTroubleshooting suggestions:');
    diagnosticOutput.appendLine('- Try reloading VS Code (Developer: Reload Window)');
    diagnosticOutput.appendLine('- Check VS Code logs for errors (Help > Toggle Developer Tools)');
    diagnosticOutput.appendLine('- Ensure you ran "npm run compile" before launching the extension');
    
    vscode.window.showInformationMessage('HQL diagnostics complete. See output for details.');
  });
}