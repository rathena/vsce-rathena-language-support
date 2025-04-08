'use strict'

import * as vscode from 'vscode'
import { ColorInformation, Color } from 'vscode'

// Map to store COLOR decoration types by hex color
const colorDecorationTypes = new Map<string, vscode.TextEditorDecorationType>()
// Decoration type to HIDE the ^xxxxxx codes
const hiddenCodeDecorationType = vscode.window.createTextEditorDecorationType({
  // Try to collapse the space and make it invisible
  letterSpacing: '-.54em', // Approx. 7ch wide (try to match ^xxxxxx)
  opacity: '0', // Make invisible
  // Ensure it doesn't affect surrounding text (if possible)
  textDecoration: 'none; display: inline-block; width: 0;' // No trailing comma!
})

// Store range info per document for Hover/CodeActions
const documentColorInfos = new Map<string, Array<{ codeRange: vscode.Range, textRange: vscode.Range, colorHex: string }>>()

// --- Global variable for currently visible code ranges ---
let visibleCodeRanges: vscode.Range[] = [] // Can have 0, 1, or 2 ranges

// Function to get or create a decoration type for a color
function getColorDecorationType (hexColor: string): vscode.TextEditorDecorationType {
  const color = `#${hexColor}`
  // We'll use 'inherit' for ^000000 so it takes the default theme color
  if (hexColor === '000000') {
    const existingReset = colorDecorationTypes.get('reset')
    if (existingReset !== undefined) {
      return existingReset
    }
    // Use an 'empty' style for reset, it doesn't apply its own color.
    const resetType = vscode.window.createTextEditorDecorationType({})
    colorDecorationTypes.set('reset', resetType)
    return resetType
  }

  const existingType = colorDecorationTypes.get(color)
  if (existingType !== undefined) {
    return existingType
  }

  const decorationType = vscode.window.createTextEditorDecorationType({
    color // Apply the color to the text
  })

  colorDecorationTypes.set(color, decorationType)
  return decorationType
}

// Regex to find color codes ^xxxxxx
const colorCodeRegex = /\^([0-9a-fA-F]{6})/g

// --- Helper to compare range arrays (ignoring order) ---
function areRangeArraysEqual (arr1: vscode.Range[], arr2: vscode.Range[]): boolean {
  if (arr1.length !== arr2.length) {
    return false
  }
  // Check if all ranges in arr1 are in arr2 and vice versa
  const arr1Set = new Set(arr1.map(r => `${r.start.line},${r.start.character}-${r.end.line},${r.end.character}`))
  const arr2Set = new Set(arr2.map(r => `${r.start.line},${r.start.character}-${r.end.line},${r.end.character}`))
  if (arr1Set.size !== arr2Set.size) return false // Different number of unique ranges
  for (const item of arr1Set) {
    if (!arr2Set.has(item)) return false
  }
  return true
}

// Get configuration settings
function getConfiguration<T> (setting: string): T {
  const value = vscode.workspace.getConfiguration('rathena').get<T>(setting)
  return value === undefined ? false as T : value
}

