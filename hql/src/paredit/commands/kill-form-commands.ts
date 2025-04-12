// src/paredit/commands/kill-form-commands.ts
import * as vscode from 'vscode';
import { EditorCommand, createRange } from './editor-commands';
import { findNextExpression, findPreviousExpression } from '../utils/expression-finder';

/**
 * Kill (delete) the next form
 */
export class KillNextFormCommand extends EditorCommand {
  protected executeCommand(editor: vscode.TextEditor, document: vscode.TextDocument): void {
    const position = editor.selection.active;
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Find the next form starting from the current position
    const nextForm = findNextExpression(text, offset);
    
    if (!nextForm) {
      return;
    }
    
    // Delete the form
    editor.edit(editBuilder => {
      editBuilder.delete(createRange(document, nextForm.start, nextForm.end));
    });
  }
}

/**
 * Kill (delete) the previous form
 */
export class KillPreviousFormCommand extends EditorCommand {
  protected executeCommand(editor: vscode.TextEditor, document: vscode.TextDocument): void {
    const position = editor.selection.active;
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Find the previous form ending before the current position
    const prevForm = findPreviousExpression(text, offset);
    
    if (!prevForm) {
      return;
    }
    
    // Delete the form
    editor.edit(editBuilder => {
      editBuilder.delete(createRange(document, prevForm.start, prevForm.end));
    });
  }
}