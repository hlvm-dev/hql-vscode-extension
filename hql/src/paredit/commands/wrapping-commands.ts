// src/paredit/commands/wrapping-commands.ts
import * as vscode from 'vscode';
import { EditorCommand, createRange } from './editor-commands';
import { findExpressionInfo, findCurrentExpression, findContainingOpenDelimiter, findMatchingForward } from '../utils/expression-finder';

/**
 * Base class for wrapping commands
 */
abstract class WrapCommand extends EditorCommand {
  constructor(private openDelimiter: string, private closeDelimiter: string) {
    super();
  }
  
  protected executeCommand(editor: vscode.TextEditor, document: vscode.TextDocument): void {
    const selection = editor.selection;
    const text = document.getText(selection);
    
    // Insert the delimiters
    editor.edit(editBuilder => {
      editBuilder.replace(selection, `${this.openDelimiter}${text}${this.closeDelimiter}`);
    }).then(() => {
      // If selection was empty, move cursor between the delimiters
      if (selection.isEmpty) {
        const newPos = selection.start.translate(0, 1);
        editor.selection = new vscode.Selection(newPos, newPos);
      }
    });
  }
}

/**
 * Wrap the selection with parentheses
 */
export class WrapWithParenthesesCommand extends WrapCommand {
  constructor() {
    super('(', ')');
  }
}

/**
 * Wrap the selection with brackets
 */
export class WrapWithBracketsCommand extends WrapCommand {
  constructor() {
    super('[', ']');
  }
}

/**
 * Wrap the selection with braces
 */
export class WrapWithBracesCommand extends WrapCommand {
  constructor() {
    super('{', '}');
  }
}

/**
 * Unwrap the current expression by removing the surrounding delimiters
 */
export class UnwrapCommand extends EditorCommand {
  protected executeCommand(editor: vscode.TextEditor, document: vscode.TextDocument): void {
    const position = editor.selection.active;
    const exprInfo = findExpressionInfo(document, position);
    
    if (!exprInfo.current) {
      return;
    }
    
    const openPos = document.positionAt(exprInfo.current.start);
    const closePos = document.positionAt(exprInfo.current.end);
    
    editor.edit(editBuilder => {
      // Delete the closing delimiter first (to maintain offsets)
      editBuilder.delete(new vscode.Range(closePos, closePos.translate(0, 1)));
      // Delete the opening delimiter
      editBuilder.delete(new vscode.Range(openPos, openPos.translate(0, 1)));
    });
  }
}

/**
 * Splice: Remove surrounding delimiters but keep the content (alias for unwrap)
 */
export class SpliceCommand extends UnwrapCommand {
  // Same implementation as unwrap
}

/**
 * Raise: Replace parent form with current form
 */
export class RaiseCommand extends EditorCommand {
  protected executeCommand(editor: vscode.TextEditor, document: vscode.TextDocument): void {
    const position = editor.selection.active;
    const text = document.getText();
    
    // Find the expression info
    const exprInfo = findExpressionInfo(document, position);
    
    if (exprInfo && exprInfo.parent && exprInfo.current) {
      const innerExpr = text.substring(exprInfo.current.start, exprInfo.current.end + 1);
      const parentStart = exprInfo.parent.start;
      const parentEnd = exprInfo.parent.end;
      
      editor.edit(editBuilder => {
        editBuilder.replace(
          createRange(document, parentStart, parentEnd),
          innerExpr
        );
      });
    }
  }
}