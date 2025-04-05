import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { isServerAlive } from './client';
import { Logger, LogLevel } from './logger';

// Create a logger
const logger = new Logger(false, LogLevel.INFO);

interface ServerProcess {
  process: cp.ChildProcess;
  outputChannel: vscode.OutputChannel;
}

// Keep track of the server process
let serverProcess: ServerProcess | null = null;

/**
 * Get the URL of the HQL REPL server from settings
 */
export function getServerUrl(): string {
  return vscode.workspace.getConfiguration('hql').get<string>('server.url', 'http://localhost:5100');
}

/**
 * Check if the REPL server is currently running
 */
export async function isServerRunning(): Promise<boolean> {
  // First check if we have a local process
  if (serverProcess && !serverProcess.process.killed) {
    return true;
  }
  
  // Then check if server responds at the URL
  return await isServerAlive(getServerUrl());
}

/**
 * Find the server executable on the system
 */
function findServerExecutable(): string | null {
  // Try different strategies to find the executable
  
  // 1. Check for environment variable
  const envPath = process.env.HQL_SERVER_PATH;
  if (envPath && isExecutableAt(envPath)) {
    return envPath;
  }
  
  // 2. Check configuration setting
  const configPath = vscode.workspace.getConfiguration('hql').get<string>('server.path');
  if (configPath && isExecutableAt(configPath)) {
    return configPath;
  }
  
  // 3. Check for installed server in common locations
  const commonLocations = getCommonServerLocations();
  for (const location of commonLocations) {
    if (isExecutableAt(location)) {
      return location;
    }
  }
  
  // 4. Ask the user to locate the executable
  return null;
}

/**
 * Check if a file exists and is executable
 */
function isExecutableAt(filePath: string): boolean {
  try {
    // Check if the file exists
    const fs = require('fs');
    const stats = fs.statSync(filePath);
    
    // On Windows, any file can be executed
    if (process.platform === 'win32') {
      return stats.isFile();
    }
    
    // On Unix-like systems, check if the file is executable by the current user
    return stats.isFile() && (stats.mode & 0o100) !== 0;
  } catch (error) {
    return false;
  }
}

/**
 * Get common locations where the server executable might be installed
 */
function getCommonServerLocations(): string[] {
  const locations: string[] = [];
  
  if (process.platform === 'win32') {
    // Windows
    locations.push(
      path.join('C:\\Program Files\\HQL\\hql-server.exe'),
      path.join('C:\\Program Files (x86)\\HQL\\hql-server.exe'),
      path.join(os.homedir(), 'AppData\\Local\\HQL\\hql-server.exe'),
      path.join(os.homedir(), '.hql\\hql-server.exe')
    );
  } else if (process.platform === 'darwin') {
    // macOS
    locations.push(
      '/usr/local/bin/hql-server',
      '/opt/homebrew/bin/hql-server',
      path.join(os.homedir(), '.hql/bin/hql-server')
    );
  } else {
    // Linux
    locations.push(
      '/usr/bin/hql-server',
      '/usr/local/bin/hql-server',
      path.join(os.homedir(), '.hql/bin/hql-server')
    );
  }
  
  return locations;
}

/**
 * Start the HQL REPL server
 */
