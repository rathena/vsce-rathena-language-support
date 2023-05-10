'use strict'

const raHeader: string = '//===== rAthena Script'
const shortHeader: string = '//!rathena'

export function isRathenaHeader (firstLine: string): boolean {
  if (firstLine.startsWith(raHeader) || firstLine.startsWith(shortHeader)) {
    return true
  }

  return false
}