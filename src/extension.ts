'use strict'

import * as vscode from 'vscode'
import { isRathenaHeader } from './rathena'
import { initializeDecorations, disposeDecorations } from './colorDecorations'

function associateFile (doc: vscode.TextDocument): void {
  if (isRathenaHeader(doc.lineAt(0).text)) {
    vscode.languages.setTextDocumentLanguage(doc, 'rathena')
  }
}

// Function to wrap selected text with color codes
function wrapWithColorCodes (editor: vscode.TextEditor): void {
  const defaultColor = 'ff0000' // Default red color
  const selections = editor.selections

  editor.edit(editBuilder => {
    for (const selection of selections) {
      if (!selection.isEmpty) {
        const text = editor.document.getText(selection)
        const wrappedText = `^${defaultColor}${text}^000000` // Add color and reset code
        editBuilder.replace(selection, wrappedText)
      }
    }
  })
}

export function activate (context: vscode.ExtensionContext): void {
  for (const doc of vscode.workspace.textDocuments) {
    associateFile(doc)
  }

  // Register the wrap with color codes command
  const disposable = vscode.commands.registerTextEditorCommand(
    'rathena.wrapWithColorCodes',
    wrapWithColorCodes
  )
  context.subscriptions.push(disposable)

  // Also associate file on open and save
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(associateFile))
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(associateFile))

  // Initialize color decorations support
  initializeDecorations(context)
}

export function deactivate (): void {
  // Clean up color decorations
  disposeDecorations()
}
