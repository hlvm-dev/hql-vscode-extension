import * as vscode from 'vscode';
import { Range, Position } from 'vscode-languageserver';

/**
 * Utility functions for handling Range conversions between
 * VS Code API and Language Server Protocol
 */

/**
 * Convert a Language Server Protocol Range to a VS Code Range
 */
export function lspToVsCodeRange(range: Range): vscode.Range {
  return new vscode.Range(
    new vscode.Position(range.start.line, range.start.character),
    new vscode.Position(range.end.line, range.end.character)
  );
}

/**
 * Convert a VS Code Range to a Language Server Protocol Range
 */
export function vsCodeToLspRange(range: vscode.Range): Range {
  return Range.create(
    Position.create(range.start.line, range.start.character),
    Position.create(range.end.line, range.end.character)
  );
}

/**
 * Safely convert a range of unknown type to a VS Code Range
 */
export function toVsCodeRange(range: vscode.Range | Range): vscode.Range {
  if (range instanceof vscode.Range) {
    return range;
  }
  return lspToVsCodeRange(range);
}

/**
 * Safely convert a range of unknown type to an LSP Range
 */
export function toLspRange(range: vscode.Range | Range): Range {
  if ('start' in range && 'end' in range && 
      !('line' in range.start) && !('line' in range.end)) {
    // This is a vscode.Range as it doesn't have .line properties directly
    return vsCodeToLspRange(range as vscode.Range);
  }
  return range as Range;
}

/**
 * Safely convert a position of unknown type to a VS Code Position
 */
export function toVsCodePosition(position: vscode.Position | Position): vscode.Position {
  if (position instanceof vscode.Position) {
    return position;
  }
  return new vscode.Position(position.line, position.character);
}

/**
 * Check if range contains a position
 */
export function rangeContainsPosition(range: vscode.Range, position: vscode.Position): boolean {
  return range.contains(position);
}

/**
 * Create a range at a specific position (1 character range)
 */
export function createPointRange(position: vscode.Position): vscode.Range {
  return new vscode.Range(position, position.translate(0, 1));
}