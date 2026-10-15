import { describe, it, expect } from 'vitest'
import {
  computeProgress,
  computeEpicStatus,
  groupByFeature,
  buildEpicRows,
  getStatusBucket,
} from './aggregations'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const task = (overrides) => ({
  id: Math.random(),
  name: 'Task',
  status: 'Not started',
  unknownStatus: false,
  epic: null,
  assignees: [],
  productVersion: 'V2',
  updatedAt: null,
  ...overrides,
})

// ── computeProgress ───────────────────────────────────────────────────────────

describe('computeProgress', () => {
  it('returns 0/0 for empty list', () => {
    expect(computeProgress([])).toEqual({ pct: 0, complete: 0, total: 0 })
  })

  it('counts Done as complete', () => {
    const tasks = [task({ status: 'Done' }), task({ status: 'Not started' })]
    expect(computeProgress(tasks)).toEqual({ pct: 50, complete: 1, total: 2 })
  })

  it('counts QA Approved as complete', () => {
    const tasks = [task({ status: 'QA Approved' }), task({ status: 'QA Approved' })]
    expect(computeProgress(tasks)).toEqual({ pct: 100, complete: 2, total: 2 })
  })

  it('rounds to nearest integer', () => {
    // 1/3 ≈ 33%
    const tasks = [task({ status: 'Done' }), task(), task()]
    expect(computeProgress(tasks).pct).toBe(33)
  })

  it('does not count in-flight statuses as complete', () => {
    const tasks = [
      task({ status: 'In progress' }),
      task({ status: 'In Code Review' }),
      task({ status: 'Ready For QA' }),
    ]
    expect(computeProgress(tasks)).toEqual({ pct: 0, complete: 0, total: 3 })
  })
})

// ── computeEpicStatus ─────────────────────────────────────────────────────────

describe('computeEpicStatus', () => {
  it('returns Not started for empty list', () => {
    expect(computeEpicStatus([])).toBe('Not started')
  })

  it('Ready for release when every task is QA Approved', () => {
    const tasks = [task({ status: 'QA Approved' }), task({ status: 'QA Approved' })]
    expect(computeEpicStatus(tasks)).toBe('Ready for release')
  })

  it('Ready for release when every task is Done', () => {
    const tasks = [task({ status: 'Done' }), task({ status: 'Done' })]
    expect(computeEpicStatus(tasks)).toBe('Ready for release')
  })

  it('Ready for release when tasks mix QA Approved and Done', () => {
    const tasks = [task({ status: 'Done' }), task({ status: 'QA Approved' })]
    expect(computeEpicStatus(tasks)).toBe('Ready for release')
  })

  it('NOT Ready for release when mixing QA Approved and Not started', () => {
    const tasks = [task({ status: 'QA Approved' }), task({ status: 'Not started' })]
    expect(computeEpicStatus(tasks)).toBe('Not started')
  })

  it('In progress when at least one in-flight task exists', () => {
    const tasks = [task({ status: 'In progress' }), task({ status: 'Not started' })]
    expect(computeEpicStatus(tasks)).toBe('In progress')
  })

  it('In progress for In Code Review', () => {
    expect(computeEpicStatus([task({ status: 'In Code Review' })])).toBe('In progress')
  })

  it('In progress takes priority over Blocked', () => {
    const tasks = [task({ status: 'Blocked' }), task({ status: 'In progress' })]
    expect(computeEpicStatus(tasks)).toBe('In progress')
  })

  it('Blocked when blocked tasks exist and no in-flight', () => {
    const tasks = [task({ status: 'Blocked' }), task({ status: 'Not started' })]
    expect(computeEpicStatus(tasks)).toBe('Blocked')
  })

  it('Not started when all tasks are Not started', () => {
    const tasks = [task(), task(), task()]
    expect(computeEpicStatus(tasks)).toBe('Not started')
  })
})

// ── groupByFeature ────────────────────────────────────────────────────────────

describe('groupByFeature', () => {
  it('assigns tasks to the correct feature group', () => {
    const tasks = [
      task({ status: 'Done', epic: 'OTP Authentication' }),
      task({ status: 'Not started', epic: 'OTP Authentication' }),
    ]
    const groups = groupByFeature(tasks)
    const otp = groups.find((g) => g.feature === 'OTP Authentication')
    expect(otp).toBeDefined()
    expect(otp.complete).toBe(1)
    expect(otp.total).toBe(2)
    expect(otp.pct).toBe(50)
  })

  it('matches epic names case-insensitively', () => {
    const tasks = [task({ status: 'QA Approved', epic: 'otp AUTHENTICATION' })]
    const groups = groupByFeature(tasks)
    const otp = groups.find((g) => g.feature === 'OTP Authentication')
    expect(otp.complete).toBe(1)
  })

  it('excludes tasks whose assignees are in the exclusion list', () => {
    const tasks = [
      task({ status: 'Done', epic: 'OTP Authentication', assignees: ['alice'] }),
      task({ status: 'Done', epic: 'OTP Authentication', assignees: ['bob'] }),
    ]
    const groups = groupByFeature(tasks, ['alice'])
    const otp = groups.find((g) => g.feature === 'OTP Authentication')
    expect(otp.total).toBe(1)
    expect(otp.complete).toBe(1)
  })

  it('a task with no epic does not appear in any feature group', () => {
    const tasks = [task({ status: 'Done', epic: null })]
    const groups = groupByFeature(tasks)
    const totals = groups.reduce((acc, g) => acc + g.total, 0)
    expect(totals).toBe(0)
  })
})

// ── buildEpicRows ─────────────────────────────────────────────────────────────

describe('buildEpicRows', () => {
  it('groups tasks without an epic under "(No epic)"', () => {
    const tasks = [task({ status: 'Done', epic: null })]
    const rows = buildEpicRows(tasks)
    expect(rows[0].epic).toBe('(No epic)')
  })

  it('sorts In progress epics before Not started epics', () => {
    const tasks = [
      task({ epic: 'Alpha', status: 'Not started' }),
      task({ epic: 'Beta', status: 'In progress' }),
    ]
    const rows = buildEpicRows(tasks)
    expect(rows[0].epic).toBe('Beta')
    expect(rows[1].epic).toBe('Alpha')
  })

  it('excludes tasks by assignee', () => {
    const tasks = [
      task({ epic: 'Alpha', status: 'Done', assignees: ['alice'] }),
      task({ epic: 'Alpha', status: 'Not started', assignees: ['bob'] }),
    ]
    const rows = buildEpicRows(tasks, ['alice'])
    expect(rows[0].total).toBe(1)
    expect(rows[0].complete).toBe(0)
  })
})

// ── getStatusBucket ───────────────────────────────────────────────────────────

describe('getStatusBucket', () => {
  it.each([
    ['Done', 'Complete'],
    ['QA Approved', 'Complete'],
    ['Ready For QA', 'In QA'],
    ['In QA Review', 'In QA'],
    ['In progress', 'In development'],
    ['In Code Review', 'In development'],
    ['Merged - Ready for Build', 'In development'],
    ['QA Rejected', 'Needs attention'],
    ['Blocked', 'Needs attention'],
    ['Not started', 'Not started'],
  ])('%s → %s', (status, expected) => {
    expect(getStatusBucket(status)).toBe(expected)
  })
})
