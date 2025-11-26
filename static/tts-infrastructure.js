/**
 * TTS Infrastructure - Robust, Decoupled TTS System
 *
 * This module provides:
 * 1. Event Bus - Decouples TTS from task lifecycle
 * 2. Circuit Breaker - Handles provider failures with automatic failover
 * 3. Speech Lane (Audio Queue) - Prevents overlapping playback
 * 4. Retry with Exponential Backoff - Handles transient failures
 * 5. AbortController Integration - Supports cancellation
 * 6. TTS Provider Abstraction - Unified interface with fallback chain
 * 7. Telemetry - Monitoring and diagnostics
 */

// ============================================================================
// 1. EVENT BUS - Decouples TTS from Task Lifecycle
// ============================================================================

const EventBus = (() => {
    const subscribers = new Map();

    return {
        /**
         * Subscribe to an event
         * @param {string} event - Event name
         * @param {Function} callback - Handler function
         * @returns {Function} Unsubscribe function
         */
        on(event, callback) {
            if (!subscribers.has(event)) {
                subscribers.set(event, new Set());
            }
            subscribers.get(event).add(callback);

            // Return unsubscribe function
            return () => this.off(event, callback);
        },

        /**
         * Subscribe to an event once
         * @param {string} event - Event name
         * @param {Function} callback - Handler function
         */
        once(event, callback) {
            const wrapper = (payload) => {
                this.off(event, wrapper);
                callback(payload);
            };
            this.on(event, wrapper);
        },

        /**
         * Unsubscribe from an event
         * @param {string} event - Event name
         * @param {Function} callback - Handler function
         */
        off(event, callback) {
            const handlers = subscribers.get(event);
            if (handlers) {
                handlers.delete(callback);
            }
        },

        /**
         * Emit an event
         * @param {string} event - Event name
         * @param {*} payload - Event data
         */
        emit(event, payload) {
            const handlers = subscribers.get(event);
            if (handlers) {
                handlers.forEach(callback => {
                    try {
                        callback(payload);
                    } catch (error) {
                        console.error(`[EventBus] Error in handler for ${event}:`, error);
                    }
                });
            }
        },

        /**
         * Clear all subscribers for an event (or all events)
         * @param {string} [event] - Optional event name
         */
        clear(event) {
            if (event) {
                subscribers.delete(event);
            } else {
                subscribers.clear();
            }
        }
    };
})();

// Event constants
const TTSEvents = {
    // Task lifecycle (TTS is just a subscriber)
    TASK_CREATED: 'task:created',
    TASK_STARTED: 'task:started',
    TASK_PROGRESS: 'task:progress',
    TASK_COMPLETED: 'task:completed',
    TASK_FAILED: 'task:failed',
    TASK_CANCELLED: 'task:cancelled',

    // TTS specific events
    TTS_QUEUE_ADD: 'tts:queue:add',
    TTS_PLAY_START: 'tts:play:start',
    TTS_PLAY_END: 'tts:play:end',
    TTS_PLAY_ERROR: 'tts:play:error',
    TTS_PROVIDER_SWITCH: 'tts:provider:switch',
    TTS_CIRCUIT_OPEN: 'tts:circuit:open',
    TTS_CIRCUIT_CLOSE: 'tts:circuit:close',

    // Assistant responses (TTS subscribes to these)
    ASSISTANT_REPLY: 'assistant:reply',
    ASSISTANT_DIALOGUE: 'assistant:dialogue'
};

// ============================================================================
// 2. CIRCUIT BREAKER - Handles Provider Failures
// ============================================================================

class CircuitBreaker {
    constructor(options = {}) {
        this.name = options.name || 'unnamed';
        this.threshold = options.threshold || 5;          // Failures before opening
        this.cooldownMs = options.cooldownMs || 15000;    // Time before retry
        this.halfOpenMax = options.halfOpenMax || 2;      // Test requests in half-open

        this.failureCount = 0;
        this.successCount = 0;
        this.state = 'closed';    // closed, open, half-open
        this.openUntil = 0;
        this.halfOpenRequests = 0;

        // Statistics
        this.stats = {
            totalRequests: 0,
            totalFailures: 0,
            totalSuccesses: 0,
            lastFailure: null,
            lastSuccess: null,
            timesOpened: 0
        };
    }

    /**
     * Check if request can proceed
     * @returns {boolean}
     */
    canPass() {
        const now = Date.now();

        if (this.state === 'closed') {
            return true;
        }

        if (this.state === 'open') {
            if (now >= this.openUntil) {
                // Transition to half-open
                this.state = 'half-open';
                this.halfOpenRequests = 0;
                console.log(`[CircuitBreaker:${this.name}] Transitioning to half-open state`);
                return true;
            }
            return false;
        }

        if (this.state === 'half-open') {
            // Allow limited requests to test
            return this.halfOpenRequests < this.halfOpenMax;
        }

        return false;
    }

    /**
     * Record the result of a request
     * @param {boolean} success - Whether request succeeded
     */
    record(success) {
        this.stats.totalRequests++;

        if (success) {
            this.stats.totalSuccesses++;
            this.stats.lastSuccess = Date.now();
            this.successCount++;
            this.failureCount = 0;

            if (this.state === 'half-open') {
                // Success in half-open, close the circuit
                this.state = 'closed';
                this.halfOpenRequests = 0;
                console.log(`[CircuitBreaker:${this.name}] Circuit CLOSED (recovered)`);
                EventBus.emit(TTSEvents.TTS_CIRCUIT_CLOSE, { name: this.name });
            }
        } else {
            this.stats.totalFailures++;
            this.stats.lastFailure = Date.now();
            this.failureCount++;
            this.successCount = 0;

            if (this.state === 'half-open') {
                this.halfOpenRequests++;
                if (this.halfOpenRequests >= this.halfOpenMax) {
                    // Failed in half-open, re-open the circuit
                    this._open();
                }
            } else if (this.failureCount >= this.threshold) {
                this._open();
            }
        }
    }

    _open() {
        this.state = 'open';
        this.openUntil = Date.now() + this.cooldownMs;
        this.stats.timesOpened++;
        console.warn(`[CircuitBreaker:${this.name}] Circuit OPEN until ${new Date(this.openUntil).toLocaleTimeString()}`);
        EventBus.emit(TTSEvents.TTS_CIRCUIT_OPEN, {
            name: this.name,
            until: this.openUntil,
            cooldownMs: this.cooldownMs
        });
    }

