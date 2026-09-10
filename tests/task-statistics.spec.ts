import { describe, expect, it } from 'vitest'
import type { Task, TaskStatus } from '../electron/shared/types'
import { getTaskStatistics } from '../src/features/todo/task-statistics'

function task(id: number, status: TaskStatus): Task {
  return {
    id,
    listId: null,
    title: `Task ${id}`,
    notes: null,
    status,
    priority: 'none',
    dueAt: null,
    reminder: null,
    completedAt: status === 'completed' ? '2026-07-14T00:00:00.000Z' : null,
    sortOrder: id,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    tags: []
  }
}

describe('Todo list statistics', () => {
  it('separates active, completed, and dropped tasks', () => {
    expect(
      getTaskStatistics([
        task(1, 'pending'),
        task(2, 'in_progress'),
        task(3, 'follow_up'),
        task(4, 'completed'),
        task(5, 'dropped')
      ])
    ).toEqual({ total: 5, active: 3, completed: 1, dropped: 1 })
  })

  it('returns stable zero values for an empty list', () => {
    expect(getTaskStatistics([])).toEqual({ total: 0, active: 0, completed: 0, dropped: 0 })
  })
})
