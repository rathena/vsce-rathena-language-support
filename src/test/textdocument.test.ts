'use strict'

import * as assert from 'assert'
import { isRathenaHeader } from '../rathena'

describe('isRathenaHeader', () => {
  it('Should not associate empty document', () => {
    assert.equal(isRathenaHeader(''), false)
  })
  
  it('Should associate rAthena document with long header', () => {
    assert.equal(isRathenaHeader('//===== rAthena Script ====='), true)
  })
  
  it('Should associate rAthena document with shorthand header', () => {
    assert.equal(isRathenaHeader('//!rathena'), true)
  })
  
  it('Should not associate eAthena script', () => {
    assert.equal(isRathenaHeader('//===== eAthena Script ====='), false)
  })
  
  it('Should not associate Hercules script', () => {
    assert.equal(isRathenaHeader('//================= Hercules Script'), false)
  })  
})
