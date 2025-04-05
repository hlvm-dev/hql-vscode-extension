/**
 * Transpose: Swap the current expression with the next expression
 */
function transpose(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    
    const document = editor.document;
    if (document.languageId !== 'hql') {
      return;
    }
    
    // Find the current expression
    const position = editor.selection.active;
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Find the current expression's boundaries
    let currentStart = -1;
    let currentEnd = -1;
    
    // If cursor is on a delimiter, use that to determine expression
    if ('([{)]}'.includes(text[offset])) {
      if ('([{'.includes(text[offset])) {
        // Cursor is on an opening delimiter, find its matching closing delimiter
        currentStart = offset;
        let depth = 1;
        const openChar = text[offset];
        const closeChar = getMatchingDelimiter(openChar);
        
        for (let i = offset + 1; i < text.length; i++) {
          if (text[i] === openChar) {
            depth++;
          } else if (text[i] === closeChar) {
            depth--;
            if (depth === 0) {
              currentEnd = i;
              break;
            }
          }
        }
      } else {
        // Cursor is on a closing delimiter, find its matching opening delimiter
        currentEnd = offset;
        let depth = 1;
        const closeChar = text[offset];
        const openChar = getMatchingDelimiter(closeChar);
        
        for (let i = offset - 1; i >= 0; i--) {
          if (text[i] === closeChar) {
            depth++;
          } else if (text[i] === openChar) {
            depth--;
            if (depth === 0) {
              currentStart = i;
              break;
            }
          }
        }
      }
    } else {
      // Cursor is not on a delimiter, try to find surrounding expression
      let depth = 0;
      
      // Find the opening delimiter
      for (let i = offset; i >= 0; i--) {
        const char = text[i];
        if (char === ')' || char === ']' || char === '}') {
          depth++;
        } else if (char === '(' || char === '[' || char === '{') {
          depth--;
          if (depth < 0) {
            currentStart = i;
            depth = 0;
            break;
          }
        }
      }
      
      // Find the matching closing delimiter
      if (currentStart >= 0) {
        const openChar = text[currentStart];
        const closeChar = getMatchingDelimiter(openChar);
        
        for (let i = currentStart + 1; i < text.length; i++) {
          const char = text[i];
          if (char === openChar) {
            depth++;
          } else if (char === closeChar) {
            if (depth === 0) {
              currentEnd = i;
              break;
            }
            depth--;
          }
        }
      }
    }
    
    // If we found the current expression, find the next expression
    if (currentStart >= 0 && currentEnd >= 0) {
      // Find the next expression after the current one
      let nextStart = -1;
      let nextEnd = -1;
      
      // Skip whitespace after the current expression
      for (let i = currentEnd + 1; i < text.length; i++) {
        if (!isWhitespace(text[i])) {
          nextStart = i;
          break;
        }
      }
      
      // If we found the start of the next expression, find its end
      if (nextStart >= 0) {
        if (text[nextStart] === '(' || text[nextStart] === '[' || text[nextStart] === '{') {
          // Next expression is a form, find its matching closing delimiter
          let depth = 1;
          const openChar = text[nextStart];
          const closeChar = getMatchingDelimiter(openChar);
          
          for (let i = nextStart + 1; i < text.length; i++) {
            if (text[i] === openChar) {
              depth++;
            } else if (text[i] === closeChar) {
              depth--;
              if (depth === 0) {
                nextEnd = i;
                break;
              }
            }
          }
        } else {
          // Next expression is an atom, find where it ends
          for (let i = nextStart + 1; i < text.length; i++) {
            if (isWhitespace(text[i]) || text[i] === '(' || text[i] === ')' ||
                text[i] === '[' || text[i] === ']' || text[i] === '{' || text[i] === '}') {
              nextEnd = i - 1;
              break;
            }
          }
          
          // If we didn't find the end, it's the last expression in the file
          if (nextEnd < 0) {
            nextEnd = text.length - 1;
          }
        }
        
        // If we found both expressions, swap them
        if (nextEnd >= 0) {
          const currentExpr = text.substring(currentStart, currentEnd + 1);
          const nextExpr = text.substring(nextStart, nextEnd + 1);
          
          // Find whitespace between expressions
          const betweenText = text.substring(currentEnd + 1, nextStart);
          
          editor.edit(editBuilder => {
            // Replace the next expression with the current one
            editBuilder.replace(
              new vscode.Range(document.positionAt(nextStart), document.positionAt(nextEnd + 1)),
              currentExpr
            );
            
            // Replace the current expression with the next one
            editBuilder.replace(
              new vscode.Range(document.positionAt(currentStart), document.positionAt(currentEnd + 1)),
              nextExpr
            );
          });
        }
      }
    }
  }
  
  /**
   * Kill (delete) the next form
   */
  function killNextForm(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    
    const document = editor.document;
    if (document.languageId !== 'hql') {
      return;
    }
    
    // Get the current position
    const position = editor.selection.active;
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Find the next form starting from the current position
    let nextFormStart = -1;
    let nextFormEnd = -1;
    
    // Skip whitespace to find the start of the next form
    for (let i = offset; i < text.length; i++) {
      if (!isWhitespace(text[i])) {
        nextFormStart = i;
        break;
      }
    }
    
    // If we found the start, find the end of the form
    if (nextFormStart >= 0) {
      if (text[nextFormStart] === '(' || text[nextFormStart] === '[' || text[nextFormStart] === '{') {
        // Next form is a list/vector/map, find its matching closing delimiter
        let depth = 1;
        const openChar = text[nextFormStart];
        const closeChar = getMatchingDelimiter(openChar);
        
        for (let i = nextFormStart + 1; i < text.length; i++) {
          if (text[i] === openChar) {
            depth++;
          } else if (text[i] === closeChar) {
            depth--;
            if (depth === 0) {
              nextFormEnd = i;
              break;
            }
          }
        }
      } else {
        // Next form is an atom, find its end
        for (let i = nextFormStart + 1; i < text.length; i++) {
          if (isWhitespace(text[i]) || text[i] === '(' || text[i] === ')' ||
              text[i] === '[' || text[i] === ']' || text[i] === '{' || text[i] === '}') {
            nextFormEnd = i - 1;
            break;
          }
        }
        
        // If we didn't find the end, it's the last form in the file
        if (nextFormEnd < 0) {
          nextFormEnd = text.length - 1;
        }
      }
      
      // If we found both start and end, delete the form
      if (nextFormEnd >= 0) {
        const startPos = document.positionAt(nextFormStart);
        const endPos = document.positionAt(nextFormEnd + 1);
        
        editor.edit(editBuilder => {
          editBuilder.delete(new vscode.Range(startPos, endPos));
        });
      }
    }
  }
  
  /**
   * Kill (delete) the previous form
   */
  function killPreviousForm(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    
    const document = editor.document;
    if (document.languageId !== 'hql') {
      return;
    }
    
    // Get the current position
    const position = editor.selection.active;
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Find the previous form ending at the current position
    let prevFormStart = -1;
    let prevFormEnd = -1;
    
    // Skip whitespace to find the end of the previous form
    for (let i = offset - 1; i >= 0; i--) {
      if (!isWhitespace(text[i])) {
        prevFormEnd = i;
        break;
      }
    }
    
    // If we found the end, find the start of the form
    if (prevFormEnd >= 0) {
      if (text[prevFormEnd] === ')' || text[prevFormEnd] === ']' || text[prevFormEnd] === '}') {
        // Previous form is a list/vector/map, find its matching opening delimiter
        let depth = 1;
        const closeChar = text[prevFormEnd];
        const openChar = getMatchingDelimiter(closeChar);
        
        for (let i = prevFormEnd - 1; i >= 0; i--) {
          if (text[i] === closeChar) {
            depth++;
          } else if (text[i] === openChar) {
            depth--;
            if (depth === 0) {
              prevFormStart = i;
              break;
            }
          }
        }
      } else {
        // Previous form is an atom, find its start
        for (let i = prevFormEnd - 1; i >= 0; i--) {
          if (isWhitespace(text[i]) || text[i] === '(' || text[i] === ')' ||
              text[i] === '[' || text[i] === ']' || text[i] === '{' || text[i] === '}') {
            prevFormStart = i + 1;
            break;
          }
        }
        
        // If we didn't find the start, it's the first form in the file
        if (prevFormStart < 0) {
          prevFormStart = 0;
        }
      }
      
      // If we found both start and end, delete the form
      if (prevFormStart >= 0) {
        const startPos = document.positionAt(prevFormStart);
        const endPos = document.positionAt(prevFormEnd + 1);
        
        editor.edit(editBuilder => {
          editBuilder.delete(new vscode.Range(startPos, endPos));
        });
      }
    }
  }
  
  /**
   * Get the matching delimiter for a given delimiter
   */
  function getMatchingDelimiter(delimiter: string): string {
    switch (delimiter) {
      case '(': return ')';
      case ')': return '(';
      case '[': return ']';
      case ']': return '[';
      case '{': return '}';
      case '}': return '{';
      default: return '';
    }
  }
  
  /**
   * Check if a character is whitespace
   */
  function isWhitespace(char: string): boolean {
    return /\s/.test(char);
  }import * as vscode from 'vscode';
  import { Logger } from './logger';
  
  // Create a logger
  const logger = new Logger(false);
  
  /**
   * Activate paredit functionality
   */
  export function activateParedit(context: vscode.ExtensionContext): void {
    logger.debug('Activating HQL paredit functionality');
    
    // Register command for wrapping selection with parentheses
    context.subscriptions.push(
      vscode.commands.registerCommand('hql.paredit.wrapWithParentheses', () => {
        wrapSelectionWith('(', ')');
      })
    );
    
    // Register command for wrapping selection with brackets
    context.subscriptions.push(
      vscode.commands.registerCommand('hql.paredit.wrapWithBrackets', () => {
        wrapSelectionWith('[', ']');
      })
    );
    
    // Register command for wrapping selection with braces
    context.subscriptions.push(
      vscode.commands.registerCommand('hql.paredit.wrapWithBraces', () => {
        wrapSelectionWith('{', '}');
      })
    );
    
    // Register command for unwrapping (removing surrounding delimiters)
    context.subscriptions.push(
      vscode.commands.registerCommand('hql.paredit.unwrap', () => {
        unwrap();
      })
    );
    
    // Register command for slurp forward (extend closing delimiter to include next form)
    context.subscriptions.push(
      vscode.commands.registerCommand('hql.paredit.slurpForward', () => {
        slurpForward();
      })
    );
    
    // Register command for barf forward (shrink form by moving closing delimiter inward)
    context.subscriptions.push(
      vscode.commands.registerCommand('hql.paredit.barfForward', () => {
        barfForward();
      })
    );
    
    // Register command for slurp backward (extend opening delimiter to include previous form)
    context.subscriptions.push(
      vscode.commands.registerCommand('hql.paredit.slurpBackward', () => {
        slurpBackward();
      })
    );
    
    // Register command for barf backward (shrink form by moving opening delimiter inward)
    context.subscriptions.push(
      vscode.commands.registerCommand('hql.paredit.barfBackward', () => {
        barfBackward();
      })
    );
    
    // Register command for splice (remove surrounding delimiters and keep content)
    context.subscriptions.push(
      vscode.commands.registerCommand('hql.paredit.splice', () => {
        splice();
      })
    );
    
    // Register command for raising current form (replace parent form with current form)
    context.subscriptions.push(
      vscode.commands.registerCommand('hql.paredit.raise', () => {
        raise();
      })
    );
    
    // Register command for transpose (swap adjacent forms)
    context.subscriptions.push(
      vscode.commands.registerCommand('hql.paredit.transpose', () => {
        transpose();
      })
    );
    
    // Register command for deletion of next form
    context.subscriptions.push(
      vscode.commands.registerCommand('hql.paredit.killNextForm', () => {
        killNextForm();
      })
    );
    
    // Register command for deletion of previous form
    context.subscriptions.push(
      vscode.commands.registerCommand('hql.paredit.killPreviousForm', () => {
        killPreviousForm();
      })
    );
    
    // Register keyboard handlers
    registerPareditKeyBindings(context);
    
    // Register on type formatter for automatic closing of delimiters
    registerAutoClosePairsHandler(context);
  }
  
  /**
   * Register paredit key bindings
   */
  function registerPareditKeyBindings(context: vscode.ExtensionContext): void {
    // Add keyboard shortcuts for paredit commands
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand('hql.paredit.wrapParentheses', (editor) => {
        if (editor.document.languageId === 'hql') {
          wrapSelectionWith('(', ')');
        }
      })
    );
    
    // Register other keyboard shortcuts in package.json
  }
  
  /**
   * Register handlers for auto-closing pairs
   */
  function registerAutoClosePairsHandler(context: vscode.ExtensionContext): void {
    // Handle auto-pairing of delimiters
    context.subscriptions.push(
      vscode.languages.registerOnTypeFormattingEditProvider('hql', {
        provideOnTypeFormattingEdits(document, position, ch, options, token) {
          // Only handle specific characters
          if (!['{', '[', '(', ')', ']', '}', '"'].includes(ch)) {
            return [];
          }
          
          // Handle automatic closing/pairing based on the character typed
          // For HQL, we want to ensure balanced delimiters
          
          // Note: VS Code's built-in auto-pairing should handle most cases,
          // but we can add special handling here if needed.
          
          return [];
        }
      }, ['{', '[', '(', ')', ']', '}', '"'])
    );
    
    // Monitor document changes to enforce balanced delimiters
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.languageId !== 'hql') {
          return;
        }
        
        // Monitor changes to ensure balanced delimiters
        // For more complex scenarios that aren't handled by basic auto-pairing
      })
    );
  }
  
  /**
   * Wrap the current selection with specified opening and closing delimiters
   */
  function wrapSelectionWith(openDelimiter: string, closeDelimiter: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    
    const document = editor.document;
    if (document.languageId !== 'hql') {
      return;
    }
    
    editor.edit(editBuilder => {
      editor.selections.forEach(selection => {
        const text = document.getText(selection);
        
        // Insert the delimiters
        editBuilder.replace(selection, `${openDelimiter}${text}${closeDelimiter}`);
      });
    }).then(() => {
      // If selection was empty, move cursor between the delimiters
      if (editor.selections.every(sel => sel.isEmpty)) {
        const newPositions = editor.selections.map(sel => {
          const newPos = sel.start.translate(0, 1);
          return new vscode.Selection(newPos, newPos);
        });
        editor.selections = newPositions;
      }
    });
  }
  
  /**
   * Unwrap the current expression by removing the surrounding delimiters
   */
  function unwrap(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    
    const document = editor.document;
    if (document.languageId !== 'hql') {
      return;
    }
    
    // Find the current expression's delimiters
    const position = editor.selection.active;
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Find the surrounding delimiters
    let openDelimiterPos = -1;
    let closeDelimiterPos = -1;
    let depth = 0;
    
    // First, find the opening delimiter
    for (let i = offset; i >= 0; i--) {
      const char = text[i];
      if (char === ')' || char === ']' || char === '}') {
        depth++;
      } else if (char === '(' || char === '[' || char === '{') {
        depth--;
        if (depth < 0) {
          openDelimiterPos = i;
          break;
        }
      }
    }
    
    // Then find the matching closing delimiter
    if (openDelimiterPos >= 0) {
      depth = 0;
      for (let i = openDelimiterPos; i < text.length; i++) {
        const char = text[i];
        if (char === '(' || char === '[' || char === '{') {
          depth++;
        } else if (char === ')' || char === ']' || char === '}') {
          depth--;
          if (depth === 0) {
            closeDelimiterPos = i;
            break;
          }
        }
      }
    }
    
    // If we found both delimiters, unwrap the expression
    if (openDelimiterPos >= 0 && closeDelimiterPos >= 0) {
      const openPos = document.positionAt(openDelimiterPos);
      const closePos = document.positionAt(closeDelimiterPos);
      
      editor.edit(editBuilder => {
        // Delete the closing delimiter first (to maintain offsets)
        editBuilder.delete(new vscode.Range(closePos, closePos.translate(0, 1)));
        // Delete the opening delimiter
        editBuilder.delete(new vscode.Range(openPos, openPos.translate(0, 1)));
      });
    }
  }
  
  /**
   * Slurp forward: Extend the closing delimiter to include the next expression
   */
  function slurpForward(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    
    const document = editor.document;
    if (document.languageId !== 'hql') {
      return;
    }
    
    // Find the current expression's delimiters
    const position = editor.selection.active;
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Find the surrounding delimiters
    let openDelimiterPos = -1;
    let closeDelimiterPos = -1;
    let depth = 0;
    
    // First, find the opening delimiter
    for (let i = offset; i >= 0; i--) {
      const char = text[i];
      if (char === ')' || char === ']' || char === '}') {
        depth++;
      } else if (char === '(' || char === '[' || char === '{') {
        depth--;
        if (depth < 0) {
          openDelimiterPos = i;
          depth = 0;
          break;
        }
      }
    }
    
    // Then find the matching closing delimiter
    if (openDelimiterPos >= 0) {
      const openingChar = text[openDelimiterPos];
      const closingChar = getMatchingDelimiter(openingChar);
      
      for (let i = openDelimiterPos + 1; i < text.length; i++) {
        const char = text[i];
        if (char === openingChar) {
          depth++;
        } else if (char === closingChar) {
          if (depth === 0) {
            closeDelimiterPos = i;
            break;
          }
          depth--;
        }
      }
    }
    
    // If we found both delimiters, find the next expression
    if (openDelimiterPos >= 0 && closeDelimiterPos >= 0) {
      // Find the next expression after the closing delimiter
      let nextExprPos = -1;
      let nextExprEnd = -1;
      
      // Skip whitespace and find the start of the next expression
      for (let i = closeDelimiterPos + 1; i < text.length; i++) {
        if (!isWhitespace(text[i])) {
          nextExprPos = i;
          break;
        }
      }
      
      // If we found a next expression, find its end
      if (nextExprPos >= 0) {
        if (text[nextExprPos] === '(' || text[nextExprPos] === '[' || text[nextExprPos] === '{') {
          // Next expression is a list/vector/map, find its closing delimiter
          const openChar = text[nextExprPos];
          const closeChar = getMatchingDelimiter(openChar);
          depth = 1;
          
          for (let i = nextExprPos + 1; i < text.length; i++) {
            const char = text[i];
            if (char === openChar) {
              depth++;
            } else if (char === closeChar) {
              depth--;
              if (depth === 0) {
                nextExprEnd = i;
                break;
              }
            }
          }
        } else {
          // Next expression is an atom, find its end
          for (let i = nextExprPos + 1; i < text.length; i++) {
            if (isWhitespace(text[i]) || text[i] === '(' || text[i] === ')' || 
                text[i] === '[' || text[i] === ']' || text[i] === '{' || text[i] === '}') {
              nextExprEnd = i - 1;
              break;
            }
          }
          
          // If we didn't find the end, it's the last expression in the file
          if (nextExprEnd < 0) {
            nextExprEnd = text.length - 1;
          }
        }
        
        // If we found both the next expression and its end, slurp it
        if (nextExprEnd >= 0) {
          const closePos = document.positionAt(closeDelimiterPos);
          const newClosePos = document.positionAt(nextExprEnd + 1);
          
          editor.edit(editBuilder => {
            // Delete the original closing delimiter
            editBuilder.delete(new vscode.Range(closePos, closePos.translate(0, 1)));
            // Insert the closing delimiter after the next expression
            editBuilder.insert(newClosePos, text[closeDelimiterPos]);
          });
        }
      }
    }
  }
  
  /**
   * Barf forward: Move the closing delimiter inward, excluding the last expression
   */
  function barfForward(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    
    const document = editor.document;
    if (document.languageId !== 'hql') {
      return;
    }
    
    // Find the current expression's delimiters
    const position = editor.selection.active;
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Find the surrounding delimiters
    let openDelimiterPos = -1;
    let closeDelimiterPos = -1;
    let depth = 0;
    
    // First, find the opening delimiter
    for (let i = offset; i >= 0; i--) {
      const char = text[i];
      if (char === ')' || char === ']' || char === '}') {
        depth++;
      } else if (char === '(' || char === '[' || char === '{') {
        depth--;
        if (depth < 0) {
          openDelimiterPos = i;
          depth = 0;
          break;
        }
      }
    }
    
    // Then find the matching closing delimiter
    if (openDelimiterPos >= 0) {
      const openingChar = text[openDelimiterPos];
      const closingChar = getMatchingDelimiter(openingChar);
      
      for (let i = openDelimiterPos + 1; i < text.length; i++) {
        const char = text[i];
        if (char === openingChar) {
          depth++;
        } else if (char === closingChar) {
          if (depth === 0) {
            closeDelimiterPos = i;
            break;
          }
          depth--;
        }
      }
    }
    
    // If we found both delimiters, find the last expression
    if (openDelimiterPos >= 0 && closeDelimiterPos >= 0) {
      // Find the last expression before the closing delimiter
      let lastExprEnd = -1;
      let lastExprStart = -1;
      
      // Skip whitespace and find the end of the last expression
      for (let i = closeDelimiterPos - 1; i > openDelimiterPos; i--) {
        if (!isWhitespace(text[i])) {
          lastExprEnd = i;
          break;
        }
      }
      
      // If we found a last expression, find its start
      if (lastExprEnd >= 0) {
        if (text[lastExprEnd] === ')' || text[lastExprEnd] === ']' || text[lastExprEnd] === '}') {
          // Last expression is a list/vector/map, find its opening delimiter
          const closeChar = text[lastExprEnd];
          const openChar = getMatchingDelimiter(closeChar);
          depth = 1;
          
          for (let i = lastExprEnd - 1; i > openDelimiterPos; i--) {
            const char = text[i];
            if (char === closeChar) {
              depth++;
            } else if (char === openChar) {
              depth--;
              if (depth === 0) {
                lastExprStart = i;
                break;
              }
            }
          }
        } else {
          // Last expression is an atom, find its start
          for (let i = lastExprEnd - 1; i > openDelimiterPos; i--) {
            if (isWhitespace(text[i]) || text[i] === '(' || text[i] === ')' || 
                text[i] === '[' || text[i] === ']' || text[i] === '{' || text[i] === '}') {
              lastExprStart = i + 1;
              break;
            }
          }
          
          // If we didn't find the start, it's the first expression after the opening delimiter
          if (lastExprStart < 0) {
            lastExprStart = openDelimiterPos + 1;
          }
        }
        
        // If we found both the last expression start and end, barf it
        if (lastExprStart >= 0) {
          const closePos = document.positionAt(closeDelimiterPos);
          const newClosePos = document.positionAt(lastExprStart - 1);
          
          // Skip whitespace before the last expression
          let insertPos = lastExprStart;
          while (insertPos > openDelimiterPos && isWhitespace(text[insertPos - 1])) {
            insertPos--;
          }
          
          const insertPosition = document.positionAt(insertPos);
          
          editor.edit(editBuilder => {
            // Delete the original closing delimiter
            editBuilder.delete(new vscode.Range(closePos, closePos.translate(0, 1)));
            // Insert the closing delimiter before the last expression
            editBuilder.insert(insertPosition, text[closeDelimiterPos]);
          });
        }
      }
    }
  }
  
  /**
   * Slurp backward: Extend the opening delimiter to include the previous expression
   */
  function slurpBackward(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    
    const document = editor.document;
    if (document.languageId !== 'hql') {
      return;
    }
    
    // Find the current expression's delimiters
    const position = editor.selection.active;
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Find the surrounding delimiters
    let openDelimiterPos = -1;
    let closeDelimiterPos = -1;
    let depth = 0;
    
    // First, find the opening delimiter
    for (let i = offset; i >= 0; i--) {
      const char = text[i];
      if (char === ')' || char === ']' || char === '}') {
        depth++;
      } else if (char === '(' || char === '[' || char === '{') {
        depth--;
        if (depth < 0) {
          openDelimiterPos = i;
          depth = 0;
          break;
        }
      }
    }
    
    // Then find the matching closing delimiter
    if (openDelimiterPos >= 0) {
      const openingChar = text[openDelimiterPos];
      const closingChar = getMatchingDelimiter(openingChar);
      
      for (let i = openDelimiterPos + 1; i < text.length; i++) {
        const char = text[i];
        if (char === openingChar) {
          depth++;
        } else if (char === closingChar) {
          if (depth === 0) {
            closeDelimiterPos = i;
            break;
          }
          depth--;
        }
      }
    }
    
    // If we found both delimiters, find the previous expression
    if (openDelimiterPos >= 0 && closeDelimiterPos >= 0) {
      // Find the previous expression before the opening delimiter
      let prevExprStart = -1;
      let prevExprEnd = -1;
      
      // Skip whitespace and find the end of the previous expression
      for (let i = openDelimiterPos - 1; i >= 0; i--) {
        if (!isWhitespace(text[i])) {
          prevExprEnd = i;
          break;
        }
      }
      
      // If we found a previous expression, find its start
      if (prevExprEnd >= 0) {
        if (text[prevExprEnd] === ')' || text[prevExprEnd] === ']' || text[prevExprEnd] === '}') {
          // Previous expression is a list/vector/map, find its opening delimiter
          const closeChar = text[prevExprEnd];
          const openChar = getMatchingDelimiter(closeChar);
          depth = 1;
          
          for (let i = prevExprEnd - 1; i >= 0; i--) {
            const char = text[i];
            if (char === closeChar) {
              depth++;
            } else if (char === openChar) {
              depth--;
              if (depth === 0) {
                prevExprStart = i;
                break;
              }
            }
          }
        } else {
          // Previous expression is an atom, find its start
          for (let i = prevExprEnd - 1; i >= 0; i--) {
            if (isWhitespace(text[i]) || text[i] === '(' || text[i] === ')' || 
                text[i] === '[' || text[i] === ']' || text[i] === '{' || text[i] === '}') {
              prevExprStart = i + 1;
              break;
            }
          }
          
          // If we didn't find the start, it's the first expression in the file
          if (prevExprStart < 0) {
            prevExprStart = 0;
          }
        }
        
        // If we found both the previous expression start and end, slurp it
        if (prevExprStart >= 0) {
          const openPos = document.positionAt(openDelimiterPos);
          const newOpenPos = document.positionAt(prevExprStart);
          
          editor.edit(editBuilder => {
            // Delete the original opening delimiter
            editBuilder.delete(new vscode.Range(openPos, openPos.translate(0, 1)));
            // Insert the opening delimiter before the previous expression
            editBuilder.insert(newOpenPos, text[openDelimiterPos]);
          });
        }
      }
    }
  }
  
  /**
   * Barf backward: Move the opening delimiter inward, excluding the first expression
   */
  function barfBackward(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    
    const document = editor.document;
    if (document.languageId !== 'hql') {
      return;
    }
    
    // Find the current expression's delimiters
    const position = editor.selection.active;
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Find the surrounding delimiters
    let openDelimiterPos = -1;
    let closeDelimiterPos = -1;
    let depth = 0;
    
    // First, find the opening delimiter
    for (let i = offset; i >= 0; i--) {
      const char = text[i];
      if (char === ')' || char === ']' || char === '}') {
        depth++;
      } else if (char === '(' || char === '[' || char === '{') {
        depth--;
        if (depth < 0) {
          openDelimiterPos = i;
          depth = 0;
          break;
        }
      }
    }
    
    // Then find the matching closing delimiter
    if (openDelimiterPos >= 0) {
      const openingChar = text[openDelimiterPos];
      const closingChar = getMatchingDelimiter(openingChar);
      
      for (let i = openDelimiterPos + 1; i < text.length; i++) {
        const char = text[i];
        if (char === openingChar) {
          depth++;
        } else if (char === closingChar) {
          if (depth === 0) {
            closeDelimiterPos = i;
            break;
          }
          depth--;
        }
      }
    }
    
    // If we found both delimiters, find the first expression
    if (openDelimiterPos >= 0 && closeDelimiterPos >= 0) {
      // Find the first expression after the opening delimiter
      let firstExprStart = -1;
      let firstExprEnd = -1;
      
      // Skip whitespace and find the start of the first expression
      for (let i = openDelimiterPos + 1; i < closeDelimiterPos; i++) {
        if (!isWhitespace(text[i])) {
          firstExprStart = i;
          break;
        }
      }
      
      // If we found a first expression, find its end
      if (firstExprStart >= 0) {
        if (text[firstExprStart] === '(' || text[firstExprStart] === '[' || text[firstExprStart] === '{') {
          // First expression is a list/vector/map, find its closing delimiter
          const openChar = text[firstExprStart];
          const closeChar = getMatchingDelimiter(openChar);
          depth = 1;
          
          for (let i = firstExprStart + 1; i < closeDelimiterPos; i++) {
            const char = text[i];
            if (char === openChar) {
              depth++;
            } else if (char === closeChar) {
              depth--;
              if (depth === 0) {
                firstExprEnd = i;
                break;
              }
            }
          }
        } else {
          // First expression is an atom, find its end
          for (let i = firstExprStart + 1; i < closeDelimiterPos; i++) {
            if (isWhitespace(text[i]) || text[i] === '(' || text[i] === ')' || 
                text[i] === '[' || text[i] === ']' || text[i] === '{' || text[i] === '}') {
              firstExprEnd = i - 1;
              break;
            }
          }
          
          // If we didn't find the end, it's the only expression in the form
          if (firstExprEnd < 0) {
            firstExprEnd = closeDelimiterPos - 1;
          }
        }
        
        // If we found both the first expression start and end, barf it
        if (firstExprEnd >= 0) {
          const openPos = document.positionAt(openDelimiterPos);
          
          // Skip whitespace after the first expression
          let insertPos = firstExprEnd + 1;
          while (insertPos < closeDelimiterPos && isWhitespace(text[insertPos])) {
            insertPos++;
          }
          
          const insertPosition = document.positionAt(insertPos);
          
          editor.edit(editBuilder => {
            // Delete the original opening delimiter
            editBuilder.delete(new vscode.Range(openPos, openPos.translate(0, 1)));
            // Insert the opening delimiter after the first expression
            editBuilder.insert(insertPosition, text[openDelimiterPos]);
          });
        }
      }
    }
  }
  
  /**
   * Splice: Remove surrounding delimiters but keep the content
   */
  function splice(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    
    const document = editor.document;
    if (document.languageId !== 'hql') {
      return;
    }
    
    // Find the current expression's delimiters
    const position = editor.selection.active;
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Find the surrounding delimiters
    let openDelimiterPos = -1;
    let closeDelimiterPos = -1;
    let depth = 0;
    
    // First, find the opening delimiter
    for (let i = offset; i >= 0; i--) {
      const char = text[i];
      if (char === ')' || char === ']' || char === '}') {
        depth++;
      } else if (char === '(' || char === '[' || char === '{') {
        depth--;
        if (depth < 0) {
          openDelimiterPos = i;
          break;
        }
      }
    }
    
    // Then find the matching closing delimiter
    if (openDelimiterPos >= 0) {
      depth = 0;
      for (let i = openDelimiterPos; i < text.length; i++) {
        const char = text[i];
        if (char === '(' || char === '[' || char === '{') {
          depth++;
        } else if (char === ')' || char === ']' || char === '}') {
          depth--;
          if (depth === 0) {
            closeDelimiterPos = i;
            break;
          }
        }
      }
    }
    
    // If we found both delimiters, splice the expression
    if (openDelimiterPos >= 0 && closeDelimiterPos >= 0) {
      const openPos = document.positionAt(openDelimiterPos);
      const closePos = document.positionAt(closeDelimiterPos);
      
      editor.edit(editBuilder => {
        // Delete the closing delimiter first (to maintain offsets)
        editBuilder.delete(new vscode.Range(closePos, closePos.translate(0, 1)));
        // Delete the opening delimiter
        editBuilder.delete(new vscode.Range(openPos, openPos.translate(0, 1)));
      });
    }
  }
  
  /**
   * Raise: Replace parent form with current form
   */
  function raise(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    
    const document = editor.document;
    if (document.languageId !== 'hql') {
      return;
    }
    
    // Find the current (inner) expression
    const position = editor.selection.active;
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Find the inner expression's delimiters
    let innerOpenPos = -1;
    let innerClosePos = -1;
    let innerDepth = 0;
    
    // First, find the opening delimiter of the inner expression
    for (let i = offset; i >= 0; i--) {
      const char = text[i];
      if (char === ')' || char === ']' || char === '}') {
        innerDepth++;
      } else if (char === '(' || char === '[' || char === '{') {
        innerDepth--;
        if (innerDepth < 0) {
          innerOpenPos = i;
          innerDepth = 0;
          break;
        }
      }
    }
    
    // Then find the matching closing delimiter of the inner expression
    if (innerOpenPos >= 0) {
      const innerOpenChar = text[innerOpenPos];
      const innerCloseChar = getMatchingDelimiter(innerOpenChar);
      
      for (let i = innerOpenPos + 1; i < text.length; i++) {
        const char = text[i];
        if (char === innerOpenChar) {
          innerDepth++;
        } else if (char === innerCloseChar) {
          if (innerDepth === 0) {
            innerClosePos = i;
            break;
          }
          innerDepth--;
        }
      }
    }
    
    // If we found both delimiters of the inner expression, find the outer expression
    if (innerOpenPos >= 0 && innerClosePos >= 0) {
      // Find the outer expression's delimiters
      let outerOpenPos = -1;
      let outerClosePos = -1;
      let outerDepth = 0;
      
      // First, find the opening delimiter of the outer expression
      for (let i = innerOpenPos - 1; i >= 0; i--) {
        const char = text[i];
        if (char === ')' || char === ']' || char === '}') {
          outerDepth++;
        } else if (char === '(' || char === '[' || char === '{') {
          outerDepth--;
          if (outerDepth < 0) {
            outerOpenPos = i;
            outerDepth = 0;
            break;
          }
        }
      }
      
      // Then find the matching closing delimiter of the outer expression
      if (outerOpenPos >= 0) {
        const outerOpenChar = text[outerOpenPos];
        const outerCloseChar = getMatchingDelimiter(outerOpenChar);
        
        for (let i = outerOpenPos + 1; i < text.length; i++) {
          const char = text[i];
          if (char === outerOpenChar) {
            outerDepth++;
          } else if (char === outerCloseChar) {
            if (outerDepth === 0) {
              outerClosePos = i;
              break;
            }
            outerDepth--;
          }
        }
      }
      
      // If we found both delimiters of the outer expression, raise the inner expression
      if (outerOpenPos >= 0 && outerClosePos >= 0) {
        const innerExpr = text.substring(innerOpenPos, innerClosePos + 1);
        const outerOpenPos2 = document.positionAt(outerOpenPos);
        const outerClosePos2 = document.positionAt(outerClosePos + 1);
        
        editor.edit(editBuilder => {
          // Replace the entire outer expression with the inner expression
          editBuilder.replace(new vscode.Range(outerOpenPos2, outerClosePos2), innerExpr);
        });
      }
    }