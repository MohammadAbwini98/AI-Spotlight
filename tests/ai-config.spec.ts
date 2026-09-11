import { describe, expect, it } from 'vitest'
import { AI_CONFIG, isLowMemoryHost, resolveAiThreadCount } from '../electron/main/ai/ai-config'

describe('AI runtime configuration', () => {
  it('binds the local server to loopback only', () => {
    expect(AI_CONFIG.host).toBe('127.0.0.1')
  })

  it('allows a single concurrent generation on CPU-only inference', () => {
    expect(AI_CONFIG.maxConcurrentGenerations).toBe(1)
  })

  it('reserves CPU capacity instead of consuming every core', () => {
    expect(resolveAiThreadCount(2)).toBe(1)
    expect(resolveAiThreadCount(4)).toBe(3)
    expect(resolveAiThreadCount(8)).toBe(6)
    expect(resolveAiThreadCount(16)).toBe(12)
    expect(resolveAiThreadCount(64)).toBe(16)
    expect(resolveAiThreadCount(0)).toBe(4)
  })

  it('detects hosts below the model minimum RAM', () => {
    const gib = 1024 * 1024 * 1024
    expect(isLowMemoryHost(64 * gib, 24)).toBe(false)
    expect(isLowMemoryHost(16 * gib, 24)).toBe(true)
  })

  it('keeps generation bounds centralized', () => {
    expect(AI_CONFIG.contextSize).toBeGreaterThan(0)
    expect(AI_CONFIG.maxOutputTokens).toBeGreaterThan(0)
    expect(AI_CONFIG.healthTimeoutMs).toBeGreaterThan(AI_CONFIG.healthPollIntervalMs)
  })
})
