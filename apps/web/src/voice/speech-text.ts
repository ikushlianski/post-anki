const CLOZE = /\{\{c\d+::(.*?)(?:::.*?)?\}\}/gs
const HINT = /\((?:hint|Hint)[:\s][^)]*\)/g

export function cleanTextForSpeech(input: string): string {
  return input
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(CLOZE, '$1')
    .replace(HINT, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/gs, '$2')
    .replace(/(\*|_)(\S(?:.*?\S)?)\1/gs, '$2')
    .replace(/~~(.*?)~~/gs, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .trim()
}
