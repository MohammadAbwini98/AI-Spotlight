import type { Task } from '../../../electron/shared/types'

export interface TaskStatistics {
  total: number
  active: number
  completed: number
  dropped: number
}

/** Summarizes the tasks currently loaded for the selected Todo list. */
export function getTaskStatistics(tasks: Task[]): TaskStatistics {
  return tasks.reduce<TaskStatistics>(
    (statistics, task) => {
      statistics.total += 1
      if (task.status === 'completed') statistics.completed += 1
      else if (task.status === 'dropped') statistics.dropped += 1
      else statistics.active += 1
      return statistics
    },
    { total: 0, active: 0, completed: 0, dropped: 0 }
  )
}
