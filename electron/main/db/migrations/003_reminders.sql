-- Migration 003: Add Reminders
-- Adds reminder field to tasks

ALTER TABLE tasks ADD COLUMN reminder TEXT;
