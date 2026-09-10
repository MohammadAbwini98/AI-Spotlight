import React, { useState } from 'react'
import { TODO_LIST_NAME_MAX_LENGTH, type TodoList } from '../../../electron/shared/types'
import { Icon } from '../../components/Icon/Icon'
import styles from './TodoSidebar.module.css'

interface TodoSidebarProps {
  lists: TodoList[]
  selectedListId: number | null
  onSelect: (id: number | null) => void
  onCreateList: (name: string) => void
  onDeleteList: (id: number) => void
}

export function TodoSidebar({
  lists,
  selectedListId,
  onSelect,
  onCreateList,
  onDeleteList
}: TodoSidebarProps): React.ReactElement {
  const [isCreating, setIsCreating] = useState(false)
  const [newListName, setNewListName] = useState('')

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (newListName.trim()) {
      onCreateList(newListName.trim())
      setNewListName('')
      setIsCreating(false)
    }
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.section}>
        <button
          className={`${styles.item} ${selectedListId === null ? styles.selected : ''}`}
          type="button"
          onClick={() => onSelect(null)}
        >
          <Icon name="tasks" size={14} className={styles.listIcon} />
          All Tasks
        </button>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>My Lists</span>
          <button
            className={styles.addBtn}
            type="button"
            onClick={() => setIsCreating(true)}
            aria-label="Create list"
          >
            <Icon name="plus" size={12} />
          </button>
        </div>

        {isCreating && (
          <form className={styles.createForm} onSubmit={handleCreate}>
            <div className={styles.inputWrap}>
              <input
                type="text"
                className={styles.input}
                value={newListName}
                maxLength={TODO_LIST_NAME_MAX_LENGTH}
                aria-describedby="list-name-limit"
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="List name…"
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                onBlur={(e) => {
                  // Ignore blur if we clicked the submit button
                  if (
                    e.relatedTarget &&
                    (e.relatedTarget as HTMLElement).dataset.action === 'submit'
                  ) {
                    return
                  }
                  if (!newListName.trim()) setIsCreating(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setNewListName('')
                    setIsCreating(false)
                  }
                }}
              />
              <span className={styles.characterCount} id="list-name-limit">
                {newListName.length}/{TODO_LIST_NAME_MAX_LENGTH}
              </span>
            </div>
            <button
              type="submit"
              className={styles.submitBtn}
              data-action="submit"
              aria-label="Save list"
            >
              <Icon name="check" size={14} />
            </button>
          </form>
        )}

        <div className={styles.list}>
          {lists.map((list) => (
            <div
              key={list.id}
              className={`${styles.item} ${selectedListId === list.id ? styles.selected : ''}`}
            >
              <button type="button" className={styles.itemLabel} onClick={() => onSelect(list.id)}>
                <Icon name="tasks" size={14} className={styles.listIcon} />
                {list.name}
              </button>
              <button
                className={styles.deleteBtn}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteList(list.id)
                }}
                aria-label="Delete list"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path
                    d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
