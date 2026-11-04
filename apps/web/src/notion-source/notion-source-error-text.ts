import type { NotionApiResult } from './notion-api-result'

export function notionSaveErrorText(failure: Extract<NotionApiResult<unknown>, { ok: false }>): string {
  if (failure.code === 'page_already_added') return 'This Notion page is already added as a source.'

  if (failure.code === 'subject_not_found') return 'That subject no longer exists. Pick another one.'

  if (failure.code === 'invalid_input') return 'Some fields are not valid. Check the link and the numbers.'

  return 'Could not save the source. Try again.'
}

export function notionRunErrorText(failure: Extract<NotionApiResult<unknown>, { ok: false }>): string {
  if (failure.code === 'already_running') return 'A run for this source is already in progress. Try again in a few minutes.'

  if (failure.code === 'not_found') return 'This source no longer exists.'

  return 'The run could not be completed. Try again.'
}
