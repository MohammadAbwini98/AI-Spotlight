import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, TodoList, Task } from '../../../electron/shared/types'
import { AnimatePresence } from 'framer-motion'
import { fadeIn } from '../../design/motion'
import { LiquidGlassSurface } from '../../components/LiquidGlassSurface/LiquidGlassSurface'
import { Icon } from '../../components/Icon/Icon'
import { TodoSidebar } from './TodoSidebar'
import { TaskList } from './TaskList'
import { NoteEditor, type NoteEditorHandle } from './NoteEditor'
import { CreateTaskView } from './CreateTaskView'
import { getTaskStatistics } from './task-statistics'
import styles from './TodoView.module.css'

interface TodoViewProps {
  settings: AppSettings | null
  onBack: () => void
  onOpenSettings: () => void
}

export function TodoView({ settings, onBack, onOpenSettings }: TodoViewProps): React.ReactElement {
  const [lists, setLists] = useState<TodoList[]>([])
  const [selectedListId, setSelectedListId] = useState<number | null>(null) // null = 'All Tasks'
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  const addTaskButtonRef = useRef<HTMLButtonElement>(null)
  const notePanelRef = useRef<NoteEditorHandle>(null)
  const noteTransitionRef = useRef(0)
  const statistics = useMemo(() => getTaskStatistics(tasks), [tasks])
  const selectedListName =
    selectedListId === null ? 'All Tasks' : lists.find((list) => list.id === selectedListId)?.name

  // Fetch lists on mount
  useEffect(() => {
    fetchLists()
  }, [])

  // Fetch tasks when selected list changes
  useEffect(() => {
    fetchTasks(selectedListId)
  }, [selectedListId])

  const fetchLists = async () => {
    const res = await window.electronAPI.todo.getLists()
    if (res.ok) setLists(res.data)
  }

  const fetchTasks = async (listId: number | null) => {
    const res = await window.electronAPI.todo.getTasks(listId)
    if (res.ok) setTasks(res.data)
  }

  const handleCreateList = async (name: string) => {
    const res = await window.electronAPI.todo.createList({ name })
    if (res.ok) {
      setLists([...lists, res.data])
      setSelectedListId(res.data.id)
    }
  }

  const handleDeleteList = async (id: number) => {
    await window.electronAPI.todo.deleteList(id)
    setLists(lists.filter((l) => l.id !== id))
    if (selectedListId === id) setSelectedListId(null)
  }

  const handleCreateTask = async (
    input: import('../../../electron/shared/types').CreateTaskInput
  ) => {
    const res = await window.electronAPI.todo.createTask({
      ...input,
      listId: selectedListId,
      priority: input.priority || settings?.defaultPriority || 'none'
    })
    if (res.ok) {
      setTasks((current) => [...current, res.data])
      setSelectedTaskId(res.data.id)
    }
  }

  const handleUpdateTask = async (id: number, updates: Partial<Task>) => {
    const res = await window.electronAPI.todo.updateTask({ id, ...updates })
    if (res.ok) {
      setTasks((current) => current.map((task) => (task.id === id ? res.data : task)))
    }
  }

  const handleSelectTask = async (nextTaskId: number | null): Promise<void> => {
    if (nextTaskId === selectedTaskId) return
    const transition = ++noteTransitionRef.current
    if (selectedTaskId != null) await notePanelRef.current?.flush()
    if (transition === noteTransitionRef.current) setSelectedTaskId(nextTaskId)
  }

  const handleSelectList = async (nextListId: number | null): Promise<void> => {
    const transition = ++noteTransitionRef.current
    if (selectedTaskId != null) await notePanelRef.current?.flush()
    if (transition !== noteTransitionRef.current) return
    setSelectedTaskId(null)
    setSelectedListId(nextListId)
  }

  const handleBack = async (): Promise<void> => {
    if (selectedTaskId != null) await notePanelRef.current?.flush()
    onBack()
  }

  const handleDeleteTask = async (id: number) => {
    if (selectedTaskId === id) await notePanelRef.current?.flush()
    await window.electronAPI.todo.deleteTask(id)
    setTasks((current) => current.filter((task) => task.id !== id))
    if (selectedTaskId === id) setSelectedTaskId(null)
  }

  return (
    <LiquidGlassSurface
      className={styles.container}
      variant="strong"
      elevated
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      exit="hidden"
    >
      <header className={styles.header}>
        <button className={styles.backBtn} type="button" onClick={() => void handleBack()}>
          <Icon name="back" size={16} />
          Search
        </button>
        <div className={styles.heading}>
          <h1 className={styles.title}>{selectedListName ?? 'Tasks'}</h1>
          <div
            className={styles.statistics}
            aria-label={`${statistics.total} total tasks, ${statistics.active} active, ${statistics.completed} completed${statistics.dropped ? `, ${statistics.dropped} dropped` : ''}`}
          >
            <span>{statistics.total} total</span>
            <span aria-hidden="true">·</span>
            <span>{statistics.active} active</span>
            <span aria-hidden="true">·</span>
            <span>{statistics.completed} done</span>
            {statistics.dropped > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{statistics.dropped} dropped</span>
              </>
            )}
          </div>
        </div>
        <button
          className={styles.settingsBtn}
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Open settings"
        >
          <Icon name="settings" size={18} />
        </button>
      </header>

      <div
        className={`${styles.layout} ${selectedTaskId ? styles.notesOpen : ''}`}
        onPointerDownCapture={(event) => {
          if (!selectedTaskId) return
          const target = event.target as HTMLElement
          if (
            !notePanelRef.current?.contains(target) &&
            !target.closest('[data-note-trigger="true"]')
          ) {
            void handleSelectTask(null)
          }
        }}
      >
        <TodoSidebar
          lists={lists}
          selectedListId={selectedListId}
          onSelect={(id) => void handleSelectList(id)}
          onCreateList={handleCreateList}
          onDeleteList={handleDeleteList}
        />

        <TaskList
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          showCompleted={settings?.showCompletedTasks ?? true}
          onSelect={(id) => void handleSelectTask(id)}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
        />

        <AnimatePresence>
          {selectedTaskId && (
            <NoteEditor
              ref={notePanelRef}
              key="note-editor"
              taskId={selectedTaskId}
              onClose={() => void handleSelectTask(null)}
            />
          )}
        </AnimatePresence>

        <button
          ref={addTaskButtonRef}
          className={styles.fab}
          type="button"
          onClick={() => setIsCreatingTask(true)}
          aria-label="Add task"
        >
          <Icon name="plus" size={14} />
          Add task
        </button>
      </div>

      <AnimatePresence>
        {isCreatingTask && (
          <CreateTaskView
            key="create-task"
            listId={selectedListId}
            onClose={() => setIsCreatingTask(false)}
            onCreate={handleCreateTask}
            returnFocusRef={addTaskButtonRef}
          />
        )}
      </AnimatePresence>
    </LiquidGlassSurface>
  )
}