    /**
     * Force reset the circuit breaker
     */
    reset() {
        this.state = 'closed';
        this.failureCount = 0;
        this.successCount = 0;
        this.openUntil = 0;
        this.halfOpenRequests = 0;
    }

    /**
     * Get current state and statistics
     * @returns {Object}
     */
    getStatus() {
        return {
            name: this.name,
            state: this.state,
            failureCount: this.failureCount,
            openUntil: this.state === 'open' ? this.openUntil : null,
            stats: { ...this.stats }
        };
    }
}

// ============================================================================
// 3. RETRY WITH EXPONENTIAL BACKOFF
// ============================================================================

/**
 * Execute a function with retry and exponential backoff
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @returns {Promise<*>}
 */
async function withRetry(fn, options = {}) {
    const {
        retries = 2,
        baseDelay = 300,
        maxDelay = 5000,
        shouldRetry = (error) => true,
        onRetry = null
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Check if error is due to abort
            if (error.name === 'AbortError') {
                throw error; // Don't retry aborted requests
            }

            // Check if we should retry
            if (attempt >= retries || !shouldRetry(error)) {
                throw error;
            }

            // Calculate delay with exponential backoff
            const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

            if (onRetry) {
                onRetry({ attempt, delay, error });
            }

            console.log(`[Retry] Attempt ${attempt + 1}/${retries + 1} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

// ============================================================================
// 4. SPEECH LANE (AUDIO QUEUE) - Prevents Overlapping Playback
// ============================================================================

class SpeechLane {
    constructor(options = {}) {
        this.queue = [];
        this.isPlaying = false;
        this.currentJob = null;
        this.currentAbortController = null;
        this.maxQueueSize = options.maxQueueSize || 10;
        this.onStateChange = options.onStateChange || null;
        this.defaultMaxAgeMs = options.defaultMaxAgeMs || 8000; // Default 8s staleness

        // Session tracking - TTS from old sessions won't play
        this.currentSessionId = null;

        // Statistics
        this.stats = {
            totalEnqueued: 0,
            totalPlayed: 0,
            totalSkipped: 0,
            totalFailed: 0,
            totalStale: 0  // Track discarded stale jobs
        };
    }

    /**
     * Set the current session ID - TTS jobs with mismatched session IDs are discarded
     * @param {string|null} sessionId - Current session ID or null to disable session tracking
     */
    setSessionId(sessionId) {
        this.currentSessionId = sessionId;
        console.log(`[SpeechLane] Session ID set to: ${sessionId}`);
    }

    /**
     * Add a speech job to the queue
     * @param {Object} job - Speech job
     * @param {string} job.text - Text to speak
     * @param {Function} job.executor - Async function that performs TTS
     * @param {string} [job.priority='normal'] - Priority: 'high', 'normal', 'low'
     * @param {boolean} [job.skipIfBusy=false] - Skip if queue is too long
     * @param {number} [job.maxAgeMs] - Max age before job is considered stale and discarded
     * @param {string} [job.sessionId] - Session ID to validate before playing
     * @returns {Promise<boolean>} Whether job was enqueued
     */
    enqueue(job) {
        // Validate job
        if (!job || !job.executor || typeof job.executor !== 'function') {
            console.error('[SpeechLane] Invalid job:', job);
            return false;
        }

        // Skip if queue is too long and job allows it
        if (job.skipIfBusy && this.queue.length >= this.maxQueueSize) {
            console.log('[SpeechLane] Queue full, skipping non-essential speech');
            this.stats.totalSkipped++;
            return false;
        }

        // Add to queue based on priority
        const wrappedJob = {
            ...job,
            id: Date.now() + Math.random(),
            enqueuedAt: Date.now(),
            priority: job.priority || 'normal',
            maxAgeMs: job.maxAgeMs || this.defaultMaxAgeMs,
            sessionId: job.sessionId || this.currentSessionId  // Capture current session
        };

        if (wrappedJob.priority === 'high') {
            // Insert after current high-priority items
            const insertIndex = this.queue.findIndex(j => j.priority !== 'high');
            if (insertIndex === -1) {
                this.queue.push(wrappedJob);
            } else {
                this.queue.splice(insertIndex, 0, wrappedJob);
            }
        } else {
            this.queue.push(wrappedJob);
        }

        this.stats.totalEnqueued++;
        EventBus.emit(TTSEvents.TTS_QUEUE_ADD, {
            queueLength: this.queue.length,
            jobId: wrappedJob.id
        });

        // Start processing if not already
        this._drain();

        return true;
    }

    /**
     * Check if a job is stale (too old to play)
     * @param {Object} job - The job to check
     * @returns {boolean} True if job is stale and should be discarded
     */
    _isJobStale(job) {
        const age = Date.now() - job.enqueuedAt;
        if (age > job.maxAgeMs) {
            console.log(`[SpeechLane] Job stale (${age}ms > ${job.maxAgeMs}ms): "${job.text?.substring(0, 30)}..."`);
            return true;
        }
        return false;
    }

    /**
     * Check if a job's session is still valid
     * @param {Object} job - The job to check
     * @returns {boolean} True if session is invalid and job should be discarded
     */
    _isSessionMismatch(job) {
        // If no session tracking or job has no session, allow it
        if (!job.sessionId || !this.currentSessionId) {
            return false;
        }
        if (job.sessionId !== this.currentSessionId) {
            console.log(`[SpeechLane] Session mismatch - job: ${job.sessionId}, current: ${this.currentSessionId}`);
            return true;
        }
        return false;
    }

    /**
     * Process the queue
     */
    async _drain() {
        if (this.isPlaying) return;

        this.isPlaying = true;
        this._notifyStateChange('playing');

        try {
            while (this.queue.length > 0) {
                const job = this.queue.shift();

                // ============================================================
                // 🔧 STALENESS CHECK: Discard jobs that waited too long
                // This prevents delayed TTS from overlapping with new content
                // ============================================================
                if (this._isJobStale(job)) {
                    this.stats.totalStale++;
                    console.log(`[SpeechLane] Discarded stale job: "${job.text?.substring(0, 30)}..."`);
                    EventBus.emit(TTSEvents.TTS_PLAY_END, { jobId: job.id, success: false, reason: 'stale' });
                    continue;  // Skip to next job
                }

                // ============================================================
                // 🔧 SESSION CHECK: Discard jobs from previous sessions
                // This prevents TTS from old tasks playing during new tasks
                // ============================================================
                if (this._isSessionMismatch(job)) {
                    this.stats.totalStale++;
                    console.log(`[SpeechLane] Discarded session-mismatched job: "${job.text?.substring(0, 30)}..."`);
                    EventBus.emit(TTSEvents.TTS_PLAY_END, { jobId: job.id, success: false, reason: 'session_mismatch' });
                    continue;  // Skip to next job
                }

                this.currentJob = job;
                this.currentAbortController = new AbortController();

                EventBus.emit(TTSEvents.TTS_PLAY_START, {
                    jobId: job.id,
                    text: job.text?.substring(0, 50)
                });

                try {
                    await job.executor(this.currentAbortController.signal);
                    this.stats.totalPlayed++;
                    EventBus.emit(TTSEvents.TTS_PLAY_END, { jobId: job.id, success: true });
                } catch (error) {
                    if (error.name === 'AbortError') {
                        console.log('[SpeechLane] Job aborted');
                    } else {
                        console.error('[SpeechLane] Job failed:', error);
                        this.stats.totalFailed++;
                        EventBus.emit(TTSEvents.TTS_PLAY_ERROR, {
                            jobId: job.id,
                            error: error.message
                        });
                    }
                }

                this.currentJob = null;
                this.currentAbortController = null;
            }
        } finally {
            this.isPlaying = false;
            this._notifyStateChange('idle');
        }
    }

    /**
     * Stop current playback and optionally clear queue
     * @param {boolean} clearQueue - Whether to clear pending items
     */
    stop(clearQueue = true) {
        // Abort current job
        if (this.currentAbortController) {
            this.currentAbortController.abort();
        }

        // Clear queue if requested
        if (clearQueue) {
            const skipped = this.queue.length;
            this.queue = [];
            this.stats.totalSkipped += skipped;
        }

        console.log(`[SpeechLane] Stopped. Cleared: ${clearQueue}, Queue was: ${this.queue.length}`);
    }

    /**
     * Check if currently playing
     * @returns {boolean}
     */
    isBusy() {
        return this.isPlaying;
    }

    /**
     * Get queue status
     * @returns {Object}
     */
    getStatus() {
        return {
            isPlaying: this.isPlaying,
            queueLength: this.queue.length,
            currentSessionId: this.currentSessionId,
            currentJob: this.currentJob ? {
                id: this.currentJob.id,
                text: this.currentJob.text?.substring(0, 30),
                age: Date.now() - this.currentJob.enqueuedAt
            } : null,
            stats: { ...this.stats }
        };
    }

    _notifyStateChange(state) {
        if (this.onStateChange) {
            this.onStateChange(state);
        }
    }
}

// ============================================================================
// 5. TTS PROVIDER ABSTRACTION
// ============================================================================

class TTSProviderManager {
    constructor(options = {}) {
        this.providers = new Map();
        this.providerOrder = [];
        this.circuitBreakers = new Map();
        this.apiUrl = options.apiUrl || '';

        // Provider health scores (higher = better)
        this.healthScores = new Map();

        // Statistics
        this.stats = {
            requests: new Map(),
            latencies: new Map()
        };
    }

    /**
     * Register a TTS provider
     * @param {string} name - Provider name
     * @param {Object} config - Provider configuration
     */
    registerProvider(name, config) {
        this.providers.set(name, config);
        this.providerOrder.push(name);
        this.healthScores.set(name, 100);
        this.stats.requests.set(name, { success: 0, failure: 0 });
        this.stats.latencies.set(name, []);

        // Create circuit breaker for provider
        this.circuitBreakers.set(name, new CircuitBreaker({
            name: `tts-${name}`,
            threshold: config.failureThreshold || 3,
            cooldownMs: config.cooldownMs || 15000
        }));

        console.log(`[TTSProvider] Registered provider: ${name}`);
    }

    /**
     * Speak text using the best available provider
     * @param {string} text - Text to speak
     * @param {Object} options - TTS options
     * @returns {Promise<ArrayBuffer|void>}
     */
    async speak(text, options = {}) {
        const { signal, voice, rate, pitch, skipProviders = [] } = options;

        // Get providers sorted by health
        const sortedProviders = this._getSortedProviders()
            .filter(name => !skipProviders.includes(name));

        let lastError = null;

        for (const providerName of sortedProviders) {
            if (providerName === 'browser' && !isBrowserTTSEnabled()) {
                console.log('[TTSProvider] Browser TTS disabled by settings, skipping provider');
                continue;
            }
            const provider = this.providers.get(providerName);
            const circuitBreaker = this.circuitBreakers.get(providerName);

            // Check circuit breaker
            if (!circuitBreaker.canPass()) {
                console.log(`[TTSProvider] Skipping ${providerName} - circuit open`);
                continue;
            }

            // Check if aborted
            if (signal?.aborted) {
                throw new DOMException('TTS request aborted', 'AbortError');
            }

            const startTime = Date.now();

            try {
                console.log(`[TTSProvider] Trying provider: ${providerName}`);
                EventBus.emit(TTSEvents.TTS_PROVIDER_SWITCH, { provider: providerName });

                const result = await withRetry(
                    () => provider.synthesize(text, { signal, voice, rate, pitch }),
                    {
                        retries: provider.retries || 1,
                        baseDelay: 200,
                        shouldRetry: (err) => err.name !== 'AbortError'
                    }
                );

                // Record success
                const latency = Date.now() - startTime;
                circuitBreaker.record(true);
                this._recordLatency(providerName, latency);
                this._updateHealthScore(providerName, true, latency);
                this.stats.requests.get(providerName).success++;

                console.log(`[TTSProvider] ${providerName} succeeded in ${latency}ms`);
                return result;

            } catch (error) {
                lastError = error;

                // Don't penalize for abort
                if (error.name === 'AbortError') {
                    throw error;
                }

                // Record failure
                circuitBreaker.record(false);
                this._updateHealthScore(providerName, false);
                this.stats.requests.get(providerName).failure++;

                console.warn(`[TTSProvider] ${providerName} failed:`, error.message);
            }
        }

        // All providers failed
        throw lastError || new Error('All TTS providers failed');
    }

    /**
     * Get providers sorted by health score
     * @returns {string[]}
     */
    _getSortedProviders() {
        return [...this.providerOrder].sort((a, b) => {
            const scoreA = this.healthScores.get(a) || 0;
            const scoreB = this.healthScores.get(b) || 0;
            return scoreB - scoreA;
        });
    }

    /**
     * Update health score based on result
     */
    _updateHealthScore(providerName, success, latency = null) {
        const currentScore = this.healthScores.get(providerName) || 50;
        let newScore;

        if (success) {
            // Increase score, with latency factor
            const latencyFactor = latency ? Math.max(0.5, 1 - (latency / 10000)) : 1;
            newScore = Math.min(100, currentScore + (10 * latencyFactor));
        } else {
            // Decrease score on failure
            newScore = Math.max(0, currentScore - 20);
        }

        this.healthScores.set(providerName, newScore);
    }

    /**
     * Record latency for provider
     */
    _recordLatency(providerName, latency) {
        const latencies = this.stats.latencies.get(providerName);
        latencies.push(latency);
        // Keep only last 20 samples
        if (latencies.length > 20) {
            latencies.shift();
        }
    }

    /**
     * Get average latency for provider
     */
    getAverageLatency(providerName) {
        const latencies = this.stats.latencies.get(providerName);
        if (!latencies || latencies.length === 0) return null;
        return latencies.reduce((a, b) => a + b, 0) / latencies.length;
    }

    /**
     * Get status of all providers
     */
    getStatus() {
        const status = {};
        for (const [name, provider] of this.providers) {
            const cb = this.circuitBreakers.get(name);
            status[name] = {
                healthScore: this.healthScores.get(name),
                circuitState: cb.state,
                avgLatency: this.getAverageLatency(name),
                requests: this.stats.requests.get(name)
            };
        }
        return status;
    }

    /**
     * Reset all circuit breakers
     */
    resetAllCircuits() {
        for (const cb of this.circuitBreakers.values()) {
            cb.reset();
        }
        console.log('[TTSProvider] All circuits reset');
    }
}

// ============================================================================
// 6. TTS TELEMETRY
// ============================================================================

class TTSTelemetry {
    constructor() {
        this.metrics = {
            requests: 0,
            successes: 0,
            failures: 0,
            totalLatency: 0,
            circuitOpens: 0,
            queueDepthSamples: []
        };

        this.errors = [];
        this.maxErrorHistory = 50;

        // Subscribe to events
        this._setupEventListeners();
    }

    _setupEventListeners() {
        EventBus.on(TTSEvents.TTS_PLAY_START, () => {
            this.metrics.requests++;
        });

        EventBus.on(TTSEvents.TTS_PLAY_END, (data) => {
            if (data.success) {
                this.metrics.successes++;
            }
        });

        EventBus.on(TTSEvents.TTS_PLAY_ERROR, (data) => {
            this.metrics.failures++;
            this._recordError(data);
        });

        EventBus.on(TTSEvents.TTS_CIRCUIT_OPEN, () => {
            this.metrics.circuitOpens++;
        });
    }

    _recordError(errorData) {
        this.errors.push({
            timestamp: Date.now(),
            ...errorData
        });

        // Keep only recent errors
        if (this.errors.length > this.maxErrorHistory) {
            this.errors.shift();
        }
    }

    recordLatency(ms) {
        this.metrics.totalLatency += ms;
    }

    sampleQueueDepth(depth) {
        this.metrics.queueDepthSamples.push({
            timestamp: Date.now(),
            depth
        });

        // Keep only last 100 samples
        if (this.metrics.queueDepthSamples.length > 100) {
            this.metrics.queueDepthSamples.shift();
        }
    }

    getReport() {
        const avgLatency = this.metrics.successes > 0
            ? this.metrics.totalLatency / this.metrics.successes
            : 0;

        const avgQueueDepth = this.metrics.queueDepthSamples.length > 0
            ? this.metrics.queueDepthSamples.reduce((a, b) => a + b.depth, 0) / this.metrics.queueDepthSamples.length
            : 0;

        return {
            totalRequests: this.metrics.requests,
            successRate: this.metrics.requests > 0
                ? ((this.metrics.successes / this.metrics.requests) * 100).toFixed(1) + '%'
                : 'N/A',
            avgLatencyMs: avgLatency.toFixed(0),
            avgQueueDepth: avgQueueDepth.toFixed(1),
            circuitOpens: this.metrics.circuitOpens,
            recentErrors: this.errors.slice(-5)
        };
    }

    reset() {
        this.metrics = {
            requests: 0,
            successes: 0,
            failures: 0,
            totalLatency: 0,
            circuitOpens: 0,
            queueDepthSamples: []
        };
        this.errors = [];
    }
}

// ============================================================================
// 7. INTEGRATED TTS SERVICE
// ============================================================================

class RobustTTSService {
    constructor(options = {}) {
        this.apiUrl = options.apiUrl || '';
        this.defaultVoice = options.defaultVoice || 'zh-HK-HiuGaaiNeural';

        // Initialize components
        this.speechLane = new SpeechLane({
            maxQueueSize: options.maxQueueSize || 10,
            onStateChange: (state) => this._onSpeechStateChange(state)
        });

        this.providerManager = new TTSProviderManager({ apiUrl: this.apiUrl });
        this.telemetry = new TTSTelemetry();

        // Audio state
        this.currentAudio = null;
        this.audioContext = null;

        // Callbacks
        this.onSpeakingStart = options.onSpeakingStart || null;
        this.onSpeakingEnd = options.onSpeakingEnd || null;
        this.onError = options.onError || null;

        // Initialize providers
        this._registerDefaultProviders();

        console.log('[RobustTTS] Service initialized');
    }

    _registerDefaultProviders() {
        // 1. Cloud TTS (Edge TTS via server)
        this.providerManager.registerProvider('cloud', {
            failureThreshold: 3,
            cooldownMs: 15000,
            retries: 2,
            synthesize: async (text, options) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 12000);

                // Link to external signal
                if (options.signal) {
                    options.signal.addEventListener('abort', () => controller.abort());
                }

                try {
                    const response = await fetch(`${this.apiUrl}/api/tts/stream`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Priority': 'high'
                        },
                        body: JSON.stringify({
                            text: text,
                            voice: options.voice || this.defaultVoice,
                            rate: options.rate || 160,
                            pitch: options.pitch || 100,
                            skip_browser: true // force Edge/server only
                        }),
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (response.status === 503) {
                        throw new Error('Cloud TTS unavailable (503)');
                    }

                    if (!response.ok) {
                        throw new Error(`TTS failed: ${response.status}`);
                    }

                    const blob = await response.blob();
                    if (blob.size === 0) {
                        throw new Error('Empty audio response');
                    }

                    return blob;
                } finally {
                    clearTimeout(timeoutId);
                }
            }
        });

        // Browser TTS intentionally not registered to enforce Edge/server-only audio
    }

    // ================================================================
    // SESSION MANAGEMENT - Prevents TTS overlap between sessions
    // ================================================================

    /**
     * Start a new session - all TTS from previous sessions will be discarded
     * @param {string} [sessionId] - Optional session ID, auto-generated if not provided
     * @returns {string} The session ID
     */
    startSession(sessionId = null) {
        const id = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.speechLane.setSessionId(id);
        console.log(`[RobustTTS] Started session: ${id}`);
        return id;
    }

    /**
     * End the current session - clears session tracking
     */
    endSession() {
        this.speechLane.setSessionId(null);
        console.log('[RobustTTS] Session ended');
    }

    /**
     * Get the current session ID
     * @returns {string|null}
     */
    getCurrentSessionId() {
        return this.speechLane.currentSessionId;
    }

    /**
     * Speak text (non-blocking, queued)
     * @param {string} text - Text to speak
     * @param {Object} options - TTS options
     * @param {number} [options.maxAgeMs] - Max age before job is considered stale (default 8s)
     * @param {string} [options.sessionId] - Override session ID for this job
     * @returns {boolean} Whether enqueued successfully
     */
    speak(text, options = {}) {
        if (!text || text.trim().length === 0) {
            return false;
        }

        const cleanText = this._preprocessText(text);

        return this.speechLane.enqueue({
            text: cleanText,
            priority: options.priority || 'normal',
            skipIfBusy: options.skipIfBusy || false,
            maxAgeMs: options.maxAgeMs,  // Pass through to SpeechLane
            sessionId: options.sessionId,  // Allow override
            executor: async (signal) => {
                const startTime = Date.now();

                try {
                    const result = await this.providerManager.speak(cleanText, {
                        signal,
                        voice: options.voice || this.defaultVoice,
                        rate: options.rate,
                        pitch: options.pitch
                    });

                    // If we got audio data (blob), play it
                    if (result instanceof Blob) {
                        await this._playAudioBlob(result, signal);
                    }
                    // If provider returned a promise (browser TTS), it's already done

                    this.telemetry.recordLatency(Date.now() - startTime);

                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.error('[RobustTTS] Speak failed:', error);
                        if (this.onError) {
                            this.onError(error);
                        }
                    }
                    throw error;
                }
            }
        });
    }

    /**
     * Speak text and wait for completion
     * @param {string} text - Text to speak
     * @param {Object} options - TTS options
     * @returns {Promise<void>}
     */
    async speakAsync(text, options = {}) {
        return new Promise((resolve, reject) => {
            const unsubscribe = EventBus.on(TTSEvents.TTS_PLAY_END, (data) => {
                unsubscribe();
                resolve();
            });

            const unsubscribeError = EventBus.on(TTSEvents.TTS_PLAY_ERROR, (data) => {
                unsubscribe();
                unsubscribeError();
                // Still resolve - TTS failure shouldn't block tasks
                resolve();
            });

            if (!this.speak(text, options)) {
                unsubscribe();
                unsubscribeError();
                resolve(); // Couldn't enqueue, but don't fail
            }
        });
    }

    /**
     * Stop all TTS playback
     * @param {boolean} clearQueue - Whether to clear pending items
     */
    stop(clearQueue = true) {
        // Stop speech lane
        this.speechLane.stop(clearQueue);

        // Stop browser speech synthesis
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }

        // Stop current audio
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }

        this._onSpeechStateChange('idle');
    }

    /**
     * Check if TTS is currently playing
     * @returns {boolean}
     */
    isPlaying() {
        return this.speechLane.isBusy();
    }

    /**
     * Get service status
     * @returns {Object}
     */
    getStatus() {
        return {
            speechLane: this.speechLane.getStatus(),
            providers: this.providerManager.getStatus(),
            telemetry: this.telemetry.getReport()
        };
    }

    /**
     * Play audio blob
     */
    async _playAudioBlob(blob, signal) {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            this.currentAudio = audio;

            const cleanup = () => {
                this.currentAudio = null;
            };

            // Handle abort
            const abortHandler = () => {
                audio.pause();
                audio.src = '';
                cleanup();
                reject(new DOMException('Playback aborted', 'AbortError'));
            };

            if (signal) {
                signal.addEventListener('abort', abortHandler);
            }

            audio.onended = () => {
                if (signal) signal.removeEventListener('abort', abortHandler);
                cleanup();
                resolve();
            };

            audio.onerror = (e) => {
                if (signal) signal.removeEventListener('abort', abortHandler);
                cleanup();
                reject(new Error(`Audio playback error: ${e.message || 'unknown'}`));
            };

            // Create object URL and play
            const url = URL.createObjectURL(blob);
            audio.src = url;

            audio.play().catch(err => {
                URL.revokeObjectURL(url);
                cleanup();
                reject(err);
            });

            // Cleanup URL after playback
            audio.onended = () => {
                URL.revokeObjectURL(url);
                if (signal) signal.removeEventListener('abort', abortHandler);
                cleanup();
                resolve();
            };
        });
    }

    /**
     * Preprocess text for TTS
     */
    _preprocessText(text) {
        // Strip HTML
        const div = document.createElement('div');
        div.innerHTML = text;
        let clean = div.textContent || div.innerText || '';

        // Remove markdown/formatting
        clean = clean
            .replace(/\*+/g, '')
            .replace(/#+/g, '')
            .replace(/`+/g, '')
            .replace(/\[.*?\]\(.*?\)/g, '')
            .replace(/[_~]/g, '')
            .trim();

        return clean;
    }

    _onSpeechStateChange(state) {
        if (state === 'playing') {
            if (this.onSpeakingStart) this.onSpeakingStart();
        } else if (state === 'idle') {
            if (this.onSpeakingEnd) this.onSpeakingEnd();
        }
    }
}

