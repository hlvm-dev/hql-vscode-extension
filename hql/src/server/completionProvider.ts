import {
  TextDocument
} from 'vscode-languageserver-textdocument';

import {
  Position,
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  CompletionParams,
  InsertTextFormat,
  Range
} from 'vscode-languageserver';

import * as path from 'path';
import * as fs from 'fs';
import { createTextDocumentAdapter } from '../document-adapter';
import { getCurrentExpression } from '../helper/getExpressionRange';
import { parse, SExp } from '../parser';
import { isList, isSymbol, isString } from '../s-exp/types';
import { SymbolManager, ExtendedSymbolInformation } from './symbolManager';
import { 
  createCompletionProviders, 
  getWordAtPosition, 
  mergeAndDeduplicate,
  setupCompletionItem,
  ICompletionProvider
} from './autocompletion';

/**
 * CompletionProvider handles intelligent code completion for HQL
 * @see {import('vscode-languageserver').CompletionItem}
 * @see {import('vscode-languageserver').CompletionItemKind}
 */
export class CompletionProvider {
  private symbolManager: SymbolManager;
  private workspaceFolders: { uri: string }[] | null = null;
  private providers: ICompletionProvider[];

  constructor(symbolManager: SymbolManager) {
    this.symbolManager = symbolManager;
    this.providers = createCompletionProviders(symbolManager);
  }

  /**
   * Set workspace folders for resolving paths
   */
  public setWorkspaceFolders(folders: { uri: string }[] | null): void {
    this.workspaceFolders = folders;
  }

  /**
   * Provide completion items for a given position
   */
  async provideCompletionItems(params: CompletionParams): Promise<CompletionItem[]> {
    try {
      const document = this.symbolManager.getDocument(params.textDocument.uri);
      if (!document) {
        return [];
      }
      
      const position = params.position;
      const linePrefix = document.getText({
        start: { line: position.line, character: 0 },
        end: position
      });
      
      const fullText = document.getText();
      
      // Try each provider in order
      for (const provider of this.providers) {
        const completions = provider.provideCompletions(document, position, linePrefix, fullText);
        if (completions.length > 0) {
          return completions;
        }
      }
      
      return [];
    } catch (error) {
      console.error(`Error providing completions: ${error}`);
      return [];
    }
  }
}

export { setupCompletionItem } from './autocompletion';