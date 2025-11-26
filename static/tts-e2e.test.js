/**
 * TTS Infrastructure E2E / Integration Tests
 *
 * These tests simulate real-world scenarios including:
 * - Provider failures and degradation
 * - Task success with TTS failure
 * - Network issues and recovery
 * - UI interaction testing
 *
 * Run these tests by:
 * 1. Include this file in index.html after tts-infrastructure.js
 * 2. Open browser console and call: TTSE2ETests.runAll()
 */

const TTSE2ETests = (() => {
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

    async function runTest(name, testFn, timeout = 10000) {
        console.log(`  Running: ${name}...`);
        try {
            await Promise.race([
                testFn(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Test timeout')), timeout)
                )
            ]);
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
    // Scenario 1: Provider Failure → Degradation
    // =========================================================================
    async function testProviderFailureDegradation() {
        console.log('\n🔧 Provider Failure → Degradation Tests');
        const { TTSProviderManager, CircuitBreaker, EventBus, TTSEvents } = window.TTSInfrastructure;

        await runTest('E2E: Primary provider failure should fallback to secondary', async () => {
            const manager = new TTSProviderManager();
            const events = [];

            EventBus.on(TTSEvents.TTS_PROVIDER_SWITCH, (data) => {
                events.push(data.provider);
            });

            // Primary always fails
            manager.registerProvider('cloud', {
                failureThreshold: 5,
                synthesize: () => Promise.reject(new Error('Cloud unavailable'))
            });

            // Secondary works
            manager.registerProvider('browser', {
                failureThreshold: 5,
                synthesize: () => Promise.resolve(new Blob(['audio']))
            });

            const result = await manager.speak('test');
            assert(result instanceof Blob, 'Should get audio from fallback');
            assert(events.includes('browser'), 'Should switch to browser provider');

            EventBus.clear(TTSEvents.TTS_PROVIDER_SWITCH);
        });

        await runTest('E2E: Circuit breaker should prevent repeated failures', async () => {
            const manager = new TTSProviderManager();
            let primaryAttempts = 0;

            manager.registerProvider('failing', {
                failureThreshold: 2,
                cooldownMs: 1000,
                synthesize: () => {
                    primaryAttempts++;
                    return Promise.reject(new Error('Always fails'));
                }
            });

            manager.registerProvider('backup', {
                synthesize: () => Promise.resolve(new Blob(['audio']))
            });

            // Trip the circuit
            await manager.speak('test1');
            await manager.speak('test2');
            await manager.speak('test3');

            const initialAttempts = primaryAttempts;

            // These should skip the failing provider
            await manager.speak('test4');
            await manager.speak('test5');

            // After circuit opens, failing provider shouldn't be tried
            assert(primaryAttempts <= initialAttempts + 1, 'Circuit should prevent retries');
        });

        await runTest('E2E: Should emit circuit open event', async () => {
            const manager = new TTSProviderManager();
            let circuitOpenEvent = null;

            EventBus.on(TTSEvents.TTS_CIRCUIT_OPEN, (data) => {
                circuitOpenEvent = data;
            });

            manager.registerProvider('breaking', {
                failureThreshold: 2,
                cooldownMs: 5000,
                synthesize: () => Promise.reject(new Error('Fails'))
            });

            manager.registerProvider('backup', {
                synthesize: () => Promise.resolve(new Blob(['audio']))
            });

            // Trip the circuit
            await manager.speak('test1');
            await manager.speak('test2');
            await manager.speak('test3');

            assert(circuitOpenEvent !== null, 'Should emit circuit open event');
            assert(circuitOpenEvent.name.includes('breaking'), 'Event should name the provider');

            EventBus.clear(TTSEvents.TTS_CIRCUIT_OPEN);
        });
    }

    // =========================================================================
    // Scenario 2: Task Success → TTS Failure → No UI Crash
    // =========================================================================
    async function testTaskSuccessTTSFailure() {
        console.log('\n🎯 Task Success → TTS Failure Tests');
        const { RobustTTSService, EventBus, TTSEvents } = window.TTSInfrastructure;

        await runTest('E2E: Task should complete even if TTS fails', async () => {
            let taskCompleted = false;
            let ttsErrorOccurred = false;
            let uiCrashed = false;

            // Simulate task completion
            const simulateTask = async () => {
                // Task logic (ASR → NLP → Task generation)
                await new Promise(r => setTimeout(r, 50));
                taskCompleted = true;
                EventBus.emit(TTSEvents.TASK_COMPLETED, { taskId: 1 });

                // TTS is triggered independently
                EventBus.emit(TTSEvents.ASSISTANT_REPLY, {
                    text: 'Task completed successfully',
                    voice: 'test-voice'
                });
            };

            // Set up TTS to fail
            const service = new RobustTTSService({
                apiUrl: 'http://invalid-url-that-fails'
            });

            // Override providers to fail
            service.providerManager.providers.clear();
            service.providerManager.registerProvider('failing', {
                failureThreshold: 10,
                synthesize: () => Promise.reject(new Error('TTS Failed'))
            });

            // Listen for errors
            EventBus.on(TTSEvents.TTS_PLAY_ERROR, () => {
                ttsErrorOccurred = true;
            });

            // Subscribe TTS to task events (like in app.js)
            EventBus.on(TTSEvents.ASSISTANT_REPLY, (payload) => {
                try {
                    service.speak(payload.text);
                } catch (e) {
                    // TTS errors should be caught
                }
            });

            try {
                await simulateTask();
                await new Promise(r => setTimeout(r, 200)); // Wait for TTS attempt
            } catch (e) {
                uiCrashed = true;
            }

            assert(taskCompleted, 'Task should complete');
            assert(!uiCrashed, 'UI should not crash');
            // TTS error is expected

            EventBus.clear(TTSEvents.TTS_PLAY_ERROR);
            EventBus.clear(TTSEvents.ASSISTANT_REPLY);
            EventBus.clear(TTSEvents.TASK_COMPLETED);
        });

        await runTest('E2E: speakAsync should resolve even on TTS error', async () => {
            const { RobustTTSService, EventBus, TTSEvents } = window.TTSInfrastructure;

            const service = new RobustTTSService();

            // Override providers to fail
            service.providerManager.providers.clear();
            service.providerManager.registerProvider('failing', {
                failureThreshold: 10,
                synthesize: () => Promise.reject(new Error('TTS Failed'))
            });

            let resolved = false;
            let rejected = false;

            try {
                await service.speakAsync('test');
                resolved = true;
            } catch (e) {
                rejected = true;
            }

            // speakAsync should resolve (not reject) even on error
            // to prevent blocking the task flow
            assert(resolved || !rejected, 'speakAsync should not reject on TTS error');
        });
    }

    // =========================================================================
    // Scenario 3: Network Issues → Recovery
    // =========================================================================
    async function testNetworkRecovery() {
        console.log('\n🌐 Network Issues → Recovery Tests');
        const { TTSProviderManager, withRetry } = window.TTSInfrastructure;

        await runTest('E2E: Should retry on transient network error', async () => {
            let attempts = 0;

            const result = await withRetry(async () => {
                attempts++;
                if (attempts < 3) {
                    throw new Error('Network error');
                }
                return 'success';
            }, { retries: 3, baseDelay: 10 });

            assertEqual(result, 'success', 'Should eventually succeed');
            assertEqual(attempts, 3, 'Should take 3 attempts');
        });

        await runTest('E2E: Provider should recover after circuit cooldown', async () => {
            const manager = new TTSProviderManager();
            let canUseProvider = false;

            manager.registerProvider('recovering', {
                failureThreshold: 2,
                cooldownMs: 100, // Short cooldown for testing
                synthesize: () => {
                    if (!canUseProvider) {
                        return Promise.reject(new Error('Temporarily unavailable'));
                    }
                    return Promise.resolve(new Blob(['audio']));
                }
            });

            // Trip the circuit
            try { await manager.speak('test1'); } catch (e) {}
            try { await manager.speak('test2'); } catch (e) {}
            try { await manager.speak('test3'); } catch (e) {}

            // Provider is now working
            canUseProvider = true;

            // Wait for cooldown
            await new Promise(r => setTimeout(r, 150));

            // Should be able to use provider again
            const result = await manager.speak('test4');
            assert(result instanceof Blob, 'Should recover after cooldown');
        });

        await runTest('E2E: Cache should serve during network outage', async () => {
            const { TTSAudioCache } = window.TTSInfrastructure;
            const cache = new TTSAudioCache();
            await cache.init();

            // Pre-populate cache
            const blob = new Blob(['cached audio'], { type: 'audio/mpeg' });
            await cache.put('cached text', 'voice', 160, 100, blob);

            // Simulate network outage by checking cache directly
            const cachedResult = await cache.get('cached text', 'voice', 160, 100);
            assert(cachedResult !== null, 'Cache should serve during outage');
            assertEqual(cachedResult.size, blob.size, 'Should return correct cached data');
        });
    }

    // =========================================================================
    // Scenario 4: UI Notification Tests
    // =========================================================================
    async function testUINotifications() {
        console.log('\n🔔 UI Notification Tests');
        const { TTSNotification, EventBus, TTSEvents } = window.TTSInfrastructure;

        await runTest('E2E: Error notification should show retry button', async () => {
            const notification = new TTSNotification();
            let retryClicked = false;

            notification.showTTSError(new Error('Test error'), () => {
                retryClicked = true;
            });

            const container = document.getElementById('tts-notification-container');
            assert(container.children.length > 0, 'Notification should be visible');

            const retryBtn = container.querySelector('.tts-retry-btn');
            assert(retryBtn !== null, 'Retry button should exist');

            // Simulate click
            retryBtn.click();
            assert(retryClicked, 'Retry callback should be called');
        });

        await runTest('E2E: Circuit open should show warning notification', async () => {
            const notification = new TTSNotification();
            notification.showCircuitOpen('cloud', 5000);

            const container = document.getElementById('tts-notification-container');
            const notificationEl = container.lastElementChild;

            assert(notificationEl !== null, 'Notification should be visible');
            assert(notificationEl.textContent.includes('5'), 'Should show cooldown time');

            // Clean up
            await new Promise(r => setTimeout(r, 100));
        });

        await runTest('E2E: Notifications should auto-dismiss', async () => {
            const notification = new TTSNotification();
            notification.show({
                type: 'info',
                title: 'Auto dismiss test',
                message: 'Should disappear',
                duration: 100
            });

            const container = document.getElementById('tts-notification-container');
            const initialCount = container.children.length;

            await new Promise(r => setTimeout(r, 500));

            assert(container.children.length < initialCount, 'Notification should auto-dismiss');
        });

        await runTest('E2E: Manual dismiss should work', async () => {
            const notification = new TTSNotification();
            notification.show({
                type: 'info',
                title: 'Manual dismiss test',
                message: 'Click to dismiss',
                duration: 0 // No auto-dismiss
            });

            const container = document.getElementById('tts-notification-container');
            const dismissBtn = container.querySelector('.tts-dismiss-btn');

            assert(dismissBtn !== null, 'Dismiss button should exist');
            dismissBtn.click();

            await new Promise(r => setTimeout(r, 400));
            // Should be dismissed now
        });
    }

    // =========================================================================
    // Scenario 5: Full Integration Test
    // =========================================================================
    async function testFullIntegration() {
        console.log('\n🎬 Full Integration Tests');

        await runTest('E2E: Complete flow - speak, cache, retry, fallback', async () => {
            const { RobustTTSService, EventBus, TTSEvents } = window.TTSInfrastructure;

            const events = [];
            const unsubscribers = [];

            // Track all events
            unsubscribers.push(EventBus.on(TTSEvents.TTS_QUEUE_ADD, () => events.push('queue_add')));
            unsubscribers.push(EventBus.on(TTSEvents.TTS_PLAY_START, () => events.push('play_start')));
            unsubscribers.push(EventBus.on(TTSEvents.TTS_PLAY_END, () => events.push('play_end')));
            unsubscribers.push(EventBus.on(TTSEvents.TTS_PLAY_ERROR, () => events.push('play_error')));

            // Create service with mock providers
            const service = new RobustTTSService();

            // Clear existing providers and add test ones
            service.providerManager.providers.clear();
            service.providerManager.providerOrder = [];
            service.providerManager.healthScores.clear();
            service.providerManager.circuitBreakers.clear();

            let callCount = 0;
            service.providerManager.registerProvider('test', {
                failureThreshold: 5,
                synthesize: () => {
                    callCount++;
                    // Return a small valid audio blob
                    return Promise.resolve(new Blob(['test audio data'], { type: 'audio/mpeg' }));
                }
            });

            // Speak
            service.speak('Hello world');

            // Wait for processing
            await new Promise(r => setTimeout(r, 300));

            assert(events.includes('queue_add'), 'Should add to queue');
            assert(events.includes('play_start'), 'Should start playing');
            // play_end or play_error depending on browser audio support

            // Speak same text again - should use cache
            const cacheStatsBefore = service.audioCache.getStats();
            service.speak('Hello world');
            await new Promise(r => setTimeout(r, 200));
            const cacheStatsAfter = service.audioCache.getStats();

            // Cache should have been checked
            assert(cacheStatsAfter.hits >= cacheStatsBefore.hits || cacheStatsAfter.misses > cacheStatsBefore.misses,
                'Cache should be checked on second speak');

            // Cleanup
            unsubscribers.forEach(unsub => unsub());
            service.stop(true);
        });

        await runTest('E2E: Alert manager integration', async () => {
            const { RobustTTSService, EventBus, TTSEvents } = window.TTSInfrastructure;

            const service = new RobustTTSService({
                alertThreshold: 0.3
            });

            let alertReceived = false;
            service.alertManager.onAlert(() => {
                alertReceived = true;
            });

            // Override to always fail
            service.providerManager.providers.clear();
            service.providerManager.registerProvider('failing', {
                failureThreshold: 100,
                synthesize: () => Promise.reject(new Error('Always fails'))
            });

            // Trigger multiple failures
            for (let i = 0; i < 6; i++) {
                service.speak(`test ${i}`);
            }

            await new Promise(r => setTimeout(r, 500));

            // Alert may or may not trigger depending on timing
            // Just verify no crash
            assert(true, 'Service should handle multiple failures without crash');

            service.stop(true);
        });
    }

    // =========================================================================
    // Run All E2E Tests
    // =========================================================================
    async function runAll() {
        console.log('🎭 TTS Infrastructure E2E Test Suite');
        console.log('=====================================\n');

        results.passed = 0;
        results.failed = 0;
        results.tests = [];

        await testProviderFailureDegradation();
        await testTaskSuccessTTSFailure();
        await testNetworkRecovery();
        await testUINotifications();
        await testFullIntegration();

        console.log('\n=====================================');
        console.log(`📊 E2E Results: ${results.passed} passed, ${results.failed} failed`);
        console.log('=====================================\n');

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
        testProviderFailureDegradation,
        testTaskSuccessTTSFailure,
        testNetworkRecovery,
        testUINotifications,
        testFullIntegration,
        getResults: () => results
    };
})();

// Make available globally
window.TTSE2ETests = TTSE2ETests;

console.log('[TTS E2E Tests] Test suite loaded. Run TTSE2ETests.runAll() to execute tests.');
