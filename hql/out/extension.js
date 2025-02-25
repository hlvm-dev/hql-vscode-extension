"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const node_1 = require("vscode-languageclient/node");
const getCurrentExpressionRange_1 = require("./helpers/getCurrentExpressionRange");
const ui_1 = require("./ui");
async function evaluateExpression() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor found.");
        return;
    }
    const doc = editor.document;
    const range = editor.selection.isEmpty
        ? (0, getCurrentExpressionRange_1.getCurrentExpressionRange)(doc, editor.selection.active)
        : editor.selection;
    const code = doc.getText(range);
    const resultStr = "=> " + code;
    try {
        (0, ui_1.showInlineEvaluation)(editor, range, resultStr);
    }
    catch (err) {
        (0, ui_1.showInlineError)(editor, range, err.message || String(err));
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
        ? (0, getCurrentExpressionRange_1.getOutermostExpressionRange)(doc, editor.selection.active)
        : editor.selection;
    const code = doc.getText(range);
    const resultStr = "=> " + code;
    try {
        (0, ui_1.showInlineEvaluation)(editor, range, resultStr);
    }
    catch (err) {
        (0, ui_1.showInlineError)(editor, range, err.message || String(err));
        vscode.window.showErrorMessage(`Evaluation Error: ${err.message || err}`);
    }
}
function cancelEvaluations() {
    for (const ed of vscode.window.visibleTextEditors) {
        (0, ui_1.clearInlineDecorations)(ed.document);
    }
}
let client;
function activate(context) {
    const serverModule = context.asAbsolutePath(path.join("out", "lspServer.js"));
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: node_1.TransportKind.ipc,
            options: { execArgv: ["--nolazy", "--inspect=6009"] }
        }
    };
    const clientOptions = {
        documentSelector: [{ scheme: "file", language: "hql" }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher("**/*.hql")
        }
    };
    client = new node_1.LanguageClient("hqlLanguageServer", "HQL Language Server", serverOptions, clientOptions);
    client.start();
    context.subscriptions.push(client);
    context.subscriptions.push(vscode.commands.registerCommand("hql.evaluateExpression", evaluateExpression));
    context.subscriptions.push(vscode.commands.registerCommand("hql.evaluateOutermostExpression", evaluateOutermostExpression));
    context.subscriptions.push(vscode.commands.registerCommand("hql.cancelEvaluations", cancelEvaluations));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
        (0, ui_1.clearInlineDecorations)(e.document);
    }));
}
function deactivate() {
    if (client) {
        return client.stop();
    }
    return undefined;
}
//# sourceMappingURL=extension.js.map