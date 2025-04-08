# HQL Snippets and Tab Navigation

## Tab Navigation in Snippets

HQL provides smart snippets for common patterns like function definitions, imports, exports, and more. For the best developer experience, make sure VS Code's tab navigation is configured correctly.

### Issue: Tab Not Moving to Next Placeholder

If you experience problems where pressing TAB doesn't move to the next placeholder in a snippet (like when you insert a function definition), you need to update your VS Code settings.

### Solution

1. Open VS Code Settings (File > Preferences > Settings or Cmd/Ctrl+,)
2. Search for "tab completion"
3. Set "Editor: Tab Completion" to "on"

This setting ensures that pressing Tab will:
- Navigate between snippet placeholders
- Move the cursor to the next placeholders in the correct order
- Allow you to quickly fill in template code

## Available Snippets

HQL offers many convenient snippets for common code patterns:

- **Function definitions**: `fn`, `fx`
- **Imports**: `import-ns`, `import-sym`
- **Exports**: `export`
- **Control flow**: `if`, `loop`, `cond`
- **Data structures**: `enum`, `class`
- **And many more!**

## Example Usage

1. Type `fn` and select the snippet
2. Press Enter to insert the function template
3. The cursor will be positioned at the function name placeholder
4. Press Tab to move to the parameter list
5. Press Tab again to move to the function body

## Troubleshooting

If tab navigation still doesn't work after changing the setting:

1. Make sure you've saved the settings change
2. Restart VS Code
3. Check that you don't have a keyboard shortcut conflict with Tab 
4. Verify the setting is applied in your workspace

For further assistance, please file an issue on the HQL GitHub repository. 