// ============================================================================
// 8. UI ERROR NOTIFICATION SYSTEM
// ============================================================================

class TTSNotification {
    constructor() {
        this.container = null;
        this.queue = [];
        this.isShowing = false;
        this.maxVisible = 3;
        this._createContainer();
    }

    _createContainer() {
        // Check if container already exists
        if (document.getElementById('tts-notification-container')) {
            this.container = document.getElementById('tts-notification-container');
            return;
        }

        this.container = document.createElement('div');
        this.container.id = 'tts-notification-container';
        this.container.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 360px;
            pointer-events: none;
        `;
        document.body.appendChild(this.container);
    }

    /**
     * Show a notification
     * @param {Object} options - Notification options
     * @param {string} options.type - 'error', 'warning', 'success', 'info'
     * @param {string} options.title - Notification title
     * @param {string} options.message - Notification message
     * @param {Function} [options.onRetry] - Retry callback
     * @param {Function} [options.onDismiss] - Dismiss callback
     * @param {number} [options.duration] - Auto-dismiss duration (ms), 0 for manual
     */
    show(options) {
        const {
            type = 'info',
            title = '',
            message = '',
            onRetry = null,
            onDismiss = null,
            duration = 5000
        } = options;

        const notification = this._createNotification({ type, title, message, onRetry, onDismiss });
        this.container.appendChild(notification);

        // Animate in
        requestAnimationFrame(() => {
            notification.style.transform = 'translateX(0)';
            notification.style.opacity = '1';
        });

        // Auto-dismiss
        if (duration > 0) {
            setTimeout(() => this._dismiss(notification, onDismiss), duration);
        }

        // Limit visible notifications
        const notifications = this.container.children;
        if (notifications.length > this.maxVisible) {
            this._dismiss(notifications[0]);
        }

        return notification;
    }

    _createNotification({ type, title, message, onRetry, onDismiss }) {
        const colors = {
            error: { bg: '#fee2e2', border: '#ef4444', icon: '❌' },
            warning: { bg: '#fef3c7', border: '#f59e0b', icon: '⚠️' },
            success: { bg: '#d1fae5', border: '#10b981', icon: '✅' },
            info: { bg: '#dbeafe', border: '#3b82f6', icon: 'ℹ️' }
        };

        const color = colors[type] || colors.info;

        const el = document.createElement('div');
        el.style.cssText = `
            background: ${color.bg};
            border: 1px solid ${color.border};
            border-left: 4px solid ${color.border};
            border-radius: 8px;
            padding: 12px 16px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transform: translateX(120%);
            opacity: 0;
            transition: all 0.3s ease;
            pointer-events: auto;
            font-family: 'Noto Sans TC', sans-serif;
        `;

        el.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 10px;">
                <span style="font-size: 18px;">${color.icon}</span>
                <div style="flex: 1;">
                    ${title ? `<div style="font-weight: 600; margin-bottom: 4px; color: #1f2937;">${title}</div>` : ''}
                    <div style="font-size: 13px; color: #4b5563;">${message}</div>
                    ${onRetry ? `
                        <button class="tts-retry-btn" style="
                            margin-top: 8px;
                            padding: 6px 12px;
                            background: ${color.border};
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                            font-weight: 500;
                        ">🔄 重試</button>
                    ` : ''}
                </div>
                <button class="tts-dismiss-btn" style="
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 16px;
                    opacity: 0.5;
                    padding: 0;
                    line-height: 1;
                ">✕</button>
            </div>
        `;

        // Event listeners
        const dismissBtn = el.querySelector('.tts-dismiss-btn');
        if (dismissBtn) {
            dismissBtn.onclick = () => this._dismiss(el, onDismiss);
        }

        const retryBtn = el.querySelector('.tts-retry-btn');
        if (retryBtn && onRetry) {
            retryBtn.onclick = () => {
                this._dismiss(el);
                onRetry();
            };
        }

        return el;
    }

