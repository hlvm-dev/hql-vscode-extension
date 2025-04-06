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
  
  // Initialize UI manager
  ui.initialize(context);
  
  // Set up the status bar item for REPL server
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(statusBarItem);
  updateServerStatus();
  
  // Set up the LSP server
  const serverModule = context.asAbsolutePath(path.join("out", "lspServer.js"));
  
  // Check if server module exists
  const fs = require('fs');
  if (!fs.existsSync(serverModule)) {
    logger.error(`Server module not found at: ${serverModule}`);
    vscode.window.showErrorMessage(`HQL Language Server module not found: ${serverModule}`);
  } else {
    logger.info(`Server module found at: ${serverModule}`);
  }
  
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
    outputChannelName: "HQL Language Server",
    revealOutputChannelOn: 4, // Show on error
    middleware: {
      // Add middleware for better completion handling
      provideCompletionItem: (document, position, context, token, next) => {
        // Log completion requests to aid debugging
        logger.debug(`Completion requested at ${position.line}:${position.character}`);
        return next(document, position, context, token);
      }
    }
  };
  
  try {
    client = new LanguageClient("hqlLanguageServer", "HQL Language Server", serverOptions, clientOptions);
    
    // Start the client, which also starts the server
    context.subscriptions.push({ dispose: () => client.stop() });
    
    // Update UI status to starting
    ui.updateLspStatus("Starting");
    
    // Start client with promise handling
    const startPromise = client.start();
    startPromise.then(() => {
      logger.info("Language server started successfully!");
      ui.updateLspStatus("Running");
      vscode.window.showInformationMessage("HQL Language Server started successfully");
    }).catch(error => {
      logger.error(`Failed to start language server: ${error}`);
      ui.updateLspStatus("Failed", false);
      vscode.window.showErrorMessage(`HQL Language Server failed to start: ${error}`);
    });
  } catch (error) {
    logger.error(`Error setting up language client: ${error}`);
    ui.updateLspStatus("Setup Error", false);
    vscode.window.showErrorMessage(`HQL Language Server setup error: ${error}`);
  }
  
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
  
  // Activate paredit functionality
  activateParedit(context);
  
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
    const serverPath = context.asAbsolutePath(path.join("out", "lspServer.js"));
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