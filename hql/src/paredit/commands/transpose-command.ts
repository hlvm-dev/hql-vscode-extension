// src/paredit/commands/transpose-command.ts
import * as vscode from 'vscode';
import { EditorCommand, createRange } from './editor-commands';
import { findExpressionInfo } from '../utils/expression-finder';

/**
 * Transpose: Swap the current expression with the next expression
 */
export class TransposeCommand extends EditorCommand {
  protected executeCommand(editor: vscode.TextEditor, document: vscode.TextDocument): void {
    const position = editor.selection.active;
    const text = document.getText();
    
    // Find current and next expressions
    const exprInfo = findExpressionInfo(document, position);
    
    // If we found both expressions, swap them
    if (exprInfo && exprInfo.current && exprInfo.next) {
      const currentText = text.substring(exprInfo.current.start, exprInfo.current.end + 1);
      const nextText = text.substring(exprInfo.next.start, exprInfo.next.end + 1);
      const currentStart = exprInfo.current.start;
      const currentEnd = exprInfo.current.end;
      const nextStart = exprInfo.next.start;
      const nextEnd = exprInfo.next.end;
      
      editor.edit(editBuilder => {
        // Replace the next expression with the current one
        editBuilder.replace(
          createRange(document, nextStart, nextEnd),
          currentText
        );
        
        // Replace the current expression with the next one
        editBuilder.replace(
          createRange(document, currentStart, currentEnd),
          nextText
        );
      });
    }
  }
}