import {
  TextDocument,
  TextEdit,
  Range,
  Position
} from 'vscode-languageserver';

/**
 * Formatter for HQL code that balances parentheses and reindents
 */
export class HqlFormatter {
  /**
   * Balance parentheses in a document
   */
  public balanceParentheses(document: TextDocument): TextEdit[] {
    const text = document.getText();
    const edits: TextEdit[] = [];
    
    // Simple approach: track positions of all brackets and identify unmatched ones
    const openBrackets: { char: string, offset: number }[] = [];
    const unmatchedClosing: number[] = [];
    
    // First pass: find all unmatched brackets
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Skip any character in a string or comment
      if (this.isInStringOrComment(text, i)) {
        continue;
      }
      
      if (char === '(' || char === '[' || char === '{') {
        openBrackets.push({ char, offset: i });
      } else if (char === ')' || char === ']' || char === '}') {
        const matchingChar = char === ')' ? '(' : (char === ']' ? '[' : '{');
        
        if (openBrackets.length > 0 && openBrackets[openBrackets.length - 1].char === matchingChar) {
          // Matched pair - pop the opening bracket
          openBrackets.pop();
        } else {
          // This is an unmatched closing bracket - mark for removal
          unmatchedClosing.push(i);
        }
      }
    }
    
    // Handle unmatched closing brackets first (delete them)
    if (unmatchedClosing.length > 0) {
      // Process them in reverse order to avoid position changes
      unmatchedClosing.sort((a, b) => b - a);
      
      for (const offset of unmatchedClosing) {
        const pos = document.positionAt(offset);
        edits.push(TextEdit.replace(
          Range.create(pos, document.positionAt(offset + 1)),
          ''
        ));
      }
      
      console.log(`Found ${unmatchedClosing.length} unmatched closing brackets to remove`);
      return edits;
    }
    
    // Then add closing brackets for any unmatched opening ones
    if (openBrackets.length > 0) {
      const endPos = document.positionAt(text.length);
      
      // Add closings in reverse order of openings
      for (let i = openBrackets.length - 1; i >= 0; i--) {
        const item = openBrackets[i];
        const closingChar = item.char === '(' ? ')' : (item.char === '[' ? ']' : '}');
        edits.push(TextEdit.insert(endPos, closingChar));
      }
      
      console.log(`Added ${openBrackets.length} closing brackets`);
    }
    
    return edits;
  }
  
  /**
   * Helper to check if a character is in a string or comment
   */
  private isInStringOrComment(text: string, position: number): boolean {
    let inString = false;
    let inComment = false;
    
    for (let i = 0; i < position; i++) {
      const char = text[i];
      
      // Toggle string state on double quotes (not in comments)
      if (char === '"' && !inComment) {
        inString = !inString;
      }
      
      // Start comment if semicolon outside string
      if (char === ';' && !inString) {
        inComment = true;
      }
      
      // End comment at newline
      if ((char === '\n' || char === '\r') && inComment) {
        inComment = false;
      }
    }
    
    return inString || inComment;
  }
  
  /**
   * Reindent an HQL document
   */
  public reindentDocument(document: TextDocument): TextEdit[] {
    const text = document.getText();
    const edits: TextEdit[] = [];
    const lines = text.split('\n');
    
    let indentLevel = 0;
    let formattedLines: string[] = [];
    
    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length === 0) {
        formattedLines.push('');
        continue;
      }
      
      // Count opening and closing delimiters
      let openCount = 0;
      let closeCount = 0;
      let inString = false;
      let inComment = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        
        // Skip string contents
        if (char === '"' && !inComment) {
          inString = !inString;
          continue;
        }
        
        // Skip comments
        if (char === ';' && !inString) {
          inComment = true;
          continue;
        }
        
        // Skip if inside string or comment
        if (inString || inComment) continue;
        
        if ('([{'.includes(char)) openCount++;
        if (')]}'.includes(char)) closeCount++;
      }
      
      // Determine indent for this line
      const indent = '  '.repeat(Math.max(0, indentLevel));
      formattedLines.push(indent + line);
      
      // Update indent level for next line
      indentLevel += openCount - closeCount;
    }
    
    // Create one edit to replace the entire document
    edits.push(TextEdit.replace(
      Range.create(
        Position.create(0, 0),
        document.positionAt(document.getText().length)
      ),
      formattedLines.join('\n')
    ));
    
    return edits;
  }
  
  /**
   * Format the document (balance and reindent)
   */
  public formatDocument(document: TextDocument): TextEdit[] {
    // First balance parentheses
    const balanceEdits = this.balanceParentheses(document);
    
    // If there are balance edits needed, apply them first
    if (balanceEdits.length > 0) {
      return balanceEdits;
    }
    
    // Then reindent
    return this.reindentDocument(document);
  }
} 