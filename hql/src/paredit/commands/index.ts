// src/paredit/commands/index.ts
import * as vscode from 'vscode';
import { TransposeCommand } from './transpose-command';
import { KillNextFormCommand, KillPreviousFormCommand } from './kill-form-commands';
import { 
  WrapWithParenthesesCommand, 
  WrapWithBracketsCommand, 
  WrapWithBracesCommand,
  UnwrapCommand,
  SpliceCommand,
  RaiseCommand
} from './wrapping-commands';
import {
  SlurpForwardCommand,
  BarfForwardCommand,
  SlurpBackwardCommand,
  BarfBackwardCommand
} from './slurping-commands';

// Map of command ids to command instances
const commands = new Map<string, { new(): any }>([
  ['hql.paredit.transpose', TransposeCommand],
  ['hql.paredit.killNextForm', KillNextFormCommand],
  ['hql.paredit.killPreviousForm', KillPreviousFormCommand],
  ['hql.paredit.wrapWithParentheses', WrapWithParenthesesCommand],
  ['hql.paredit.wrapWithBrackets', WrapWithBracketsCommand],
  ['hql.paredit.wrapWithBraces', WrapWithBracesCommand],
  ['hql.paredit.unwrap', UnwrapCommand],
  ['hql.paredit.splice', SpliceCommand],
  ['hql.paredit.raise', RaiseCommand],
  ['hql.paredit.slurpForward', SlurpForwardCommand],
  ['hql.paredit.barfForward', BarfForwardCommand],
  ['hql.paredit.slurpBackward', SlurpBackwardCommand],
  ['hql.paredit.barfBackward', BarfBackwardCommand]
]);

/**
 * Register paredit commands with VS Code
 */
export function registerCommands(context: vscode.ExtensionContext): void {
  commands.forEach((CommandClass, commandId) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, () => {
        const command = new CommandClass();
        command.execute();
      })
    );
  });
  
  // Register additional alias for wrapWithParentheses
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('hql.paredit.wrapParentheses', (editor) => {
      if (editor.document.languageId === 'hql') {
        const command = new WrapWithParenthesesCommand();
        command.execute();
      }
    })
  );
}