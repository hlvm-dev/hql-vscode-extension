# HQL Language Server Protocol (LSP) Extension

This document outlines how to use, test, and publish the HQL Language Server Protocol (LSP) extension for Visual Studio Code.

## Features

The HQL LSP extension provides:

1. **Syntax Highlighting**: Proper coloring for HQL code elements
2. **Code Completion**: Suggestions for built-in forms and user-defined symbols
3. **Inline Evaluation**: Evaluate HQL expressions and see results inline
4. **nREPL Integration**: Connect to a running HQL REPL server
5. **Error Diagnostics**: Real-time syntax checking and error reporting
6. **Code Actions**: Quick fixes for common issues like unmatched parentheses
7. **Code Formatting**: Auto-format HQL code with proper indentation
8. **Outline View**: Structure view showing functions, classes, and enums

## Using the Extension

### Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X or Cmd+Shift+X)
3. Search for "HQL"
4. Click "Install"

### Basic Usage

1. Create or open a file with the `.hql` extension
2. Start writing HQL code
3. Use shortcut keys to evaluate expressions (see below)

### Evaluation Shortcuts

- **Cmd+Enter** (macOS) / **Ctrl+Enter** (Windows/Linux): Evaluate the outermost expression containing the cursor
- **Cmd+Ctrl+Enter** (macOS) / **Ctrl+Alt+Enter** (Windows/Linux): Evaluate the current expression under the cursor
- **Escape**: Cancel all active evaluations

### nREPL Server

Before evaluating code, you need a running HQL REPL server:

1. **Start Server**: Run the command "HQL: Start REPL Server" from the command palette (Cmd+Shift+P or Ctrl+Shift+P)
2. **Stop Server**: Run "HQL: Stop REPL Server"
3. **Restart Server**: Run "HQL: Restart REPL Server"

You can also configure the server to start automatically in the extension settings.

### Other Commands

- **HQL: Extract to Variable**: Extracts selected code to a variable (also available in context menu)
- **HQL: Fix Unmatched Parentheses**: Automatically fixes unbalanced parentheses
- **HQL: Format Document**: Formats the current document (also available via Shift+Alt+F)

## Development

### Setting Up Development Environment

1. Clone the repository
2. Run `npm install` to install dependencies
3. Open the project in VS Code

### Testing the Extension

VS Code provides a convenient way to test extensions:

1. Press F5 to start the extension in debug mode
2. A new VS Code window will open with the extension loaded
3. Open or create a `.hql` file
4. Test features like syntax highlighting, completion, and evaluation

### Running Tests

1. Unit tests: `npm run test:unit`
2. Integration tests: `npm test`

### Debugging

The extension includes configuration for debugging both the extension and the language server:

1. Use the "Launch Extension" configuration to debug the extension
2. Use the "Attach to Language Server" configuration to debug the language server

## Publishing

### Preparing for Publication

1. Update the version in `package.json`
2. Ensure all tests pass
3. Update the README with any new features

### Publishing to VS Code Marketplace

1. Install `vsce` if you haven't: `npm install -g vsce`
2. Login: `vsce login publisher-name`
3. Package: `vsce package`
4. Publish: `vsce publish`

### Publishing to Open VSX Registry (for VS Codium)

1. Login: `npx ovsx create-namespace publisher-name`
2. Publish: `npx ovsx publish`

Architecture
The HQL LSP extension consists of several key components:

Extension Host: Runs in the VS Code process, registers commands, and activates the language server
Language Server: Runs in a separate process, handles language features
nREPL Client: Communicates with the HQL REPL server for evaluation
UI Decorations: Manages visual elements for evaluation results

Component Diagram
Copy┌─────────────────────────────────────┐     ┌─────────────────────────┐
│                                     │     │                         │
│            VS Code                  │     │      HQL REPL Server    │
│  ┌─────────────────────────────┐    │     │                         │
│  │       Extension Host        │    │     │  ┌─────────────────┐    │
│  │                             │    │     │  │                 │    │
│  │  ┌───────────┐ ┌─────────┐ │    │     │  │  Evaluation     │    │
│  │  │ Commands  │ │   UI    │ │    │     │  │  Engine         │    │
│  │  └───────────┘ └─────────┘ │    │     │  │                 │    │
│  │        │            ▲      │    │     │  └─────────────────┘    │
│  │        ▼            │      │    │     │           ▲             │
│  │  ┌──────────────────┴───┐  │    │     │           │             │
│  │  │ nREPL Client         │◄─┼────┼─────┼───────────┘             │
│  │  └──────────────────────┘  │    │     │                         │
│  │                             │    │     │                         │
│  └──────────┬──────────────▲──┘    │     └─────────────────────────┘
│             │              │       │
│  ┌──────────▼──────────────┴──┐    │
│  │      Language Server        │    │
│  │                             │    │
│  │  ┌───────────┐ ┌─────────┐  │    │
│  │  │  Parser   │ │Analyzer │  │    │
│  │  └───────────┘ └─────────┘  │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
Data Flow

User writes code in VS Code editor
Language Server analyzes code and provides intellisense, diagnostics
User triggers evaluation with shortcut
Extension Host identifies expression to evaluate
nREPL Client sends code to HQL REPL Server
Server evaluates code and returns result
UI Decorations display result inline in editor

Troubleshooting
Common Issues

Server Not Starting

Check if the server executable is installed correctly
Verify if another process is using the same port
Check the Server Output panel for error messages


Evaluation Not Working

Ensure the server is running (check status in VS Code status bar)
Check if the code has syntax errors
Verify network connectivity to the server


Syntax Highlighting Issues

Try reloading the window (Developer: Reload Window command)
Check if the language ID is correctly set to "hql"
Verify the file extension is ".hql"



Logs
To access logs:

Open the Output panel (View > Output)
Select "HQL Language Server" from the dropdown
For server logs, select "HQL REPL Server"

Advanced Configuration
The extension provides several configuration options:
Server Configuration
jsonCopy"hql.server.url": "http://localhost:5100",
"hql.server.autoStart": false,
Editor Configuration
jsonCopy"hql.format.indentSize": 2,
"hql.format.alignParameters": true,
"hql.evaluation.showInline": true,
"hql.evaluation.timeout": 10000,
Supported HQL Features
The LSP supports the following HQL language features:
Types & Expressions

Basic literals: strings, numbers, booleans, nil
Data structures: vectors, maps, sets
Functions: fn and fx (typed functions)
Enums with cases and associated values
Classes with methods and fields

Control Flow

Conditional forms: if, cond
Loop and recur constructs
Let and var bindings

Modern Features

Dot notation for method calls (object.method(...))
Method chaining (object.method1().method2())
Array type notation ([Type])
Named parameters (function arg1: val1 arg2: val2)

Contributing
Contributions are welcome! Please see CONTRIBUTING.md for details.
License
This project is licensed under the MIT License - see the LICENSE file for details.