    _dismiss(el, callback) {
        if (!el || !el.parentNode) return;

        el.style.transform = 'translateX(120%)';
        el.style.opacity = '0';

        setTimeout(() => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
            if (callback) callback();
        }, 300);
    }

    /**
     * Show TTS error with retry option
     */
    showTTSError(error, onRetry) {
        this.show({
            type: 'error',
            title: '語音播放失敗',
            message: error.message || '無法播放語音，請檢查網路連接',
            onRetry,
            duration: 0 // Manual dismiss for errors
        });
    }

    /**
     * Show circuit breaker warning
     */
    showCircuitOpen(providerName, cooldownMs) {
        this.show({
            type: 'warning',
            title: '語音服務暫時不可用',
            message: `${providerName} 服務已暫停，${Math.round(cooldownMs / 1000)}秒後自動恢復`,
            duration: cooldownMs
        });
    }

    /**
     * Show provider switch info
     */
    showProviderSwitch(fromProvider, toProvider) {
        this.show({
            type: 'info',
            title: '已切換語音服務',
            message: `已從 ${fromProvider} 切換到 ${toProvider}`,
            duration: 3000
        });
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        this.show({
            type: 'success',
            title: '成功',
            message,
            duration: 2000
        });
    }
}

// ============================================================================
// 9. INDEXEDDB AUDIO CACHE
// ============================================================================

