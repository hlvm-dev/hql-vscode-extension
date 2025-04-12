// src/paredit/commands/editor-commands.ts
import * as vscode from 'vscode';

/**
 * Base class for all editor commands
 */
export abstract class EditorCommand {
  /**
   * Execute the command
   */
  public execute(): void {
    const editor = this.getEditor();
    if (!editor) {
      return;
    }
    
    const document = editor.document;
    if (document.languageId !== 'hql') {
      return;
    }
    
    this.executeCommand(editor, document);
  }
  
  /**
   * Get the active text editor
   */
  protected getEditor(): vscode.TextEditor | undefined {
    return vscode.window.activeTextEditor;
  }
  
  /**
   * Execute the specific command implementation
   */
  protected abstract executeCommand(editor: vscode.TextEditor, document: vscode.TextDocument): void;
}

/**
 * Create a Range from start and end offsets
 */
export function createRange(document: vscode.TextDocument, start: number, end: number): vscode.Range {
  return new vscode.Range(document.positionAt(start), document.positionAt(end + 1));
}