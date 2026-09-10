-- Migration 005: Make the OS color scheme the default appearance.
-- Existing Crystal installs migrate to System; explicit Light/Dark choices remain unchanged.

UPDATE app_settings
SET value = 'system'
WHERE key = 'theme' AND value = 'crystal';