// --- Modify updateDecorations ---
function updateDecorations (editor: vscode.TextEditor | undefined): void {
  // If editor is invalid or not a rathena file, clear decorations
  if (editor === undefined || editor === null || editor.document.languageId !== 'rathena') {
    const docUriString = editor?.document?.uri?.toString()
    if (docUriString !== undefined) {
      documentColorInfos.delete(docUriString)
      if (editor !== undefined && editor !== null) {
        // Clear decorations for this specific editor if it exists but is not rathena
        editor.setDecorations(hiddenCodeDecorationType, [])
        colorDecorationTypes.forEach(type => { editor.setDecorations(type, []) })
      }
    }
    // Reset visible ranges if the editor is invalid or not rathena
    visibleCodeRanges = [] // Use empty array
    return
  }

  // Get configuration settings
  const renderColors = getConfiguration<boolean>('renderColors')
  const hideColorCodes = getConfiguration<boolean>('hideColorCodes') && renderColors // Only hide if both are true

  // If color rendering is disabled, clear decorations and exit
  if (!renderColors) {
    editor.setDecorations(hiddenCodeDecorationType, [])
    colorDecorationTypes.forEach(type => { editor.setDecorations(type, []) })
    return
  }

  // Proceed with decoration update for the valid rathena editor
  const doc = editor.document
  const text = doc.getText()
  const colorDecorationsMap = new Map<vscode.TextEditorDecorationType, vscode.DecorationOptions[]>()
  const hiddenCodeOptions: vscode.DecorationOptions[] = []
  const currentColorInfos: Array<{ codeRange: vscode.Range, textRange: vscode.Range, colorHex: string }> = []
  let match; let lastIndex = 0; let currentColorHex = '000000' // Default to theme color - IMPORTANT: Tracks color *before* the current match

  while ((match = colorCodeRegex.exec(text)) !== null) {
    const codeStartIndex = match.index
    const codeEndIndex = colorCodeRegex.lastIndex
    const hexColor = match[1] // The hex code of the *current* match

    // 1. Apply PREVIOUS color to the text between the last code and this one
    if (codeStartIndex > lastIndex) {
      const textRange = new vscode.Range(doc.positionAt(lastIndex), doc.positionAt(codeStartIndex))
      // Only apply decoration if it's not the reset color (^000000)
      if (currentColorHex !== '000000') {
        const decorationType = getColorDecorationType(currentColorHex)
        let options = colorDecorationsMap.get(decorationType)
        if (options === undefined) { options = []; colorDecorationsMap.set(decorationType, options) }
        options.push({ range: textRange })
      }
      // Update the text range of the previous color info entry
      if (currentColorInfos.length > 0) {
        const lastColorInfo = currentColorInfos[currentColorInfos.length - 1]
        // The text range starts right after the previous code and ends just before the current one
        lastColorInfo.textRange = new vscode.Range(doc.positionAt(doc.offsetAt(lastColorInfo.codeRange.end)), doc.positionAt(codeStartIndex))
      }
    }

    // 2. Decide whether to hide the current code ^xxxxxx
    const codeRange = new vscode.Range(doc.positionAt(codeStartIndex), doc.positionAt(codeEndIndex))
    const isCurrentCodeReset = hexColor === '000000' // Is the code we just matched ^000000?
    const isVisible = visibleCodeRanges.some(visibleRange => visibleRange.isEqual(codeRange)) // Is it explicitly visible due to cursor?

    // --- *** HIDING LOGIC *** ---
    let shouldHide = false
    if (hideColorCodes) { // Only hide if the setting is enabled
      if (!isVisible) { // Only hide if not explicitly visible
        if (!isCurrentCodeReset) {
          // Always hide non-reset codes by default
          shouldHide = true
        } else {
          // For reset codes (^000000), only hide if they're closing a color
          if (currentColorHex !== '000000') {
            shouldHide = true
          }
        }
      }
    }

    if (shouldHide) {
      hiddenCodeOptions.push({ range: codeRange })
    }
    // --- *** END HIDING LOGIC *** ---

    // 3. Store info for this code, affecting the text that FOLLOWS
    // Initially, the textRange is empty; it will be updated in the next iteration or at the end
    currentColorInfos.push({
      codeRange,
      textRange: new vscode.Range(doc.positionAt(codeEndIndex), doc.positionAt(codeEndIndex)), // Placeholder, starts right after the code
      colorHex: hexColor
    })

    // Update color and position for the next iteration
    currentColorHex = hexColor
    lastIndex = codeEndIndex // The next text segment starts AFTER this code
  }

  // 4. Apply the last color to the remaining text until the end of the document
  if (lastIndex < text.length) {
    const textRange = new vscode.Range(doc.positionAt(lastIndex), doc.positionAt(text.length))
    // Only apply decoration if it's not the reset color (^000000)
    if (currentColorHex !== '000000') {
      const decorationType = getColorDecorationType(currentColorHex)
      let options = colorDecorationsMap.get(decorationType)
      if (options === undefined) { options = []; colorDecorationsMap.set(decorationType, options) }
      options.push({ range: textRange })
    }
    // Update the textRange of the last colorInfo entry
    if (currentColorInfos.length > 0) {
      const lastColorInfo = currentColorInfos[currentColorInfos.length - 1]
      lastColorInfo.textRange = textRange // Starts after the last code, ends at doc end
    }
  }

  // Clear old decorations BEFORE applying new ones to prevent flickering
  editor.setDecorations(hiddenCodeDecorationType, []) // Clear hide decorations first
  colorDecorationTypes.forEach((type) => { editor.setDecorations(type, []) }) // Clear all color decorations

  // Apply new decorations
  editor.setDecorations(hiddenCodeDecorationType, hiddenCodeOptions) // Apply hide decorations (potentially without one or two)
  colorDecorationsMap.forEach((options, type) => { editor.setDecorations(type, options) }) // Apply color decorations

  // Store the calculated range information for this document
  documentColorInfos.set(doc.uri.toString(), currentColorInfos)
}

