import * as vscode from 'vscode';
import * as cp from 'child_process';
import { isServerAlive } from './client';

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
 * Start the HQL REPL server
 */
export async function startServer(): Promise<boolean> {
  // Don't start if already running
  if (await isServerRunning()) {
    vscode.window.showInformationMessage('HQL REPL server is already running');
    return true;
  }
  
  try {
    const outputChannel = vscode.window.createOutputChannel('HQL REPL Server');
    outputChannel.show();
    outputChannel.appendLine('Starting HQL REPL server...');
    
    // Get server executable path - this would need to be configured or bundled
    const serverExecutable = findServerExecutable();
    if (!serverExecutable) {
      vscode.window.showErrorMessage('Could not find HQL REPL server executable');
      return false;
    }
    
    // Get server port from URL
    const serverUrl = new URL(getServerUrl());
    const port = serverUrl.port || '5100';
    
    // Start the server process
    const childProcess = cp.spawn(serverExecutable, ['--port', port], {
      cwd: require('path').dirname(serverExecutable),
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
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      if (await isServerAlive(getServerUrl())) {
        vscode.window.showInformationMessage('HQL REPL server started successfully');
        return true;
      }
      
      // Wait a bit before trying again
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    
    // If we get here, the server didn't start in time
    vscode.window.showErrorMessage('HQL REPL server did not start in time');
    await stopServer(); // Clean up
    return false;
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to start HQL REPL server: ${error}`);
    return false;
  }
}

/**
 * Stop the HQL REPL server
 */
export async function stopServer(): Promise<boolean> {
  if (!serverProcess) {
    vscode.window.showInformationMessage('No HQL REPL server is running');
    return true;
  }
  
  try {
    serverProcess.outputChannel.appendLine('Stopping HQL REPL server...');
    
    // Try graceful shutdown first
    serverProcess.process.kill('SIGTERM');
    
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
    vscode.window.showErrorMessage(`Failed to stop HQL REPL server: ${error}`);
    return false;
  }
}

/**
 * Restart the HQL REPL server
 */
export async function restartServer(): Promise<boolean> {
  await stopServer();
  return await startServer();
}

/**
 * Find the server executable on the system
 */
function findServerExecutable(): string | null {
  // This would need to be adapted based on how the server is packaged/installed
  // For now, we'll return a dummy path or look for environment variables
  
  // Check for environment variable
  const envPath = process.env.HQL_SERVER_PATH;
  if (envPath) {
    return envPath;
  }
  
  // For demo purposes - this would need to be replaced with actual logic
  if (process.platform === 'darwin') {
    return '/usr/local/bin/hql-server';
  } else if (process.platform === 'win32') {
    return 'C:\\Program Files\\HQL\\hql-server.exe';
  } else {
    return '/usr/bin/hql-server';
  }
}