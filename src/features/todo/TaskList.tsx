import React, { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Task, TaskStatus } from '../../../electron/shared/types'
import { Icon } from '../../components/Icon/Icon'
import { resultRow } from '../../design/motion'
import styles from './TaskList.module.css'

interface TaskListProps {
  tasks: Task[]
  selectedTaskId: number | null
  showCompleted: boolean
  onSelect: (id: number | null) => void
  onUpdate: (id: number, updates: Partial<Task>) => void
  onDelete: (id: number) => void
}

const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'follow_up', label: 'Follow-Up' },
  { value: 'completed', label: 'Completed' },
  { value: 'dropped', label: 'Dropped' }
]

const statusRank: Record<TaskStatus, number> = {
  in_progress: 0,
  follow_up: 1,
  pending: 2,
  completed: 3,
  dropped: 4
}

export function TaskList({
  tasks,
  selectedTaskId,
  showCompleted,
  onSelect,
  onUpdate,
  onDelete
}: TaskListProps): React.ReactElement {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()

  const visibleTasks = useMemo(
    () =>
      tasks
        .filter((task) => showCompleted || task.status !== 'completed')
        .filter((task) => {
          if (!normalizedQuery) return true
          const statusLabel =
            statusOptions.find((option) => option.value === task.status)?.label ?? task.status
          return [task.title, task.notes ?? '', statusLabel].some((value) =>
            value.toLocaleLowerCase().includes(normalizedQuery)
          )
        })
        .sort((a, b) => statusRank[a.status] - statusRank[b.status] || a.sortOrder - b.sortOrder),
    [normalizedQuery, showCompleted, tasks]
  )

  return (
    <div className={styles.container}>
      <div className={styles.search} role="search">
        <Icon name="search" size={16} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tasks"
          aria-label="Search tasks"
        />
        {query && (
          <button
            className={styles.clearSearch}
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear task search"
          >
            <Icon name="close" size={11} />
          </button>
        )}
      </div>

      <div className={styles.list}>
        {visibleTasks.length === 0 ? (
          <div className={styles.empty} role="status">
            <p>{normalizedQuery ? `No tasks match “${query.trim()}”.` : 'No tasks found.'}</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visibleTasks.map((task, index) => (
              <motion.div
                key={task.id}
                layout
                variants={resultRow}
                custom={index}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, height: 0 }}
                whileHover={{
                  y: -1,
                  transition: { duration: 0.14, ease: [0.25, 0.1, 0.25, 1] }
                }}
                className={`${styles.row} ${selectedTaskId === task.id ? styles.selected : ''} ${task.status === 'completed' ? styles.completed : ''} ${task.status === 'dropped' ? styles.dropped : ''}`}
              >
                <button
                  type="button"
                  className={styles.checkbox}
                  onClick={(event) => {
                    event.stopPropagation()
                    onUpdate(task.id, {
                      status: task.status === 'completed' ? 'pending' : 'completed'
                    })
                  }}
                  aria-label={task.status === 'completed' ? 'Mark pending' : 'Mark completed'}
                >
                  <span className={styles.checkboxCircle} aria-hidden="true">
                    {task.status === 'completed' && <Icon name="check" size={12} />}
                  </span>
                </button>

                <button
                  type="button"
                  className={styles.content}
                  data-note-trigger="true"
                  onClick={() => onSelect(task.id)}
                  aria-current={selectedTaskId === task.id ? 'true' : undefined}
                >
                  <span className={styles.title}>{task.title}</span>
                  {task.notes && <span className={styles.notes}>{task.notes}</span>}
                </button>

                <div className={styles.actions}>
                  <label className={styles.statusControl} data-status={task.status}>
                    <span className={styles.srOnly}>Status for {task.title}</span>
                    <select
                      value={task.status}
                      onChange={(event) =>
                        onUpdate(task.id, { status: event.target.value as TaskStatus })
                      }
                      aria-label={`Status for ${task.title}`}
                    >
                      {statusOptions.map((option) => (
                        <option value={option.value} key={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className={styles.deleteBtn}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDelete(task.id)
                    }}
                    aria-label={`Delete ${task.title}`}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
