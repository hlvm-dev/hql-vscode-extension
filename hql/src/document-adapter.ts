import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, Position } from 'vscode-languageserver';

// Only import vscode conditionally to support running in the Language Server context
let vscode: any;
try {
  // When running in the extension host, vscode will be available
  vscode = require('vscode');
} catch (e) {
  // When running in the language server, vscode won't be available
  // and we'll use our own Position and Range implementations
  vscode = {
    Position: class {
      constructor(public line: number, public character: number) {}
    },
    Range: class {
      constructor(public start: any, public end: any) {}
    }
  };
}

/**
 * Common interface for TextDocument properties and methods
 * that we need, regardless of whether it's a VS Code or LSP TextDocument
 */
export interface ITextDocument {
  getText(range?: Range): string;
  positionAt(offset: number): Position;
  offsetAt(position: Position): number;
  lineCount: number;
  uri: string;
}

/**
 * Adapter for VS Code TextDocument
 */
export class VSCodeTextDocumentAdapter implements ITextDocument {
  private document: any; // Using any to avoid direct vscode imports

  constructor(document: any) {
    this.document = document;
  }

  getText(range?: Range): string {
    if (!range) {
      return this.document.getText();
    }

    const vsCodeRange = new vscode.Range(
      new vscode.Position(range.start.line, range.start.character),
      new vscode.Position(range.end.line, range.end.character)
    );
    return this.document.getText(vsCodeRange);
  }

  positionAt(offset: number): Position {
    const position = this.document.positionAt(offset);
    return Position.create(position.line, position.character);
  }

  offsetAt(position: Position): number {
    return this.document.offsetAt(new vscode.Position(position.line, position.character));
  }

  get lineCount(): number {
    return this.document.lineCount;
  }

  get uri(): string {
    return this.document.uri.toString();
  }
}

/**
 * Adapter for LSP TextDocument
 */
export class LSPTextDocumentAdapter implements ITextDocument {
  private document: TextDocument;

  constructor(document: TextDocument) {
    this.document = document;
  }

  getText(range?: Range): string {
    return this.document.getText(range);
  }

  positionAt(offset: number): Position {
    return this.document.positionAt(offset);
  }

  offsetAt(position: Position): number {
    return this.document.offsetAt(position);
  }

  get lineCount(): number {
    return this.document.getText().split('\n').length;
  }

  get uri(): string {
    return this.document.uri;
  }
}

/**
 * Create an adapter for the document, handling both VSCode and LSP TextDocuments
 */
export function createTextDocumentAdapter(document: TextDocument | any): ITextDocument {
  // Check if it's a VS Code document
  if ('uri' in document && typeof document.uri === 'object' && 'scheme' in document.uri) {
    return new VSCodeTextDocumentAdapter(document);
  }

  // Otherwise assume it's an LSP document
  return new LSPTextDocumentAdapter(document as TextDocument);
}