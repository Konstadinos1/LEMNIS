import { defineConfig } from 'vitest/config';

// PocketIC spins up a replica per test file; the first start can be slow.
const POCKET_IC_TIMEOUT_MS = 60_000;

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        testTimeout: POCKET_IC_TIMEOUT_MS,
        hookTimeout: POCKET_IC_TIMEOUT_MS,
    },
});