class TTSAudioCache {
    constructor(options = {}) {
        this.dbName = options.dbName || 'TTSAudioCache';
        this.storeName = options.storeName || 'audioBlobs';
        this.maxEntries = options.maxEntries || 200;
        this.maxSizeMB = options.maxSizeMB || 50;
        this.ttlMs = options.ttlMs || 24 * 60 * 60 * 1000; // 24 hours
        this.db = null;
        this._initPromise = null;

        // Statistics
        this.stats = {
            hits: 0,
            misses: 0,
            puts: 0,
            evictions: 0
        };
    }

    /**
     * Initialize IndexedDB
     */
    async init() {
        if (this._initPromise) return this._initPromise;

        this._initPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                console.warn('[TTSCache] IndexedDB not supported, using memory cache');
                this._useMemoryFallback();
                resolve(false);
                return;
            }

            const request = indexedDB.open(this.dbName, 1);

            request.onerror = (event) => {
                console.error('[TTSCache] IndexedDB error:', event.target.error);
                this._useMemoryFallback();
                resolve(false);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('size', 'size', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('[TTSCache] IndexedDB initialized');
                this._cleanupExpired(); // Background cleanup
                resolve(true);
            };
        });

        return this._initPromise;
    }

    _useMemoryFallback() {
        this._memoryCache = new Map();
        this.db = null;
    }

    /**
     * Generate cache key from TTS parameters
     */
    _generateKey(text, voice, rate, pitch) {
        const content = `${text}|${voice}|${rate}|${pitch}`;
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return `tts_${Math.abs(hash).toString(36)}`;
    }

    /**
     * Get cached audio
     * @returns {Promise<Blob|null>}
     */
    async get(text, voice, rate, pitch) {
        await this.init();
        const key = this._generateKey(text, voice, rate, pitch);

        // Memory fallback
        if (this._memoryCache) {
            const cached = this._memoryCache.get(key);
            if (cached && Date.now() - cached.timestamp < this.ttlMs) {
                this.stats.hits++;
                return cached.blob;
            }
            this.stats.misses++;
            return null;
        }

        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onsuccess = () => {
                const result = request.result;
                if (result && Date.now() - result.timestamp < this.ttlMs) {
                    this.stats.hits++;
                    console.log(`[TTSCache] Hit: ${key.substring(0, 12)}...`);
                    resolve(result.blob);
                } else {
                    this.stats.misses++;
                    resolve(null);
                }
            };

            request.onerror = () => {
                this.stats.misses++;
                resolve(null);
            };
        });
    }

    /**
     * Store audio in cache
     * @param {Blob} blob - Audio blob
     */
    async put(text, voice, rate, pitch, blob) {
        if (!blob || blob.size === 0) return;

        await this.init();
        const key = this._generateKey(text, voice, rate, pitch);

        // Memory fallback
        if (this._memoryCache) {
            this._memoryCache.set(key, { blob, timestamp: Date.now() });
            this.stats.puts++;
            return;
        }

        const entry = {
            key,
            blob,
            text: text.substring(0, 100), // Store preview for debugging
            voice,
            size: blob.size,
            timestamp: Date.now()
        };

        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            store.put(entry);
            this.stats.puts++;

            transaction.oncomplete = () => {
                console.log(`[TTSCache] Put: ${key.substring(0, 12)}... (${(blob.size / 1024).toFixed(1)} KB)`);
                this._checkSizeLimit();
                resolve();
            };

            transaction.onerror = () => resolve();
        });
    }

    /**
     * Clean up expired entries
     */
    async _cleanupExpired() {
        if (!this.db) return;

        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('timestamp');
        const cutoff = Date.now() - this.ttlMs;

        const range = IDBKeyRange.upperBound(cutoff);
        const request = index.openCursor(range);

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                this.stats.evictions++;
                cursor.continue();
            }
        };
    }

    /**
     * Check and enforce size limit
     */
    async _checkSizeLimit() {
        if (!this.db) return;

        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const countRequest = store.count();

        countRequest.onsuccess = () => {
            if (countRequest.result > this.maxEntries) {
                this._evictOldest(countRequest.result - this.maxEntries);
            }
        };
    }

    /**
     * Evict oldest entries
     */
    async _evictOldest(count) {
        if (!this.db || count <= 0) return;

        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('timestamp');
        const request = index.openCursor();

        let deleted = 0;
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor && deleted < count) {
                cursor.delete();
                this.stats.evictions++;
                deleted++;
                cursor.continue();
            }
        };
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1)
            : 0;

        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
            usingIndexedDB: !!this.db
        };
    }

    /**
     * Clear all cached audio
     */
    async clear() {
        if (this._memoryCache) {
            this._memoryCache.clear();
            return;
        }

        if (!this.db) return;

        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            store.clear();
            transaction.oncomplete = () => {
                console.log('[TTSCache] Cache cleared');
                this.stats = { hits: 0, misses: 0, puts: 0, evictions: 0 };
                resolve();
            };
        });
    }
}

