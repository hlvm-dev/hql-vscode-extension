// src/paredit/commands/slurping-commands.ts
import * as vscode from 'vscode';
import { EditorCommand, createRange } from './editor-commands';
import { 
  findExpressionInfo, 
  findNextExpression, 
  findPreviousExpression,
  ExpressionBoundary
} from '../utils/expression-finder';
import { isWhitespace } from '../utils/delimiter-utils';

/**
 * Slurp forward: Extend the closing delimiter to include the next expression
 */
export class SlurpForwardCommand extends EditorCommand {
  protected executeCommand(editor: vscode.TextEditor, document: vscode.TextDocument): void {
    const position = editor.selection.active;
    const text = document.getText();
    
    // Find the current expression
    const exprInfo = findExpressionInfo(document, position);
    
    if (!exprInfo || !exprInfo.current || !exprInfo.next) {
      return;
    }
    
    const closePos = document.positionAt(exprInfo.current.end);
    const newClosePos = document.positionAt(exprInfo.next.end + 1);
    
    editor.edit(editBuilder => {
      // Delete the original closing delimiter
      editBuilder.delete(new vscode.Range(closePos, closePos.translate(0, 1)));
      // Insert the closing delimiter after the next expression
      const currentEnd = exprInfo.current!.end;
      editBuilder.insert(newClosePos, text[currentEnd]);
    });
  }
}

/**
 * Barf forward: Move the closing delimiter inward, excluding the last expression
 */
export class BarfForwardCommand extends EditorCommand {
  protected executeCommand(editor: vscode.TextEditor, document: vscode.TextDocument): void {
    const position = editor.selection.active;
    const text = document.getText();
    
    // Find the current expression
    const exprInfo = findExpressionInfo(document, position);
    
    if (!exprInfo || !exprInfo.current) {
      return;
    }
    
    // Find the last expression inside the current expression
    const lastExprPos = this.findLastExpressionInside(text, exprInfo.current);
    
    if (!lastExprPos) {
      return;
    }
    
    const closePos = document.positionAt(exprInfo.current.end);
    
    // Skip whitespace before the last expression
    let insertPos = lastExprPos.start;
    while (insertPos > exprInfo.current.start && isWhitespace(text[insertPos - 1])) {
      insertPos--;
    }
    
    const insertPosition = document.positionAt(insertPos);
    
    editor.edit(editBuilder => {
      // Delete the original closing delimiter
      editBuilder.delete(new vscode.Range(closePos, closePos.translate(0, 1)));
      // Insert the closing delimiter before the last expression
      const currentEnd = exprInfo.current!.end;
      editBuilder.insert(insertPosition, text[currentEnd]);
    });
  }
  
  private findLastExpressionInside(text: string, expression: ExpressionBoundary): ExpressionBoundary | undefined {
    // Start from the end and move backwards
    let current = expression.end - 1;
    
    // Skip whitespace
    while (current > expression.start && isWhitespace(text[current])) {
      current--;
    }
    
    if (current <= expression.start) {
      return undefined;
    }
    
    return findPreviousExpression(text, current + 1);
  }
}

/**
 * Slurp backward: Extend the opening delimiter to include the previous expression
 */
export class SlurpBackwardCommand extends EditorCommand {
  protected executeCommand(editor: vscode.TextEditor, document: vscode.TextDocument): void {
    const position = editor.selection.active;
    const text = document.getText();
    
    // Find the current expression
    const exprInfo = findExpressionInfo(document, position);
    
    if (!exprInfo || !exprInfo.current || !exprInfo.previous) {
      return;
    }
    
    const openPos = document.positionAt(exprInfo.current.start);
    const newOpenPos = document.positionAt(exprInfo.previous.start);
    
    editor.edit(editBuilder => {
      // Delete the original opening delimiter
      editBuilder.delete(new vscode.Range(openPos, openPos.translate(0, 1)));
      // Insert the opening delimiter before the previous expression
      const currentStart = exprInfo.current!.start;
      editBuilder.insert(newOpenPos, text[currentStart]);
    });
  }
}

/**
 * Barf backward: Move the opening delimiter inward, excluding the first expression
 */
export class BarfBackwardCommand extends EditorCommand {
  protected executeCommand(editor: vscode.TextEditor, document: vscode.TextDocument): void {
    const position = editor.selection.active;
    const text = document.getText();
    
    // Find the current expression
    const exprInfo = findExpressionInfo(document, position);
    
    if (!exprInfo || !exprInfo.current) {
      return;
    }
    
    // Find the first expression inside the current expression
    const firstExprPos = this.findFirstExpressionInside(text, exprInfo.current);
    
    if (!firstExprPos) {
      return;
    }
    
    const openPos = document.positionAt(exprInfo.current.start);
    
    // Skip whitespace after the first expression
    let insertPos = firstExprPos.end + 1;
    while (insertPos < exprInfo.current.end && isWhitespace(text[insertPos])) {
      insertPos++;
    }
    
    const insertPosition = document.positionAt(insertPos);
    
    editor.edit(editBuilder => {
      // Delete the original opening delimiter
      editBuilder.delete(new vscode.Range(openPos, openPos.translate(0, 1)));
      // Insert the opening delimiter after the first expression
      const currentStart = exprInfo.current!.start;
      editBuilder.insert(insertPosition, text[currentStart]);
    });
  }
  
  private findFirstExpressionInside(text: string, expression: ExpressionBoundary): ExpressionBoundary | undefined {
    // Start from the beginning and move forward
    let current = expression.start + 1;
    
    // Skip whitespace
    while (current < expression.end && isWhitespace(text[current])) {
      current++;
    }
    
    if (current >= expression.end) {
      return undefined;
    }
    
    return findNextExpression(text, expression.start);
  }
}