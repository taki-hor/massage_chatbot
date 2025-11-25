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

        // Statistics
        this.stats = {
            totalEnqueued: 0,
            totalPlayed: 0,
            totalSkipped: 0,
            totalFailed: 0
        };
    }

    /**
     * Add a speech job to the queue
     * @param {Object} job - Speech job
     * @param {string} job.text - Text to speak
     * @param {Function} job.executor - Async function that performs TTS
     * @param {string} [job.priority='normal'] - Priority: 'high', 'normal', 'low'
     * @param {boolean} [job.skipIfBusy=false] - Skip if queue is too long
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
            priority: job.priority || 'normal'
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
     * Process the queue
     */
    async _drain() {
        if (this.isPlaying) return;

        this.isPlaying = true;
        this._notifyStateChange('playing');

        try {
            while (this.queue.length > 0) {
                const job = this.queue.shift();
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
            currentJob: this.currentJob ? {
                id: this.currentJob.id,
                text: this.currentJob.text?.substring(0, 30)
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
                            skip_browser: false
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

        // 2. Browser TTS (Web Speech API)
        this.providerManager.registerProvider('browser', {
            failureThreshold: 5,
            cooldownMs: 10000,
            retries: 0,
            synthesize: (text, options) => {
                return new Promise((resolve, reject) => {
                    if (!('speechSynthesis' in window)) {
                        reject(new Error('Browser TTS not supported'));
                        return;
                    }

                    // Handle abort
                    if (options.signal?.aborted) {
                        reject(new DOMException('Aborted', 'AbortError'));
                        return;
                    }

                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.lang = 'zh-HK';
                    utterance.rate = 1.0;
                    utterance.pitch = 1.1;
                    utterance.volume = 0.95;

                    // Try to find Cantonese voice
                    const voices = speechSynthesis.getVoices();
                    const cantoVoice = voices.find(v =>
                        v.lang?.toLowerCase().startsWith('zh-hk') ||
                        v.name?.includes('Hiu') ||
                        v.lang?.includes('yue')
                    ) || voices.find(v => v.lang?.toLowerCase().includes('zh'));

                    if (cantoVoice) {
                        utterance.voice = cantoVoice;
                    }

                    // Setup abort handler
                    const abortHandler = () => {
                        speechSynthesis.cancel();
                        reject(new DOMException('Aborted', 'AbortError'));
                    };

                    if (options.signal) {
                        options.signal.addEventListener('abort', abortHandler);
                    }

                    utterance.onend = () => {
                        if (options.signal) {
                            options.signal.removeEventListener('abort', abortHandler);
                        }
                        resolve();
                    };

                    utterance.onerror = (event) => {
                        if (options.signal) {
                            options.signal.removeEventListener('abort', abortHandler);
                        }
                        reject(new Error(`Browser TTS error: ${event.error}`));
                    };

                    speechSynthesis.speak(utterance);
                });
            }
        });
    }

    /**
     * Speak text (non-blocking, queued)
     * @param {string} text - Text to speak
     * @param {Object} options - TTS options
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
// 8. EXPORTS
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
    RobustTTSService
};

// Create global instance (will be configured in app.js)
window.robustTTS = null;

console.log('[TTS Infrastructure] Module loaded');