// ============================================================================
// 10. ALERT MECHANISM
// ============================================================================

class TTSAlertManager {
    constructor(options = {}) {
        this.errorRateThreshold = options.errorRateThreshold || 0.3; // 30% error rate
        this.windowSizeMs = options.windowSizeMs || 60000; // 1 minute window
        this.minSamples = options.minSamples || 5; // Minimum samples before alerting
        this.cooldownMs = options.cooldownMs || 300000; // 5 minute alert cooldown

        this.recentRequests = [];
        this.lastAlertTime = 0;
        this.alertCallbacks = [];
        this.degradedMode = false;

        // Subscribe to TTS events
        this._setupEventListeners();
    }

    _setupEventListeners() {
        EventBus.on(TTSEvents.TTS_PLAY_END, (data) => {
            this._recordRequest(data.success);
        });

        EventBus.on(TTSEvents.TTS_PLAY_ERROR, () => {
            this._recordRequest(false);
        });

        EventBus.on(TTSEvents.TTS_CIRCUIT_OPEN, (data) => {
            this._handleCircuitOpen(data);
        });
    }

    _recordRequest(success) {
        const now = Date.now();

        // Add new request
        this.recentRequests.push({ timestamp: now, success });

        // Remove old requests outside window
        this.recentRequests = this.recentRequests.filter(
            r => now - r.timestamp < this.windowSizeMs
        );

        // Check error rate
        this._checkErrorRate();
    }

