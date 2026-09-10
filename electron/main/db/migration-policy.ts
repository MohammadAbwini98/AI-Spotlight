export const EXPECTED_MIGRATION_VERSION = 10

export interface MigrationDescriptor {
  filename: string
  version: number
}

/** Rejects missing, duplicate, out-of-order, or unexpectedly packaged migrations. */
export function validateMigrationFiles(
  filenames: string[],
  expectedVersion = EXPECTED_MIGRATION_VERSION
): MigrationDescriptor[] {
  const migrations = filenames
    .filter((filename) => filename.endsWith('.sql'))
    .sort()
    .map((filename) => {
      const match = filename.match(/^(\d+)_/)
      if (!match) throw new Error(`Invalid migration filename: ${filename}`)
      return { filename, version: Number.parseInt(match[1], 10) }
    })

  if (migrations.length !== expectedVersion) {
    throw new Error(`Expected ${expectedVersion} migrations, found ${migrations.length}.`)
  }
  migrations.forEach((migration, index) => {
    const expected = index + 1
    if (migration.version !== expected) {
      throw new Error(`Migration sequence is incomplete at version ${expected}.`)
    }
  })
  return migrations
}
