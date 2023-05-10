'use strict'

import * as vscode from 'vscode'
import { isRathenaHeader } from './rathena'

function associateFile (doc: vscode.TextDocument): void {
  if (isRathenaHeader(doc.lineAt(0).text)) {
    vscode.languages.setTextDocumentLanguage(doc, 'rathena')
  }
}

export function activate (context: vscode.ExtensionContext): void {
  for (const doc of vscode.workspace.textDocuments) {
    associateFile(doc)
  }

  // Also associate file on open and save
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(associateFile))
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(associateFile))
}

export function deactivate (): void {}