    _checkErrorRate() {
        if (this.recentRequests.length < this.minSamples) return;

        const now = Date.now();
        if (now - this.lastAlertTime < this.cooldownMs) return;

        const failures = this.recentRequests.filter(r => !r.success).length;
        const errorRate = failures / this.recentRequests.length;

        if (errorRate >= this.errorRateThreshold) {
            this._triggerAlert({
                type: 'high_error_rate',
                errorRate: (errorRate * 100).toFixed(1) + '%',
                failures,
                total: this.recentRequests.length,
                timestamp: now
            });
        }
    }

    _handleCircuitOpen(data) {
        this._triggerAlert({
            type: 'circuit_open',
            provider: data.name,
            cooldownMs: data.cooldownMs,
            timestamp: Date.now()
        });

        // Enter degraded mode
        this.degradedMode = true;
        EventBus.emit('tts:degraded:enter', { reason: 'circuit_open', provider: data.name });
    }

    _triggerAlert(alertData) {
        this.lastAlertTime = Date.now();

        console.warn('[TTSAlert]', alertData);

        // Notify all registered callbacks
        this.alertCallbacks.forEach(callback => {
            try {
                callback(alertData);
            } catch (error) {
                console.error('[TTSAlert] Callback error:', error);
            }
        });

        // Emit event
        EventBus.emit('tts:alert', alertData);

        // Send telemetry to server
        this._sendTelemetryAlert(alertData);
    }

