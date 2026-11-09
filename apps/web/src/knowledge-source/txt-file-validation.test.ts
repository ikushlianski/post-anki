import { describe, expect, it } from 'vitest'

import { checkTxtFile, MAX_TXT_FILE_BYTES } from './txt-file-validation'

describe('checkTxtFile', () => {
  it('should accept a small .txt file', () => {
    expect(checkTxtFile({ name: 'Business.TXT', size: 1200 })).toBeNull()
  })

  it('should refuse a PDF with a plain message', () => {
    expect(checkTxtFile({ name: 'notes.pdf', size: 1200 })).toBe('Only .txt files can be imported.')
  })

  it('should refuse an empty file', () => {
    expect(checkTxtFile({ name: 'a.txt', size: 0 })).toBe('The file is empty.')
  })

  it('should refuse a file over the size limit', () => {
    expect(checkTxtFile({ name: 'a.txt', size: MAX_TXT_FILE_BYTES + 1 })).toMatch(/too large/)
  })
})