// Timer variable for debouncing
let timeout: NodeJS.Timeout | undefined

// Public function to trigger decoration updates, with debouncing
export function triggerUpdateDecorations (editor: vscode.TextEditor | undefined, immediate: boolean = false): void {
  if (timeout !== undefined) {
    clearTimeout(timeout)
    timeout = undefined
  }
  if (immediate) {
    updateDecorations(editor)
  } else {
    // Debounce non-immediate updates
    timeout = setTimeout(() => {
      updateDecorations(editor)
    }, 500) // 500ms delay
  }
}

// Add this new function to convert hex to Color object
function hexToColor (hex: string): Color {
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  return new Color(r, g, b, 1)
}

// Add this new function to convert Color to hex
function colorToHex (color: Color): string {
  const r = Math.round(color.red * 255).toString(16).padStart(2, '0')
  const g = Math.round(color.green * 255).toString(16).padStart(2, '0')
  const b = Math.round(color.blue * 255).toString(16).padStart(2, '0')
  return r + g + b
}

// Modify initializeDecorations to register the color provider
export function initializeDecorations (context: vscode.ExtensionContext): void {
  let activeEditor = vscode.window.activeTextEditor

  // Initial update if there's an active editor
  if (activeEditor !== undefined) {
    triggerUpdateDecorations(activeEditor, true)
  }

  // Update when the active editor changes
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor | undefined) => {
    activeEditor = editor
    const hadVisibleRanges = visibleCodeRanges.length > 0 // Remember if ranges were visible
    visibleCodeRanges = [] // Reset visible ranges on editor change

    if (activeEditor !== undefined) {
      // Trigger immediate update for the new editor
      // The associateFile logic in extension.ts handles the language check and calls this if needed
      // However, if the language is already correct, we might need an update here.
      // We also need to potentially clear the 'visible' state if the previous editor had it.
      if (hadVisibleRanges && activeEditor.document.languageId === 'rathena') {
        triggerUpdateDecorations(activeEditor, true) // Force update to clear visible state if needed
      } else {
        triggerUpdateDecorations(activeEditor, true) // Standard update for new editor
      }
    } else {
      // If no active editor, ensure decorations are cleared conceptually
      // (updateDecorations handles the undefined editor case)
      triggerUpdateDecorations(undefined, true)
    }
  }))

  // Update when the text document changes (with debounce)
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
    const currentActiveEditor = vscode.window.activeTextEditor
    // Only update if the change happened in the currently active editor
    if (currentActiveEditor !== undefined && event.document === currentActiveEditor.document) {
      // Don't make visible ranges immediately disappear on typing, use debounce
      triggerUpdateDecorations(currentActiveEditor, false)
    }
  }))

  // Update decorations when the text editor selection changes
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((event: vscode.TextEditorSelectionChangeEvent) => {
    const editor = event.textEditor
    if (editor === vscode.window.activeTextEditor && editor.document.languageId === 'rathena') {
      const position = editor.selection.active
      const docUriString = editor.document.uri.toString()
      const colorInfos = documentColorInfos.get(docUriString)
      let nextVisibleRanges: vscode.Range[] = []

      if (colorInfos !== undefined && colorInfos !== null) {
        let foundMatch = false
        // Iterate through stored color segments
        for (let i = 0; i < colorInfos.length; i++) {
          const info = colorInfos[i]
          if (info.colorHex !== '000000' && !info.textRange.isEmpty) {
            const nextInfo = i + 1 < colorInfos.length ? colorInfos[i + 1] : null
            const fullRange = nextInfo !== null
              ? new vscode.Range(
                info.codeRange.start,
                nextInfo.codeRange.end
              )
              : new vscode.Range(
                info.codeRange.start,
                info.textRange.end
              )
            if (fullRange.contains(position)) {
              nextVisibleRanges.push(info.codeRange)
              if (nextInfo !== null) {
                nextVisibleRanges.push(nextInfo.codeRange)
              }
              foundMatch = true
              break
            }
          }
        }

        if (!foundMatch) {
          for (const currentVisible of visibleCodeRanges) {
            if (currentVisible.contains(position)) {
              nextVisibleRanges = [...visibleCodeRanges]
              foundMatch = true
              break
            }
          }
        }
      }

      if (!areRangeArraysEqual(visibleCodeRanges, nextVisibleRanges)) {
        visibleCodeRanges = nextVisibleRanges
        triggerUpdateDecorations(editor, true)
      }
    } else if (editor === vscode.window.activeTextEditor && visibleCodeRanges.length > 0) {
      visibleCodeRanges = []
      triggerUpdateDecorations(editor, true)
    }
  }))

  // Clear document info when a text document is closed
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((doc: vscode.TextDocument) => {
    const docUriString = doc.uri.toString()
    const wasInfoStored = documentColorInfos.has(docUriString)
    documentColorInfos.delete(docUriString)
    // If the closed document was the one showing visible ranges, reset them
    const currentActiveEditor = vscode.window.activeTextEditor
    if (wasInfoStored && (currentActiveEditor === undefined || currentActiveEditor.document === doc)) {
      // If the currently active editor *is* the one being closed, or if there's no active editor left
      visibleCodeRanges = []
    }
  }))

  // Register the color provider
  context.subscriptions.push(
    vscode.languages.registerColorProvider('rathena', {
      provideDocumentColors (document: vscode.TextDocument): vscode.ColorInformation[] {
        // Check if color picker is enabled (independent of render colors)
        const showColorPicker = getConfiguration<boolean>('showColorPicker')
        if (!showColorPicker) return []

        const text = document.getText()
        const colors: ColorInformation[] = []
        let match
        let previousColor = '000000' // Mantener track del color anterior

        // Get the stored color infos for this document
        const docUriString = document.uri.toString()
        const colorInfos = documentColorInfos.get(docUriString)
        if (colorInfos === undefined || colorInfos === null) return colors

        while ((match = colorCodeRegex.exec(text)) !== null) {
          const hexColor = match[1]
          const startPos = document.positionAt(match.index)
          const endPos = document.positionAt(match.index + 7)
          const range = new vscode.Range(startPos, endPos)

          // Only show color picker if:
          // 1. It's a color code (^xxxxxx)
          // 2. It's NOT a reset code (^000000) closing a previous color
          const isColorCode = colorInfos.some(info => info.codeRange.contains(range))
          const isClosingReset = hexColor === '000000' && previousColor !== '000000'

          if (isColorCode && !isClosingReset) {
            colors.push(new ColorInformation(range, hexToColor(hexColor)))
          }

          previousColor = hexColor
        }

        return colors
      },

      provideColorPresentations (color: Color, context: { document: vscode.TextDocument, range: vscode.Range }): vscode.ColorPresentation[] {
        const hex = colorToHex(color)
        return [new vscode.ColorPresentation('^' + hex)]
      }
    })
  )

  // Add disposables for cleanup on extension deactivation
  context.subscriptions.push({
    dispose: () => {
      hiddenCodeDecorationType.dispose()
      colorDecorationTypes.forEach(type => { type.dispose() })
      colorDecorationTypes.clear()
      documentColorInfos.clear()
      if (timeout !== undefined) { clearTimeout(timeout) }
      visibleCodeRanges = []
    }
  })

  // Add configuration change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('rathena.renderColors') ||
          event.affectsConfiguration('rathena.hideColorCodes')) {
        // Update all active windows
        vscode.window.visibleTextEditors.forEach(editor => {
          if (editor.document.languageId === 'rathena') {
            triggerUpdateDecorations(editor, true)
          }
        })
      }
    })
  )

  console.log('Rathena color decoration support initialized.')
}

// Function to clean up resources
export function disposeDecorations (): void {
  // Clear maps and timers
  documentColorInfos.clear()
  if (timeout !== undefined) { clearTimeout(timeout) }
  visibleCodeRanges = []

  // Dispose decoration types requires access to the map,
  // but the main disposal happens via the context.subscriptions in initializeDecorations.
  // This function primarily ensures state is cleared immediately if needed.
  console.log('Rathena color decoration resources cleared.')

  // Note: Actual vscode.TextEditorDecorationType disposal is handled
  // by the disposable pushed to context.subscriptions in initializeDecorations.
}