export async function startServer(): Promise<boolean> {
  logger.info('Starting HQL REPL server...');
  
  // Don't start if already running
  if (await isServerRunning()) {
    vscode.window.showInformationMessage('HQL REPL server is already running');
    return true;
  }
  
  try {
    const outputChannel = vscode.window.createOutputChannel('HQL REPL Server');
    outputChannel.show();
    outputChannel.appendLine('Starting HQL REPL server...');
    
    // Get server executable path
    let serverExecutable = findServerExecutable();
    
    if (!serverExecutable) {
      // Ask the user to provide the executable path
      const result = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: 'Select HQL Server Executable',
        filters: {
          'Executables': process.platform === 'win32' ? ['exe'] : ['*']
        }
      });
      
      if (result && result.length > 0) {
        serverExecutable = result[0].fsPath;
        
        // Save this path for future use
        vscode.workspace.getConfiguration('hql').update('server.path', serverExecutable, true);
      } else {
        outputChannel.appendLine('No server executable selected');
        vscode.window.showErrorMessage('HQL REPL server executable not found');
        return false;
      }
    }
    
    // Get server port from URL
    const serverUrl = new URL(getServerUrl());
    const port = serverUrl.port || '5100';
    
    // Get timeout from settings
    const timeout = vscode.workspace.getConfiguration('hql').get<number>('server.startTimeout', 10000);
    
    // Start the server process
    outputChannel.appendLine(`Starting server from: ${serverExecutable}`);
    outputChannel.appendLine(`Using port: ${port}`);
    
    const childProcess = cp.spawn(serverExecutable, ['--port', port], {
      cwd: path.dirname(serverExecutable),
      stdio: 'pipe',
      shell: process.platform === 'win32'
    });
    
    // Handle output
    childProcess.stdout?.on('data', (data: Buffer) => {
      outputChannel.append(data.toString());
    });
    
    childProcess.stderr?.on('data', (data: Buffer) => {
      outputChannel.append(data.toString());
    });
    
    // Handle process exit
    childProcess.on('exit', (code: number | null) => {
      if (code !== 0) {
        outputChannel.appendLine(`Server exited with code ${code}`);
        vscode.window.showErrorMessage(`HQL REPL server exited with code ${code}`);
      } else {
        outputChannel.appendLine('Server stopped');
      }
      
      if (serverProcess && serverProcess.process === childProcess) {
        serverProcess = null;
      }
    });
    
    // Store the process
    serverProcess = { process: childProcess, outputChannel };
    
    // Wait for the server to start up
    let attempts = 0;
    const maxAttempts = Math.ceil(timeout / 500);
    
    while (attempts < maxAttempts) {
      if (await isServerAlive(getServerUrl())) {
        outputChannel.appendLine('Server started successfully');
        vscode.window.showInformationMessage('HQL REPL server started successfully');
        return true;
      }
      
      // Wait a bit before trying again
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
      
      if (attempts % 2 === 0) {
        outputChannel.appendLine(`Waiting for server to start (${attempts * 500}ms)...`);
      }
    }
    
    // If we get here, the server didn't start in time
    outputChannel.appendLine('Server did not start in time');
    vscode.window.showErrorMessage('HQL REPL server did not start in time');
    await stopServer(); // Clean up
    return false;
  } catch (error) {
    logger.error(`Failed to start HQL REPL server: ${error}`);
    vscode.window.showErrorMessage(`Failed to start HQL REPL server: ${error}`);
    return false;
  }
}

/**
 * Stop the HQL REPL server
 */
export async function stopServer(): Promise<boolean> {
  logger.info('Stopping HQL REPL server...');
  
  if (!serverProcess) {
    vscode.window.showInformationMessage('No HQL REPL server is running');
    return true;
  }
  
  try {
    serverProcess.outputChannel.appendLine('Stopping HQL REPL server...');
    
    // Try graceful shutdown first via HTTP request
    try {
      const response = await fetch(`${getServerUrl()}/shutdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'shutdown' })
      });
      
      if (response.ok) {
        serverProcess.outputChannel.appendLine('Server shutdown request successful');
        
        // Wait a bit for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // If the server is still running, force kill it
        if (!serverProcess.process.killed) {
          serverProcess.process.kill('SIGTERM');
        }
      } else {
        // If HTTP shutdown fails, try to kill the process
        serverProcess.process.kill('SIGTERM');
      }
    } catch (err) {
      // If HTTP shutdown fails, try to kill the process
      serverProcess.process.kill('SIGTERM');
    }
    
    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Force kill if still running
    if (!serverProcess.process.killed) {
      serverProcess.process.kill('SIGKILL');
    }
    
    serverProcess.outputChannel.appendLine('HQL REPL server stopped');
    serverProcess = null;
    
    vscode.window.showInformationMessage('HQL REPL server has been stopped');
    return true;
  } catch (error) {
    logger.error(`Failed to stop HQL REPL server: ${error}`);
    vscode.window.showErrorMessage(`Failed to stop HQL REPL server: ${error}`);
    return false;
  }
}

/**
 * Restart the HQL REPL server
 */
export async function restartServer(): Promise<boolean> {
  logger.info('Restarting HQL REPL server...');
  
  await stopServer();
  return await startServer();
}