    async _sendTelemetryAlert(alertData) {
        try {
            // Get API URL from window or default
            const apiUrl = window.robustTTS?.apiUrl || '';
            if (!apiUrl) return;

            await fetch(`${apiUrl}/api/telemetry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'tts_alert',
                    alert: alertData,
                    userAgent: navigator.userAgent,
                    timestamp: Date.now()
                })
            });
        } catch (error) {
            // Silently fail - don't block on telemetry
        }
    }

    /**
     * Register an alert callback
     * @param {Function} callback - Function to call on alert
     * @returns {Function} Unsubscribe function
     */
    onAlert(callback) {
        this.alertCallbacks.push(callback);
        return () => {
            const idx = this.alertCallbacks.indexOf(callback);
            if (idx > -1) this.alertCallbacks.splice(idx, 1);
        };
    }

    /**
     * Get current health status
     */
    getStatus() {
        const failures = this.recentRequests.filter(r => !r.success).length;
        const errorRate = this.recentRequests.length > 0
            ? failures / this.recentRequests.length
            : 0;

        return {
            errorRate: (errorRate * 100).toFixed(1) + '%',
            sampleSize: this.recentRequests.length,
            degradedMode: this.degradedMode,
            lastAlertTime: this.lastAlertTime ? new Date(this.lastAlertTime).toISOString() : null
        };
    }

    /**
     * Reset alert state
     */
    reset() {
        this.recentRequests = [];
        this.lastAlertTime = 0;
        this.degradedMode = false;
    }
}

// ============================================================================
// 11. ENHANCED ROBUST TTS SERVICE (with cache and notifications)
// ============================================================================

// Extend RobustTTSService to include cache and notifications
const originalRobustTTSService = RobustTTSService;

RobustTTSService = class extends originalRobustTTSService {
    constructor(options = {}) {
        super(options);

        // Initialize new components
        this.notification = new TTSNotification();
        this.audioCache = new TTSAudioCache({
            maxEntries: options.cacheMaxEntries || 200,
            ttlMs: options.cacheTtlMs || 24 * 60 * 60 * 1000
        });
        this.alertManager = new TTSAlertManager({
            errorRateThreshold: options.alertThreshold || 0.3
        });

        // Subscribe to events for notifications
        this._setupNotificationListeners();

        // Initialize cache
        this.audioCache.init();

        console.log('[RobustTTS] Enhanced service with cache and notifications');
    }

    _setupNotificationListeners() {
        // Show notification on circuit open
        EventBus.on(TTSEvents.TTS_CIRCUIT_OPEN, (data) => {
            this.notification.showCircuitOpen(data.name, data.cooldownMs);
        });

        // Show notification on alerts
        this.alertManager.onAlert((alert) => {
            if (alert.type === 'high_error_rate') {
                this.notification.show({
                    type: 'warning',
                    title: '語音服務不穩定',
                    message: `近期錯誤率較高 (${alert.errorRate})，系統正在自動修復`,
                    duration: 10000
                });
            }
        });
    }

    /**
     * Override speak to use cache
     * @param {string} text - Text to speak
     * @param {Object} options - TTS options
     * @param {number} [options.maxAgeMs] - Max age before job is considered stale (default 8s)
     * @param {string} [options.sessionId] - Override session ID for this job
     */
    speak(text, options = {}) {
        if (!text || text.trim().length === 0) {
            return false;
        }

        const cleanText = this._preprocessText(text);
        const voice = options.voice || this.defaultVoice;
        const rate = options.rate || 160;
        const pitch = options.pitch || 100;

        return this.speechLane.enqueue({
            text: cleanText,
            priority: options.priority || 'normal',
            skipIfBusy: options.skipIfBusy || false,
            maxAgeMs: options.maxAgeMs,  // Pass through to SpeechLane for staleness check
            sessionId: options.sessionId,  // Allow override for session tracking
            executor: async (signal) => {
                const startTime = Date.now();

                try {
                    // 1. Check cache first
                    const cachedBlob = await this.audioCache.get(cleanText, voice, rate, pitch);
                    if (cachedBlob) {
                        console.log('[RobustTTS] Cache hit, playing cached audio');
                        await this._playAudioBlob(cachedBlob, signal);
                        this.telemetry.recordLatency(Date.now() - startTime);
                        return;
                    }

                    // 2. Synthesize via provider
                    const result = await this.providerManager.speak(cleanText, {
                        signal,
                        voice,
                        rate,
                        pitch
                    });

                    // 3. Play and cache
                    if (result instanceof Blob) {
                        // Cache the audio for future use
                        this.audioCache.put(cleanText, voice, rate, pitch, result);
                        await this._playAudioBlob(result, signal);
                    }

                    this.telemetry.recordLatency(Date.now() - startTime);

                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.error('[RobustTTS] Speak failed:', error);

                        // Show notification with retry option
                        this.notification.showTTSError(error, () => {
                            this.speak(text, options);
                        });

                        if (this.onError) {
                            this.onError(error);
                        }
                    }
                    throw error;
                }
            }
        });
    }

    /**
     * Get extended status including cache
     */
    getStatus() {
        return {
            speechLane: this.speechLane.getStatus(),
            providers: this.providerManager.getStatus(),
            telemetry: this.telemetry.getReport(),
            cache: this.audioCache.getStats(),
            alerts: this.alertManager.getStatus()
        };
    }
};

// ============================================================================
// 12. EXPORTS
// ============================================================================

// Make available globally
window.TTSInfrastructure = {
    EventBus,
    TTSEvents,
    CircuitBreaker,
    withRetry,
    SpeechLane,
    TTSProviderManager,
    TTSTelemetry,
    RobustTTSService,
    TTSNotification,
    TTSAudioCache,
    TTSAlertManager
};

// Create global instance (will be configured in app.js)
window.robustTTS = null;

console.log('[TTS Infrastructure] Module loaded (v2 with cache, notifications, alerts)');
// Helper to respect UI/setting toggle for browser TTS
function isBrowserTTSEnabled() {
    try {
        const checkbox = document.getElementById('disableBrowserTTS');
        if (checkbox) {
            return !checkbox.checked;
        }
        const saved = localStorage.getItem('foxAISettings');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.disableBrowserTTS === true) {
                return false;
            }
        }
    } catch (e) {
        // ignore and allow browser TTS
    }
    return true;
}
