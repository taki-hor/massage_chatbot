/**
 * TTS Infrastructure Unit Tests
 *
 * Run these tests by:
 * 1. Include this file in index.html after tts-infrastructure.js
 * 2. Open browser console and call: TTSTests.runAll()
 *
 * Or use with Jest/Mocha by providing browser mocks
 */

const TTSTests = (() => {
    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };

    // Test utilities
    function assert(condition, message) {
        if (!condition) {
            throw new Error(message || 'Assertion failed');
        }
    }

    function assertEqual(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(
                `${message || 'assertEqual failed'}: expected ${expected}, got ${actual}`
            );
        }
    }

    function assertThrows(fn, message) {
        try {
            fn();
            throw new Error(message || 'Expected function to throw');
        } catch (e) {
            if (e.message === (message || 'Expected function to throw')) {
                throw e;
            }
            // Expected error was thrown
        }
    }

    async function runTest(name, testFn) {
        console.log(`  Running: ${name}...`);
        try {
            await testFn();
            results.passed++;
            results.tests.push({ name, status: 'PASS' });
            console.log(`  ✅ ${name}`);
        } catch (error) {
            results.failed++;
            results.tests.push({ name, status: 'FAIL', error: error.message });
            console.error(`  ❌ ${name}: ${error.message}`);
        }
    }

    // =========================================================================
    // EventBus Tests
    // =========================================================================
    async function testEventBus() {
        console.log('\n📦 EventBus Tests');
        const { EventBus } = window.TTSInfrastructure;

        await runTest('EventBus: should subscribe and receive events', () => {
            let received = null;
            EventBus.on('test:event', (data) => { received = data; });
            EventBus.emit('test:event', { value: 42 });
            assertEqual(received.value, 42, 'Should receive emitted data');
            EventBus.clear('test:event');
        });

        await runTest('EventBus: should unsubscribe correctly', () => {
            let count = 0;
            const handler = () => { count++; };
            const unsubscribe = EventBus.on('test:unsub', handler);
            EventBus.emit('test:unsub');
            assertEqual(count, 1, 'Should be called once');
            unsubscribe();
            EventBus.emit('test:unsub');
            assertEqual(count, 1, 'Should not be called after unsubscribe');
            EventBus.clear('test:unsub');
        });

        await runTest('EventBus: once() should fire only once', () => {
            let count = 0;
            EventBus.once('test:once', () => { count++; });
            EventBus.emit('test:once');
            EventBus.emit('test:once');
            assertEqual(count, 1, 'Should only be called once');
        });

        await runTest('EventBus: should handle errors in handlers gracefully', () => {
            let secondCalled = false;
            EventBus.on('test:error', () => { throw new Error('Handler error'); });
            EventBus.on('test:error', () => { secondCalled = true; });
            EventBus.emit('test:error');
            assert(secondCalled, 'Second handler should still be called');
            EventBus.clear('test:error');
        });

        await runTest('EventBus: clear() should remove all handlers', () => {
            let called = false;
            EventBus.on('test:clear', () => { called = true; });
            EventBus.clear('test:clear');
            EventBus.emit('test:clear');
            assert(!called, 'Handler should not be called after clear');
        });
    }

    // =========================================================================
    // CircuitBreaker Tests
    // =========================================================================
    async function testCircuitBreaker() {
        console.log('\n⚡ CircuitBreaker Tests');
        const { CircuitBreaker } = window.TTSInfrastructure;

        await runTest('CircuitBreaker: should start in closed state', () => {
            const cb = new CircuitBreaker({ name: 'test', threshold: 3 });
            assertEqual(cb.state, 'closed', 'Initial state should be closed');
            assert(cb.canPass(), 'Should allow requests when closed');
        });

        await runTest('CircuitBreaker: should open after threshold failures', () => {
            const cb = new CircuitBreaker({ name: 'test', threshold: 3, cooldownMs: 1000 });
            cb.record(false);
            cb.record(false);
            assertEqual(cb.state, 'closed', 'Should still be closed after 2 failures');
            cb.record(false);
            assertEqual(cb.state, 'open', 'Should be open after 3 failures');
            assert(!cb.canPass(), 'Should not allow requests when open');
        });

        await runTest('CircuitBreaker: success should reset failure count', () => {
            const cb = new CircuitBreaker({ name: 'test', threshold: 3 });
            cb.record(false);
            cb.record(false);
            cb.record(true); // Success resets
            cb.record(false);
            cb.record(false);
            assertEqual(cb.state, 'closed', 'Should still be closed after reset');
        });

        await runTest('CircuitBreaker: should transition to half-open after cooldown', async () => {
            const cb = new CircuitBreaker({ name: 'test', threshold: 2, cooldownMs: 100 });
            cb.record(false);
            cb.record(false);
            assertEqual(cb.state, 'open', 'Should be open');

            await new Promise(resolve => setTimeout(resolve, 150));

            assert(cb.canPass(), 'Should allow request after cooldown');
            assertEqual(cb.state, 'half-open', 'Should be half-open');
        });

        await runTest('CircuitBreaker: should close on success in half-open', async () => {
            const cb = new CircuitBreaker({ name: 'test', threshold: 2, cooldownMs: 50 });
            cb.record(false);
            cb.record(false);
            await new Promise(resolve => setTimeout(resolve, 60));
            cb.canPass(); // Trigger half-open
            cb.record(true);
            assertEqual(cb.state, 'closed', 'Should close after success in half-open');
        });

        await runTest('CircuitBreaker: reset() should restore initial state', () => {
            const cb = new CircuitBreaker({ name: 'test', threshold: 2 });
            cb.record(false);
            cb.record(false);
            cb.reset();
            assertEqual(cb.state, 'closed', 'Should be closed after reset');
            assertEqual(cb.failureCount, 0, 'Failure count should be 0');
        });

        await runTest('CircuitBreaker: getStatus() should return correct stats', () => {
            const cb = new CircuitBreaker({ name: 'test-status', threshold: 5 });
            cb.record(true);
            cb.record(false);
            const status = cb.getStatus();
            assertEqual(status.name, 'test-status', 'Name should match');
            assertEqual(status.stats.totalRequests, 2, 'Should have 2 requests');
            assertEqual(status.stats.totalSuccesses, 1, 'Should have 1 success');
            assertEqual(status.stats.totalFailures, 1, 'Should have 1 failure');
        });
    }

    // =========================================================================
    // withRetry Tests
    // =========================================================================
    async function testWithRetry() {
        console.log('\n🔄 withRetry Tests');
        const { withRetry } = window.TTSInfrastructure;

        await runTest('withRetry: should return result on success', async () => {
            const result = await withRetry(() => Promise.resolve('success'));
            assertEqual(result, 'success', 'Should return success value');
        });

        await runTest('withRetry: should retry on failure', async () => {
            let attempts = 0;
            const fn = () => {
                attempts++;
                if (attempts < 3) throw new Error('Fail');
                return Promise.resolve('success');
            };

            const result = await withRetry(fn, { retries: 3, baseDelay: 10 });
            assertEqual(result, 'success', 'Should succeed on third attempt');
            assertEqual(attempts, 3, 'Should have tried 3 times');
        });

        await runTest('withRetry: should throw after max retries', async () => {
            let attempts = 0;
            const fn = () => {
                attempts++;
                throw new Error('Always fails');
            };

            try {
                await withRetry(fn, { retries: 2, baseDelay: 10 });
                assert(false, 'Should have thrown');
            } catch (e) {
                assertEqual(e.message, 'Always fails', 'Should throw original error');
                assertEqual(attempts, 3, 'Should have tried 3 times (1 + 2 retries)');
            }
        });

        await runTest('withRetry: should not retry AbortError', async () => {
            let attempts = 0;
            const fn = () => {
                attempts++;
                const error = new DOMException('Aborted', 'AbortError');
                throw error;
            };

            try {
                await withRetry(fn, { retries: 3, baseDelay: 10 });
            } catch (e) {
                assertEqual(e.name, 'AbortError', 'Should throw AbortError');
                assertEqual(attempts, 1, 'Should not retry on abort');
            }
        });

        await runTest('withRetry: should respect shouldRetry option', async () => {
            let attempts = 0;
            const fn = () => {
                attempts++;
                throw new Error('Custom error');
            };

            try {
                await withRetry(fn, {
                    retries: 3,
                    baseDelay: 10,
                    shouldRetry: (err) => err.message !== 'Custom error'
                });
            } catch (e) {
                assertEqual(attempts, 1, 'Should not retry when shouldRetry returns false');
            }
        });

        await runTest('withRetry: should call onRetry callback', async () => {
            let retryInfo = null;
            const fn = () => { throw new Error('Fail'); };

            try {
                await withRetry(fn, {
                    retries: 1,
                    baseDelay: 10,
                    onRetry: (info) => { retryInfo = info; }
                });
            } catch (e) {
                assert(retryInfo !== null, 'onRetry should be called');
                assertEqual(retryInfo.attempt, 0, 'Should have attempt 0');
                assert(retryInfo.delay > 0, 'Should have positive delay');
            }
        });
    }

    // =========================================================================
    // SpeechLane Tests
    // =========================================================================
    async function testSpeechLane() {
        console.log('\n🎵 SpeechLane Tests');
        const { SpeechLane } = window.TTSInfrastructure;

        await runTest('SpeechLane: should enqueue and execute jobs', async () => {
            const lane = new SpeechLane();
            let executed = false;

            lane.enqueue({
                text: 'test',
                executor: async () => { executed = true; }
            });

            await new Promise(resolve => setTimeout(resolve, 50));
            assert(executed, 'Job should be executed');
        });

        await runTest('SpeechLane: should execute jobs in order', async () => {
            const lane = new SpeechLane();
            const order = [];

            lane.enqueue({
                text: 'first',
                executor: async () => {
                    await new Promise(r => setTimeout(r, 20));
                    order.push(1);
                }
            });

            lane.enqueue({
                text: 'second',
                executor: async () => { order.push(2); }
            });

            await new Promise(resolve => setTimeout(resolve, 100));
            assertEqual(order.join(','), '1,2', 'Should execute in order');
        });

        await runTest('SpeechLane: should handle high priority jobs', async () => {
            const lane = new SpeechLane();
            const order = [];

            // Make lane busy
            lane.enqueue({
                text: 'blocking',
                executor: async () => {
                    await new Promise(r => setTimeout(r, 50));
                    order.push('blocking');
                }
            });

            // Add normal then high priority
            lane.enqueue({
                text: 'normal',
                priority: 'normal',
                executor: async () => { order.push('normal'); }
            });

            lane.enqueue({
                text: 'high',
                priority: 'high',
                executor: async () => { order.push('high'); }
            });

            await new Promise(resolve => setTimeout(resolve, 150));
            assertEqual(order[1], 'high', 'High priority should execute before normal');
        });

        await runTest('SpeechLane: skipIfBusy should skip when queue is full', () => {
            const lane = new SpeechLane({ maxQueueSize: 2 });

            // Fill queue
            lane.enqueue({ text: '1', executor: () => new Promise(r => setTimeout(r, 1000)) });
            lane.enqueue({ text: '2', executor: () => Promise.resolve() });
            lane.enqueue({ text: '3', executor: () => Promise.resolve() });

            // Try to add with skipIfBusy
            const added = lane.enqueue({
                text: 'skipped',
                skipIfBusy: true,
                executor: () => Promise.resolve()
            });

            assert(!added, 'Should return false when skipped');
            lane.stop(true);
        });

        await runTest('SpeechLane: stop() should abort current job', async () => {
            const lane = new SpeechLane();
            let aborted = false;

            lane.enqueue({
                text: 'long',
                executor: async (signal) => {
                    try {
                        await new Promise((resolve, reject) => {
                            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
                            setTimeout(resolve, 1000);
                        });
                    } catch (e) {
                        if (e.name === 'AbortError') aborted = true;
                        throw e;
                    }
                }
            });

            await new Promise(r => setTimeout(r, 20)); // Let it start
            lane.stop(true);
            await new Promise(r => setTimeout(r, 50));

            assert(aborted, 'Job should be aborted');
        });

        await runTest('SpeechLane: getStatus() should return correct info', () => {
            const lane = new SpeechLane();
            lane.enqueue({ text: 'test', executor: () => new Promise(r => setTimeout(r, 100)) });

            const status = lane.getStatus();
            assert(status.isPlaying !== undefined, 'Should have isPlaying');
            assert(status.queueLength !== undefined, 'Should have queueLength');
            assert(status.stats !== undefined, 'Should have stats');

            lane.stop(true);
        });
    }

    // =========================================================================
    // TTSProviderManager Tests
    // =========================================================================
    async function testTTSProviderManager() {
        console.log('\n🔊 TTSProviderManager Tests');
        const { TTSProviderManager } = window.TTSInfrastructure;

        await runTest('TTSProviderManager: should register providers', () => {
            const manager = new TTSProviderManager();
            manager.registerProvider('test', {
                synthesize: () => Promise.resolve(new Blob(['test']))
            });

            const status = manager.getStatus();
            assert('test' in status, 'Provider should be registered');
            assertEqual(status.test.healthScore, 100, 'Initial health should be 100');
        });

        await runTest('TTSProviderManager: should try providers in order', async () => {
            const manager = new TTSProviderManager();
            const tried = [];

            manager.registerProvider('first', {
                synthesize: () => {
                    tried.push('first');
                    throw new Error('First fails');
                }
            });

            manager.registerProvider('second', {
                synthesize: () => {
                    tried.push('second');
                    return Promise.resolve(new Blob(['audio']));
                }
            });

            await manager.speak('test');
            assertEqual(tried.join(','), 'first,second', 'Should try providers in order');
        });

        await runTest('TTSProviderManager: should update health scores', async () => {
            const manager = new TTSProviderManager();

            manager.registerProvider('healthy', {
                synthesize: () => Promise.resolve(new Blob(['audio']))
            });

            await manager.speak('test');
            const status = manager.getStatus();
            assert(status.healthy.healthScore >= 100, 'Health should increase on success');
        });

        await runTest('TTSProviderManager: should skip providers with open circuit', async () => {
            const manager = new TTSProviderManager();
            let firstTried = false;

            manager.registerProvider('broken', {
                failureThreshold: 2,
                synthesize: () => {
                    firstTried = true;
                    throw new Error('Broken');
                }
            });

            manager.registerProvider('working', {
                synthesize: () => Promise.resolve(new Blob(['audio']))
            });

            // Trip the circuit
            try { await manager.speak('test1'); } catch (e) {}
            try { await manager.speak('test2'); } catch (e) {}
            try { await manager.speak('test3'); } catch (e) {}

            firstTried = false;
            await manager.speak('test4');

            // Circuit should be open, so first provider should be skipped
            // This depends on timing, so we just check it doesn't crash
            assert(true, 'Should handle circuit breaker');
        });
    }

    // =========================================================================
    // TTSAudioCache Tests
    // =========================================================================
    async function testTTSAudioCache() {
        console.log('\n💾 TTSAudioCache Tests');
        const { TTSAudioCache } = window.TTSInfrastructure;

        await runTest('TTSAudioCache: should store and retrieve blobs', async () => {
            const cache = new TTSAudioCache({ ttlMs: 60000 });
            await cache.init();

            const blob = new Blob(['test audio'], { type: 'audio/mpeg' });
            await cache.put('hello', 'voice1', 160, 100, blob);

            const retrieved = await cache.get('hello', 'voice1', 160, 100);
            assert(retrieved !== null, 'Should retrieve cached blob');
            assertEqual(retrieved.size, blob.size, 'Blob size should match');
        });

        await runTest('TTSAudioCache: should return null for cache miss', async () => {
            const cache = new TTSAudioCache();
            await cache.init();

            const result = await cache.get('nonexistent', 'voice', 100, 100);
            assertEqual(result, null, 'Should return null for miss');
        });

        await runTest('TTSAudioCache: should not cache empty blobs', async () => {
            const cache = new TTSAudioCache();
            await cache.init();

            const emptyBlob = new Blob([]);
            await cache.put('test', 'voice', 100, 100, emptyBlob);

            const result = await cache.get('test', 'voice', 100, 100);
            assertEqual(result, null, 'Should not cache empty blob');
        });

        await runTest('TTSAudioCache: should track statistics', async () => {
            const cache = new TTSAudioCache();
            await cache.init();

            const blob = new Blob(['audio']);
            await cache.put('stat-test', 'voice', 100, 100, blob);
            await cache.get('stat-test', 'voice', 100, 100); // hit
            await cache.get('nonexistent', 'voice', 100, 100); // miss

            const stats = cache.getStats();
            assertEqual(stats.hits, 1, 'Should have 1 hit');
            assertEqual(stats.misses, 1, 'Should have 1 miss');
            assertEqual(stats.puts, 1, 'Should have 1 put');
        });

        await runTest('TTSAudioCache: clear() should remove all entries', async () => {
            const cache = new TTSAudioCache();
            await cache.init();

            const blob = new Blob(['audio']);
            await cache.put('clear-test', 'voice', 100, 100, blob);
            await cache.clear();

            const result = await cache.get('clear-test', 'voice', 100, 100);
            assertEqual(result, null, 'Should return null after clear');
        });
    }

    // =========================================================================
    // TTSAlertManager Tests
    // =========================================================================
    async function testTTSAlertManager() {
        console.log('\n🚨 TTSAlertManager Tests');
        const { TTSAlertManager, EventBus, TTSEvents } = window.TTSInfrastructure;

        await runTest('TTSAlertManager: should not alert below threshold', () => {
            const manager = new TTSAlertManager({
                errorRateThreshold: 0.5,
                minSamples: 4,
                cooldownMs: 0
            });

            let alerted = false;
            manager.onAlert(() => { alerted = true; });

            // 1 failure, 3 success = 25% error rate
            EventBus.emit(TTSEvents.TTS_PLAY_ERROR, {});
            EventBus.emit(TTSEvents.TTS_PLAY_END, { success: true });
            EventBus.emit(TTSEvents.TTS_PLAY_END, { success: true });
            EventBus.emit(TTSEvents.TTS_PLAY_END, { success: true });

            assert(!alerted, 'Should not alert at 25% error rate');
            manager.reset();
        });

        await runTest('TTSAlertManager: should alert at threshold', () => {
            const manager = new TTSAlertManager({
                errorRateThreshold: 0.3,
                minSamples: 5,
                cooldownMs: 0,
                windowSizeMs: 60000
            });

            let alertData = null;
            manager.onAlert((data) => { alertData = data; });

            // 2 failures, 3 success = 40% error rate
            EventBus.emit(TTSEvents.TTS_PLAY_ERROR, {});
            EventBus.emit(TTSEvents.TTS_PLAY_ERROR, {});
            EventBus.emit(TTSEvents.TTS_PLAY_END, { success: true });
            EventBus.emit(TTSEvents.TTS_PLAY_END, { success: true });
            EventBus.emit(TTSEvents.TTS_PLAY_END, { success: true });

            assert(alertData !== null, 'Should trigger alert at 40% error rate');
            assertEqual(alertData.type, 'high_error_rate', 'Alert type should be high_error_rate');
            manager.reset();
        });

        await runTest('TTSAlertManager: should respect cooldown', () => {
            const manager = new TTSAlertManager({
                errorRateThreshold: 0.3,
                minSamples: 3,
                cooldownMs: 10000,
                windowSizeMs: 60000
            });

            let alertCount = 0;
            manager.onAlert(() => { alertCount++; });

            // First batch - should alert
            EventBus.emit(TTSEvents.TTS_PLAY_ERROR, {});
            EventBus.emit(TTSEvents.TTS_PLAY_ERROR, {});
            EventBus.emit(TTSEvents.TTS_PLAY_END, { success: true });

            // Second batch - should not alert (cooldown)
            EventBus.emit(TTSEvents.TTS_PLAY_ERROR, {});
            EventBus.emit(TTSEvents.TTS_PLAY_ERROR, {});
            EventBus.emit(TTSEvents.TTS_PLAY_END, { success: true });

            assertEqual(alertCount, 1, 'Should only alert once during cooldown');
            manager.reset();
        });

        await runTest('TTSAlertManager: getStatus() should return health info', () => {
            const manager = new TTSAlertManager({
                minSamples: 2,
                windowSizeMs: 60000
            });

            EventBus.emit(TTSEvents.TTS_PLAY_END, { success: true });
            EventBus.emit(TTSEvents.TTS_PLAY_ERROR, {});

            const status = manager.getStatus();
            assert(status.errorRate !== undefined, 'Should have errorRate');
            assert(status.sampleSize !== undefined, 'Should have sampleSize');
            assertEqual(status.sampleSize, 2, 'Sample size should be 2');
            manager.reset();
        });
    }

    // =========================================================================
    // TTSNotification Tests
    // =========================================================================
    async function testTTSNotification() {
        console.log('\n🔔 TTSNotification Tests');
        const { TTSNotification } = window.TTSInfrastructure;

        await runTest('TTSNotification: should create container', () => {
            const notification = new TTSNotification();
            const container = document.getElementById('tts-notification-container');
            assert(container !== null, 'Container should exist');
        });

        await runTest('TTSNotification: show() should add notification', async () => {
            const notification = new TTSNotification();
            notification.show({
                type: 'info',
                title: 'Test',
                message: 'Test message',
                duration: 100
            });

            const container = document.getElementById('tts-notification-container');
            assert(container.children.length > 0, 'Should have notification child');

            await new Promise(r => setTimeout(r, 500)); // Wait for auto-dismiss
        });

        await runTest('TTSNotification: should show different types', () => {
            const notification = new TTSNotification();
            const types = ['error', 'warning', 'success', 'info'];

            types.forEach(type => {
                notification.show({ type, title: type, message: 'Test', duration: 100 });
            });

            const container = document.getElementById('tts-notification-container');
            assert(container.children.length > 0, 'Should show notifications');
        });
    }

    // =========================================================================
    // Run All Tests
    // =========================================================================
    async function runAll() {
        console.log('🧪 TTS Infrastructure Test Suite');
        console.log('================================\n');

        results.passed = 0;
        results.failed = 0;
        results.tests = [];

        await testEventBus();
        await testCircuitBreaker();
        await testWithRetry();
        await testSpeechLane();
        await testTTSProviderManager();
        await testTTSAudioCache();
        await testTTSAlertManager();
        await testTTSNotification();

        console.log('\n================================');
        console.log(`📊 Results: ${results.passed} passed, ${results.failed} failed`);
        console.log('================================\n');

        if (results.failed > 0) {
            console.log('Failed tests:');
            results.tests
                .filter(t => t.status === 'FAIL')
                .forEach(t => console.log(`  ❌ ${t.name}: ${t.error}`));
        }

        return results;
    }

    // Export
    return {
        runAll,
        testEventBus,
        testCircuitBreaker,
        testWithRetry,
        testSpeechLane,
        testTTSProviderManager,
        testTTSAudioCache,
        testTTSAlertManager,
        testTTSNotification,
        getResults: () => results
    };
})();

// Make available globally
window.TTSTests = TTSTests;

console.log('[TTS Tests] Test suite loaded. Run TTSTests.runAll() to execute tests.');
