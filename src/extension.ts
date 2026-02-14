import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Get configuration
function getConfig() {
  return vscode.workspace.getConfiguration('devkb');
}

function getApiUrl(): string {
  return getConfig().get('apiUrl') || 'http://localhost:3001';
}

function getDataDir(): string {
  return getConfig().get('dataDir') || '.devkb';
}

// API helper
async function apiRequest(method: string, endpoint: string, data?: any): Promise<any> {
  const url = `${getApiUrl()}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: data ? JSON.stringify(data) : undefined
    });
    
    return await response.json();
  } catch (error) {
    vscode.window.showErrorMessage(`DevKB API error: ${error}`);
    return null;
  }
}

// Command: Ask a question
async function askQuestion() {
  const question = await vscode.window.showInputBox({
    prompt: 'Ask a question about your codebase',
    placeHolder: 'e.g., How do we handle authentication?'
  });
  
  if (!question) return;
  
  const result = await apiRequest('POST', '/api/ask', { question });
  
  if (result && result.success) {
    const answer = result.data.answer;
    
    // Show answer in a new document
    const doc = await vscode.workspace.openTextDocument({
      content: `# Question: ${question}\n\n## Answer\n${answer}`,
      language: 'markdown'
    });
    
    await vscode.window.showTextDocument(doc);
  } else {
    vscode.window.showWarningMessage('Could not get an answer. Make sure the API server is running.');
  }
}

// Command: Search knowledge base
async function search() {
  const query = await vscode.window.showInputBox({
    prompt: 'Search the knowledge base',
    placeHolder: 'Enter search terms...'
  });
  
  if (!query) return;
  
  const result = await apiRequest('GET', `/api/search?q=${encodeURIComponent(query)}`);
  
  if (result && result.success && result.data.length > 0) {
    interface QuickPickItem extends vscode.QuickPickItem {
      entry: any;
    }
    
    const items: QuickPickItem[] = result.data.map((entry: any) => ({
      label: entry.title,
      description: entry.type,
      detail: entry.content.substring(0, 100) + '...',
      entry
    }));
    
    const selected = await vscode.window.showQuickPick(items, {
      matchOnDescription: true,
      matchOnDetail: true
    });
    
    if (selected && selected.entry) {
      const doc = await vscode.workspace.openTextDocument({
        content: `# ${selected.entry.title}\n\n**Type:** ${selected.entry.type}\n**Tags:** ${selected.entry.tags.join(', ')}\n\n---\n\n${selected.entry.content}`,
        language: 'markdown'
      });
      
      await vscode.window.showTextDocument(doc);
    }
  } else {
    vscode.window.showInformationMessage('No results found.');
  }
}

// Command: Add knowledge entry
async function addEntry() {
  const editor = vscode.window.activeTextEditor;
  const selection = editor?.selection;
  const selectedText = editor?.document.getText(selection);
  
  const type = await vscode.window.showQuickPick(
    ['code', 'documentation', 'decision', 'conversation', 'architecture', 'process'],
    { placeHolder: 'Select entry type' }
  );
  
  if (!type) return;
  
  const title = await vscode.window.showInputBox({
    prompt: 'Enter entry title',
    placeHolder: 'e.g., Authentication Flow'
  });
  
  if (!title) return;
  
  let content = await vscode.window.showInputBox({
    prompt: 'Enter entry content',
    placeHolder: selectedText || 'Enter the knowledge content...'
  });
  
  if (!content && !selectedText) {
    vscode.window.showWarningMessage('Content is required');
    return;
  }
  
  content = content || selectedText || '';
  
  const tags = await vscode.window.showInputBox({
    prompt: 'Enter tags (comma-separated)',
    placeHolder: 'e.g., auth, security, jwt'
  });
  
  const result = await apiRequest('POST', '/api/entries', {
    type,
    title,
    content,
    tags: tags ? tags.split(',').map(t => t.trim()) : [],
    source: 'vscode'
  });
  
  if (result && result.success) {
    vscode.window.showInformationMessage(`Entry "${title}" created successfully!`);
  } else {
    vscode.window.showErrorMessage('Failed to create entry');
  }
}

// Command: Index current project
async function indexProject() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage('No workspace folder open');
    return;
  }
  
  const folder = workspaceFolders[0];
  const dataDir = path.join(folder.uri.fsPath, getDataDir());
  
  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Index files in the workspace
  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, '**/*'),
    new vscode.RelativePattern(folder, '**/node_modules/**')
  );
  
  vscode.window.showInformationMessage(`Found ${files.length} files to index`);
  
  // For now, just show a message - full indexing would be done by CLI
  vscode.window.showInformationMessage(
    'Use the DevKB CLI to index: devkb index'
  );
}

// Command: Show statistics
async function showStats() {
  const result = await apiRequest('GET', '/api/stats');
  
  if (result && result.success) {
    const stats = result.data;
    const message = [
      `Total Entries: ${stats.totalEntries}`,
      `Unique Tags: ${stats.totalTags}`,
      `Searches: ${stats.searchHistoryCount}`,
      '',
      'By Type:',
      ...Object.entries(stats.byType).map(([type, count]) => `  ${type}: ${count}`)
    ].join('\n');
    
    vscode.window.showInformationMessage(message);
  } else {
    vscode.window.showWarningMessage('Could not load statistics');
  }
}

// Activate extension
export function activate(context: vscode.ExtensionContext) {
  console.log('DevKB extension activated');
  
  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('devkb.ask', askQuestion),
    vscode.commands.registerCommand('devkb.search', search),
    vscode.commands.registerCommand('devkb.addEntry', addEntry),
    vscode.commands.registerCommand('devkb.index', indexProject),
    vscode.commands.registerCommand('devkb.stats', showStats)
  );
}

// Deactivate extension
export function deactivate() {
  console.log('DevKB extension deactivated');
}
