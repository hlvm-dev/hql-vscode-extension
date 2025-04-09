import * as vscode from 'vscode';

/**
 * Shared UI utilities and constants for HQL extension
 */
export namespace UIUtils {
  /**
   * Theme constants organized by semantic meaning
   */
  export const THEME = {
    EVALUATION: {
      SUCCESS: {
        BG: "rgba(89, 195, 90, 0.15)",
        BORDER: "rgba(89, 195, 90, 0.4)",
        TEXT: new vscode.ThemeColor('debugConsole.infoForeground')
      },
      ERROR: {
        BG: "rgba(255, 88, 88, 0.15)",
        BORDER: "rgba(255, 88, 88, 0.4)",
        TEXT: new vscode.ThemeColor('errorForeground')
      },
      PENDING: {
        BG: "rgba(100, 148, 255, 0.15)",
        BORDER: "rgba(100, 148, 255, 0.4)",
        TEXT: new vscode.ThemeColor('editorInfo.foreground') 
      }
    },
    MATCHING: {
      BG: new vscode.ThemeColor('editor.selectionHighlightBackground'),
      BORDER: new vscode.ThemeColor('editor.selectionHighlightBorder'),
      DURATION_MS: 800
    }
  };

  /**
   * Format an evaluation result for display
   */
  export function formatResult(result: string): string {
    if (!result) return "";
    
    // Remove terminal escape sequences
    result = result.replace(/\u001b\[\d+m/g, '');
    
    // Truncate extremely long results with smart ellipsis
    if (result.length > 1000) {
      return result.substring(0, 997) + "...";
    }
    
    // Handle multiline results more gracefully
    if (result.includes('\n')) {
      const lines = result.split('\n');
      // Show first few lines for multiline output
      if (lines.length > 10) {
        const shownLines = lines.slice(0, 8);
        return shownLines.join('\n') + '\n... (' + (lines.length - 8) + ' more lines)';
      }
    }
    
    return result;
  }

  /**
   * Create hover markdown for evaluation results
   */
  export function createHoverMarkdown(
    code: string, 
    result: string, 
    isError: boolean = false
  ): vscode.MarkdownString {
    const header = isError ? "**HQL Error**" : "**HQL Evaluation Result**";
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    
    // Add the evaluated code
    markdown.appendMarkdown(`${header}\n\n`);
    markdown.appendCodeblock(code.trim(), 'hql');
    
    // Add a separator
    markdown.appendMarkdown('\n---\n\n');
    
    // Add the result
    if (isError) {
      markdown.appendMarkdown('**Error:**\n\n');
      markdown.appendCodeblock(result, 'error');
    } else {
      markdown.appendMarkdown('**Result:**\n\n');
      markdown.appendCodeblock(result, 'hql');
    }
    
    return markdown;
  }

  /**
   * Check if two ranges overlap
   */
  export function rangesOverlap(a: vscode.Range, b: vscode.Range): boolean {
    return !a.end.isBefore(b.start) && !b.end.isBefore(a.start);
  }

  /**
   * Generate a unique ID for a decoration based on range and type
   */
  export function generateDecorationId(range: vscode.Range, type: string): string {
    return `${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}:${type}`;
  }
}