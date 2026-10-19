import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config'

export default mergeConfig(base, defineConfig({ test: { include: ['tests/perf/**/*.perf.test.ts'], testTimeout: 300_000 } }))
