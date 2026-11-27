import { expect, test } from 'claude-code/testing'

import { parseLastCommit, parseShortstat, parseStatus } from './git'
import { middle, relativeFolder } from './band'

const TRACKING = [
  '# branch.oid 4f9c2a1d8e7b6c5a4f3e2d1c0b9a8f7e6d5c4b3a',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +1 -3',
  '1 M. N... 100644 100644 100644 aaa bbb src/staged.ts',
  '1 .M N... 100644 100644 100644 aaa bbb src/changed.ts',
  '1 MM N... 100644 100644 100644 aaa bbb src/both.ts',
  '2 R. N... 100644 100644 100644 aaa bbb R100 src/new name.ts\tsrc/old.ts',
  'u UU N... 100644 100644 100644 100644 aaa bbb ccc src/conflict.ts',
  '? notes.md',
  '? tmp/',
  '! ignored.log',
].join('\n')

test('a tracking branch reads its sync counts and every kind of local change', () => {
  expect(parseStatus(TRACKING)).toEqual({
    branch: 'main',
    upstream: 'origin/main',
    toPush: 1,
    toPull: 3,
    staged: 3,
    unstaged: 3,
    untracked: 2,
    files: 7,
  })
})

test('a branch with no remote branch has no sync counts', () => {
  expect(parseStatus('# branch.oid abc\r\n# branch.head feature/x\r\n')).toEqual({ branch: 'feature/x', staged: 0, unstaged: 0, untracked: 0, files: 0 })
})

test('a detached HEAD reads as the short commit', () => {
  expect(parseStatus('# branch.oid 4f9c2a1d8e7b\n# branch.head (detached)\n')).toEqual({
    branch: '4f9c2a1',
    isDetached: true,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    files: 0,
  })
})

test('the session folder reads relative to the repository root', () => {
  expect(relativeFolder('C:\\work\\app', 'C:\\work\\app')).toBe('.')
  expect(relativeFolder('C:\\work\\app', 'c:\\work\\app\\web\\src')).toBe('web/src')
  expect(relativeFolder('/work/app', '/work/other')).toBe('/work/other')
})

test('the diff stat reads files, added and removed lines, in singular and plural', () => {
  expect(parseShortstat(' 3 files changed, 12 insertions(+), 4 deletions(-)\n')).toEqual({ files: 3, added: 12, removed: 4 })
  expect(parseShortstat(' 1 file changed, 1 insertion(+)\n')).toEqual({ files: 1, added: 1, removed: 0 })
  expect(parseShortstat(' 2 files changed, 7 deletions(-)\n')).toEqual({ files: 2, added: 0, removed: 7 })
  expect(parseShortstat('')).toEqual({ files: 0, added: 0, removed: 0 })
})

test('a file both staged and modified counts once as a changed file', () => {
  expect(parseStatus('# branch.head main\n1 MM N... 100644 100644 100644 aaa bbb src/both.ts\n')).toMatchObject({ staged: 1, unstaged: 1, files: 1 })
})

test('the last commit reads its short hash and subject', () => {
  expect(parseLastCommit('3fa92b1\0fix bug #21\n')).toEqual({ hash: '3fa92b1', subject: 'fix bug #21' })
  expect(parseLastCommit('')).toBeUndefined()
})

test('long paths keep both ends', () => {
  expect(middle('abcdefghij', 20)).toBe('abcdefghij')
  expect(middle('abcdefghij', 7)).toBe('abc…hij')
})
