// ===== 配置 =====
        // 生產環境調試開關 - 設置為 false 以禁用 console.log 輸出
        const DEBUG_MODE = window.DEBUG_MODE !== undefined ? window.DEBUG_MODE : true;

        // 保存原始 console 方法
        const _originalConsole = {
            log: console.log.bind(console),
            debug: console.debug.bind(console),
            info: console.info.bind(console)
        };

        // 條件性日誌包裝器
        if (!DEBUG_MODE) {
            console.log = function() {};
            console.debug = function() {};
            console.info = function() {};
        }

        // 使用後端注入的服務器配置，或回退到當前位置推斷
        const serverConfig = window.SERVER_CONFIG || {
            port: window.location.port || '5000',
            host: window.location.hostname || '127.0.0.1', 
            protocol: window.location.protocol.replace(':', '') || 'http'
        };

        console.log('🔌 使用服務器配置:', serverConfig);

        // 從服務器配置設置 API URL
        let API_URL = serverConfig.api_url || `${serverConfig.protocol}://${serverConfig.host}:${serverConfig.port}`;
        let actualPort = String(serverConfig.port);

        // 備用端口，如果主端口失敗則嘗試
        const possiblePorts = Array.from(new Set([
            String(serverConfig.port), 
            String(window.location.port || '5000'),
            '5000', '5001', '5002'
        ]));

        console.log('🔌 將按順序嘗試端口:', possiblePorts);
        
        // 改進的端口檢測，帶有適當的超時控制
        async function detectAvailablePort() {
            const host = serverConfig.host;
            const protocol = serverConfig.protocol;
            
            for (const port of possiblePorts) {
                try {
                    const testUrl = `${protocol}://${host}:${port}/health`;
                    
                    // 使用 AbortController 實現真正的超時控制
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 1500); // 從 2000ms 改為 1500ms
                    
                    console.log(`🔍 測試端口 ${port}...`);
                    
                    const response = await fetch(testUrl, { 
                        method: 'GET',
                        mode: 'cors',
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (response && response.ok) {
                        actualPort = port;
                        API_URL = `${protocol}://${host}:${port}`;
                        console.log(`✅ 檢測到服務器運行在端口 ${port}`);
                        console.log(`✅ API_URL 更新為: ${API_URL}`);
                        return true;
                    }
                } catch (error) {
                    if (error.name === 'AbortError') {
                        console.log(`⏱️ 端口 ${port} 超時`);
                    } else {
                        console.log(`❌ 端口 ${port} 失敗:`, error.message);
                    }
                    // 繼續嘗試下一個端口
                }
            }
            
            console.warn('⚠️ 無法自動檢測端口,使用默認配置');
            // 🔥 關鍵:即使失敗也返回 false,不拋出錯誤
            return false;
        }
        
        console.log('🔌 嘗試連接端口:', actualPort);
        
        let isConnected = false;
        let lastResponse = '';
        let isInCommandBlock = false;
        let messageCount = 0;
        let currentTypingBubble = null;
        let speechSynthesis = window.speechSynthesis;

        // ===== 核心變數 =====
        let audioQueue = null;
        let sentenceDetector = null;
        let currentMassageSession = null;
        let isAutoListening = false;
        let isIntentionalStop = false;
        let isFollowUpListening = false; // For follow-up mode
        let isMassageSessionActive = false;
        let currentTTSAudio = null; // Track current TTS audio for stopping
        let isTTSPlaying = false; // Track if TTS is in progress (including fetch)

        // 🔧 FIX: Add mutex and health check for massage listening
        let recognitionRestartPending = false; // Prevent concurrent restart attempts
        let massageListeningHealthCheck = null; // Health check interval for massage listening
        let lastRecognitionActivity = Date.now(); // Track last recognition activity

        // ===== 按摩對話系統 =====
        const massageDialogues = {
            start: [
                "好喇，而家開始幫您按摩{bodyPart}，力度係{intensity}，請放鬆身體。",
                "準備好未？我哋而家開始{action}{bodyPart}，有咩唔舒服記得話我知。",
                "開始喇！{duration}分鐘嘅{bodyPart}按摩，記得深呼吸放鬆。"
            ],
            check_10: [
                "力度啱唔啱呀？如果太大力或者太輕記得話我知。",
                "開始咗一陣，感覺點呀？需唔需要調整？",
                "有冇唔舒服？力度可以隨時調整架。"
            ],
            check_30: [
                "而家按得點呀？會唔會太大力？",
                "感覺舒唔舒服呀？有需要嘅話我可以調整力度。",
                "繼續保持放鬆，有咩唔妥即刻話我知。"
            ],
            check_50: [
                "過咗一半喇，感覺係咪好咗啲？",
                "中段喇，{bodyPart}有冇鬆啲呀？",
                "做緊一半，力度啱唔啱？需唔需要加強或者減輕？"
            ],
            check_70: [
                "就快完喇，仲有邊度需要加強按摩？",
                "最後階段喇，有冇邊個位特別緊需要多按下？",
                "快完喇，整體感覺點樣？"
            ],
            check_90: [
                "就快完成喇，感覺係咪鬆咗好多？",
                "最後少少，而家感覺舒唔舒服？",
                "快完喇，有冇達到預期效果？"
            ],
            complete: [
                "完成喇！{duration}分鐘嘅{bodyPart}按摩做完，感覺點呀？",
                "好喇，按摩完成！記得多啲休息，飲返杯水。",
                "做完喇！希望您會感到放鬆舒適，有需要隨時搵我。"
            ],
            discomfort: [
                "唔好意思，我即刻調整力度。",
                "明白，我而家減輕啲力度。",
                "收到，我會小心啲。"
            ],
            emergency_stop: [
                "好，即刻停止。您而家感覺點？",
                "明白，已經停咗。有邊度唔舒服？",
                "停咗喇。需唔需要我幫您做啲咩？"
            ]
        };

        // ASR Configuration
        let currentASREngine = 'browser';
        let microphonePermissionGranted = false;

        // Browser Speech Recognition
        let browserRecognition = null;
        let isRecording = false;

        // Server WebSocket for Xunfei
        let serverASRWebSocket = null;
        let audioContext = null;
        let mediaRecorder = null;
        let audioProcessor = null;
        
        // Shared microphone stream
        let sharedMicStream = null;
        let micStreamActive = false;

        // Performance tracking
        let mediaSourceFallbacks = 0;

        // Session workflow state
        let consentGranted = false;
        let consentPromptVisible = false;
        let pendingCommand = null;
        let safetyReminderShown = false;
        let sessionManager = null;
        const INTENSITY_LEVELS = ['輕柔', '適中', '強力'];

        // 🔧 NEW: Voice command support for consent
        let consentVoiceListening = false;
        let consentRecognition = null;
        let audioUnlocked = false;
        let audioUnlockResolvers = [];
        let audioUnlockListenersAttached = false;
        let wakeWordWasActiveBeforeConsent = false;

        // ===== 極速流式TTS播放器 (修正版) =====
        class UltraFastTTSPlayer {
            constructor() {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.audioBuffers = [];
                this.isPlaying = false;
                this.currentSource = null;
                this.nextStartTime = 0;
                this.textBuffer = '';
                this.synthesisQueue = new Map();
                this.sequenceNumber = 0;
                this.playbackIndex = 0;
                this.pendingRequests = 0; // 追蹤進行中的請求

                // 調整參數 - 等待更長的文本
                this.minCharsForTTS = 8;    // 至少8個字才開始
                this.maxCharsPerChunk = 50; // 一次最多50字
                this.flushTimeout = null;
                this.lastTextTime = Date.now();

                // 🔧 FIX: Resume AudioContext on first user interaction to comply with autoplay policy
                this._setupAutoplayPolicyFix();

                console.log('🚀 Ultra-smooth TTS Player initialized');
            }

            _setupAutoplayPolicyFix() {
                // Resume AudioContext on any user interaction
                const resumeAudio = async () => {
                    if (this.audioContext.state === 'suspended') {
                        try {
                            await this.audioContext.resume();
                            console.log('✅ AudioContext resumed after user gesture');
                        } catch (error) {
                            console.error('❌ Failed to resume AudioContext:', error);
                        }
                    }
                };

                // Listen for various user interaction events
                const events = ['click', 'touchstart', 'keydown'];
                events.forEach(event => {
                    document.addEventListener(event, resumeAudio, { once: false });
                });
            }

            async _ensureAudioContextRunning() {
                // 🔧 FIX: Ensure AudioContext is running before playback
                if (this.audioContext.state === 'suspended') {
                    try {
                        await this.audioContext.resume();
                        console.log('✅ AudioContext resumed for playback');
                    } catch (error) {
                        console.error('❌ Failed to resume AudioContext for playback:', error);
                        throw error;
                    }
                }
            }

            addText(text) {
                this.textBuffer += text;
                this.lastTextTime = Date.now();
                
                // 清除之前的超時
                if (this.flushTimeout) {
                    clearTimeout(this.flushTimeout);
                }
                
                // 檢查是否應該處理
                this._checkAndProcess();
                
                // 設置新的超時（800ms沒有新文本就強制處理）
                this.flushTimeout = setTimeout(() => {
                    this._forceFlush();
                }, 800);
            }

            _checkAndProcess() {
                const endMarks = /[。！？.!?]/;
                let sentenceEnd = -1;

                for (let i = 0; i < this.textBuffer.length; i++) {
                    if (endMarks.test(this.textBuffer[i])) {
                        if (this.textBuffer[i] === '.') {
                            const prev = this.textBuffer[i - 1];
                            const next = this.textBuffer[i + 1];
                            if (prev && next && /\d/.test(prev) && /\d/.test(next)) {
                                continue;
                            }
                        }
                        sentenceEnd = i;
                        break;
                    }
                }

                if (sentenceEnd !== -1) {
                    const sentence = this.textBuffer.substring(0, sentenceEnd + 1);
                    this.textBuffer = this.textBuffer.substring(sentenceEnd + 1);
                    this._processTextChunk(sentence);

                    if (this.textBuffer.length > 0) {
                        this._checkAndProcess();
                    }
                    return;
                }

                // If no sentence end found, check for comma splitting
                if (this.textBuffer.length >= this.maxCharsPerChunk) {
                    const commaIndex = this.textBuffer.lastIndexOf('，', this.maxCharsPerChunk);
                    if (commaIndex > this.minCharsForTTS) {
                        const chunk = this.textBuffer.substring(0, commaIndex + 1);
                        this.textBuffer = this.textBuffer.substring(commaIndex + 1);
                        this._processTextChunk(chunk);
                        return;
                    }
                    
                    // Force split at max length
                    const chunk = this.textBuffer.substring(0, this.maxCharsPerChunk);
                    this.textBuffer = this.textBuffer.substring(this.maxCharsPerChunk);
                    this._processTextChunk(chunk);
                }
            }

            _forceFlush() {
                if (this.textBuffer.length >= this.minCharsForTTS) {
                    const chunk = this.textBuffer;
                    this.textBuffer = '';
                    this._processTextChunk(chunk);
                }
            }

            async _processTextChunk(text) {
                const cleanText = this._cleanTextForTTS(text);
                if (!cleanText || cleanText.length < 2) return;
                
                const sequence = this.sequenceNumber++;
                console.log(`⚡ Processing [${sequence}]: ${cleanText}`);
                
                // 開始播放指示
                if (!this.isPlaying) {
                    this._showIndicator();
                    setFoxState('speaking');
                }
                
                // 並行合成
                this._synthesizeAudio(cleanText, sequence);
            }

            async _synthesizeAudio(text, sequence) {
                this.pendingRequests++; // 增加請求計數
                
                try {
                    const response = await fetch(`${API_URL}/api/tts/stream`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Priority': 'high'
                        },
                        body: JSON.stringify({
                            text: text,
                            voice: document.getElementById('voiceSelect').value,
                            rate: 160,
                            pitch: 100,
                            skip_browser: false
                        })
                    });

                    if (!response.ok) throw new Error(`TTS failed: ${response.status}`);
                    
                    const arrayBuffer = await response.arrayBuffer();
                    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    
                    // 存儲解碼後的音頻
                    this.synthesisQueue.set(sequence, {
                        buffer: audioBuffer,
                        text: text
                    });
                    
                    console.log(`✅ Synthesized [${sequence}]: ${text.substring(0, 15)}...`);
                    
                    // 開始播放
                    if (!this.isPlaying) {
                        this._startContinuousPlayback();
                    }
                    
                } catch (error) {
                    console.error(`Synthesis error [${sequence}]:`, error);
                    console.log(`TTS Stream failed, falling back to browser speech for chunk: ${text}`);
                    speakText(text); // Fallback to browser TTS
                } finally {
                    this.pendingRequests--; // 減少請求計數
                }
            }

            async _startContinuousPlayback() {
                if (this.isPlaying) return;

                // 🔧 FIX: Ensure AudioContext is running before playback
                try {
                    await this._ensureAudioContextRunning();
                } catch (error) {
                    console.error('❌ Cannot start playback - AudioContext failed to resume:', error);
                    return;
                }

                this.isPlaying = true;
                this.nextStartTime = this.audioContext.currentTime;

                // 開始播放循環
                this._playbackLoop();
            }

            _playbackLoop() {
                if (!this.isPlaying) return;
                
                const audioData = this.synthesisQueue.get(this.playbackIndex);
                
                if (audioData) {
                    // 有音頻可播放
                    console.log(`🔊 Playing [${this.playbackIndex}]: ${audioData.text.substring(0, 15)}...`);
                    
                    const source = this.audioContext.createBufferSource();
                    source.buffer = audioData.buffer;
                    source.connect(this.audioContext.destination);
                    
                    const startTime = Math.max(this.audioContext.currentTime, this.nextStartTime);
                    source.start(startTime);
                    
                    // 更新下一個開始時間（輕微重疊）
                    this.nextStartTime = startTime + audioData.buffer.duration - 0.05;
                    
                    // 清理
                    this.synthesisQueue.delete(this.playbackIndex);
                    this.playbackIndex++;
                    
                    // 繼續下一個
                    setTimeout(() => this._playbackLoop(), 
                        Math.max(50, (audioData.buffer.duration - 0.05) * 1000 * 0.8));
                    
                } else {
                    // 沒有音頻，檢查是否應該繼續等待
                    if (this.pendingRequests > 0 || this.textBuffer.length > 0) {
                        // 還有請求進行中或待處理文本，繼續等待
                        setTimeout(() => this._playbackLoop(), 100);
                    } else if (this.synthesisQueue.size > 0) {
                        // 可能是序號問題，繼續等待
                        setTimeout(() => this._playbackLoop(), 100);
                    } else {
                        // 真的沒有內容了，停止
                        console.log('🛑 Playback stopped - no more content');
                        this._stopPlayback();
                    }
                }
            }

            _stopPlayback() {
                this.isPlaying = false;
                this._hideIndicator();
                setFoxState(null);
            }

            flush() {
                // 清除超時
                if (this.flushTimeout) {
                    clearTimeout(this.flushTimeout);
                    this.flushTimeout = null;
                }
                
                // 強制處理剩餘文本
                this._forceFlush();
            }

            stop() {
                console.log('⏹️ Stopping TTS');
                
                // 清理所有
                if (this.flushTimeout) {
                    clearTimeout(this.flushTimeout);
                }
                
                this.textBuffer = '';
                this.synthesisQueue.clear();
                this.isPlaying = false;
                this.sequenceNumber = 0;
                this.playbackIndex = 0;
                this.pendingRequests = 0;
                
                this._hideIndicator();
                setFoxState(null);
            }

            _cleanTextForTTS(text) {
                // 🔥 首先移除指令分類區塊
                let cleaned = removeCommandBlocks(text);

                // 然後做基本清理
                cleaned = cleaned
                    .replace(/\*+/g, '')
                    .replace(/#+/g, '')
                    .replace(/`+/g, '')
                    .replace(/\[.*?\]\(.*?\)/g, '')
                    .replace(/[_~]/g, '')
                    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
                    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
                    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
                    .replace(/[\u{2600}-\u{26FF}]/gu, '')
                    .replace(/[\u{2700}-\u{27BF}]/gu, '')
                    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
                    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
                    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
                    .replace(/[\/\\\(\)\[\]{}]/g, ' ')
                    .trim();

                // 🔥 最後套用粵語預處理
                return preprocessForCantoneseTTS(cleaned);
            }

            _showIndicator() {
                const indicator = document.getElementById('speakingIndicator');
                if (indicator) indicator.classList.add('active');
            }

            _hideIndicator() {
                const indicator = document.getElementById('speakingIndicator');
                if (indicator) indicator.classList.remove('active');
            }
        }

        // ===== 優化版音訊播放器 (改進的MediaSource降級) =====
        class OptimizedAudioPlayer {
            constructor() {
                this.queue = [];
                this.cache = new Map();
                this.isPlaying = false;
                this.currentAudio = null;
                this.prefetchInProgress = new Set();
                this.playbackStarted = false;
                this.userGestureReceived = false;

                // MediaSource 支援檢測
                this.mediaSourceSupported = this._detectMediaSourceSupport();
                this.useMediaSource = this.mediaSourceSupported;
                this.fallbackCount = 0;

                // 🔧 FIX: Setup autoplay policy handler for HTML5 Audio
                this._setupAutoplayHandler();

                console.log(`🎵 Audio player initialized (MediaSource: ${this.mediaSourceSupported ? 'Supported' : 'Not Supported'})`);
            }

            _setupAutoplayHandler() {
                // Mark that user gesture was received on any interaction
                const markUserGesture = () => {
                    if (!this.userGestureReceived) {
                        this.userGestureReceived = true;
                        console.log('✅ User gesture received for audio playback');
                    }
                };

                const events = ['click', 'touchstart', 'keydown'];
                events.forEach(event => {
                    document.addEventListener(event, markUserGesture, { once: true });
                });
            }

            _detectMediaSourceSupport() {
                if (!('MediaSource' in window)) {
                    return false;
                }
                
                // 檢測常見格式支援
                const formats = [
                    'audio/mp4; codecs="mp4a.40.2"',
                    'audio/mpeg',
                    'audio/webm; codecs="opus"'
                ];
                
                const supported = formats.some(format => MediaSource.isTypeSupported(format));
                console.log(`🔍 MediaSource format support: ${supported}`);
                return supported;
            }

            async addToQueue(sentence, sentenceIndex) {
                console.log(`🎵 Adding to queue [${sentenceIndex}]: ${sentence.substring(0, 30)}...`);
                this.queue.push({ sentence, sentenceIndex });
                
                // 預載下一句
                if (this.queue.length > 1) {
                    const nextSentence = this.queue[1].sentence;
                    if (!this.cache.has(nextSentence) && !this.prefetchInProgress.has(nextSentence)) {
                        this._prefetch(nextSentence);
                    }
                }
                
                if (!this.isPlaying) {
                    this._playLoop();
                }
            }

            async _prefetch(sentence) {
                if (this.prefetchInProgress.has(sentence)) return;
                
                this.prefetchInProgress.add(sentence);
                try {
                    console.log(`⚡ Prefetching: ${sentence.substring(0, 20)}...`);
                    
                    const cleanText = this._cleanTextForTTS(sentence);
                    if (!cleanText) return;

                    const response = await fetch(`${API_URL}/api/tts/stream`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text: cleanText,
                            voice: document.getElementById('voiceSelect').value,
                            rate: 160,
                            pitch: 100,
                            skip_browser: false
                        })
                    });

                    if (response.ok) {
                        const blob = await response.blob();
                        this.cache.set(sentence, blob);
                        console.log(`✅ Prefetch complete: ${sentence.substring(0, 20)}...`);
                    }
                } catch (error) {
                    console.warn(`⚠️ Prefetch failed for: ${sentence.substring(0, 20)}...`, error);
                } finally {
                    this.prefetchInProgress.delete(sentence);
                }
            }

            async _playLoop() {
                if (this.queue.length === 0) {
                    this.isPlaying = false;
                    this.playbackStarted = false;
                    this._hideIndicator();
                    setFoxState(null);
                    return;
                }

                this.isPlaying = true;
                
                if (!this.playbackStarted) {
                    this.playbackStarted = true;
                    this._showIndicator();
                    setFoxState('speaking');
                }
                
                const { sentence, sentenceIndex } = this.queue[0];
                console.log(`🔊 Playing [${sentenceIndex}]: ${sentence.substring(0, 30)}...`);

                this._highlightSentence(sentenceIndex);

                try {
                    // 預載下一句
                    if (this.queue.length > 1) {
                        const nextSentence = this.queue[1].sentence;
                        if (!this.cache.has(nextSentence) && !this.prefetchInProgress.has(nextSentence)) {
                            this._prefetch(nextSentence);
                        }
                    }

                    await this._playSentence(sentence);
                    
                } catch (error) {
                    console.error(`❌ Play error for: ${sentence.substring(0, 20)}...`, error);
                } finally {
                    this.cache.delete(sentence);
                    this.queue.shift();
                    
                    setImmediate(() => this._playLoop());
                }
            }

            async _playSentence(sentence) {
                let audioSource = this.cache.get(sentence);
                
                if (!audioSource) {
                    console.log(`💨 Cache miss, fetching: ${sentence.substring(0, 20)}...`);
                    
                    const cleanText = this._cleanTextForTTS(sentence);
                    if (!cleanText) return;

                    const response = await fetch(`${API_URL}/api/tts/stream`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text: cleanText,
                            voice: document.getElementById('voiceSelect').value,
                            rate: 160,
                            pitch: 100,
                            skip_browser: false
                        })
                    });
                    
                    if (!response.ok) {
                        throw new Error(`TTS request failed: ${response.status}`);
                    }
                    
                    // 優化的MediaSource決策
                    const contentType = response.headers.get('content-type') || '';
                    const shouldUseMediaSource = this.useMediaSource && 
                                                this.fallbackCount < 3 && 
                                                contentType.includes('audio/mp4');
                    
                    if (shouldUseMediaSource) {
                        console.log(`🚀 Attempting MediaSource playback`);
                        audioSource = response;
                    } else {
                        console.log(`📦 Using Blob playback (safer)`);
                        audioSource = await response.blob();
                    }
                }

                // 播放音訊
                if (audioSource instanceof Blob) {
                    return this._playWithBlob(audioSource);
                } else if (audioSource instanceof Response) {
                    try {
                        return await this._playWithMediaSource(audioSource);
                    } catch (error) {
                        console.warn('MediaSource failed, falling back to Blob:', error);
                        this.fallbackCount++;
                        mediaSourceFallbacks++;
                        
                        // 顯示降級警告
                        this._showFallbackWarning();
                        
                        // 發送遙測數據
                        fetch(`${API_URL}/api/telemetry`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                type: 'media_source_fallback',
                                data: { error: error.message }
                            })
                        }).catch(() => {});
                        
                        // 重新獲取為Blob
                        const blob = await audioSource.blob();
                        return this._playWithBlob(blob);
                    }
                }
            }

            async _playWithMediaSource(response) {
                return new Promise((resolve, reject) => {
                    const mediaSource = new MediaSource();
                    const audio = new Audio();
                    audio.src = URL.createObjectURL(mediaSource);
                    this.currentAudio = audio;

                    let sourceBuffer = null;
                    let hasStarted = false;
                    let streamEnded = false;
                    const pendingChunks = [];

                    const cleanup = () => {
                        URL.revokeObjectURL(audio.src);
                        if (sourceBuffer && !sourceBuffer.updating) {
                            try {
                                mediaSource.removeSourceBuffer(sourceBuffer);
                            } catch (e) {}
                        }
                    };

                    mediaSource.addEventListener('sourceopen', async () => {
                        try {
                            sourceBuffer = mediaSource.addSourceBuffer('audio/mp4; codecs="mp4a.40.2"');
                            
                            sourceBuffer.addEventListener('updateend', () => {
                                // 處理待處理的數據塊
                                if (pendingChunks.length > 0 && !sourceBuffer.updating) {
                                    const chunk = pendingChunks.shift();
                                    try {
                                        sourceBuffer.appendBuffer(chunk);
                                    } catch (e) {
                                        console.error('Failed to append chunk:', e);
                                        reject(e);
                                    }
                                } else if (streamEnded && pendingChunks.length === 0) {
                                    // 流結束且沒有待處理數據
                                    if (mediaSource.readyState === 'open') {
                                        mediaSource.endOfStream();
                                    }
                                }
                            });

                            const reader = response.body.getReader();
                            
                            const pump = async () => {
                                try {
                                    const { done, value } = await reader.read();
                                    
                                    if (done) {
                                        streamEnded = true;
                                        if (!sourceBuffer.updating && pendingChunks.length === 0) {
                                            mediaSource.endOfStream();
                                        }
                                        return;
                                    }

                                    if (sourceBuffer.updating || pendingChunks.length > 0) {
                                        pendingChunks.push(value);
                                    } else {
                                        try {
                                            sourceBuffer.appendBuffer(value);
                                        } catch (e) {
                                            console.error('Failed to append buffer:', e);
                                            reject(e);
                                            return;
                                        }
                                    }

                                    // 🔧 FIX: 嘗試開始播放 with better error handling
                                    if (!hasStarted && audio.buffered.length > 0) {
                                        hasStarted = true;
                                        audio.play().catch(e => {
                                            if (e.name === 'NotAllowedError') {
                                                console.error('❌ MediaSource autoplay blocked by browser policy');
                                                reject(new Error('Autoplay blocked - user interaction required'));
                                            } else {
                                                console.warn('MediaSource auto-play failed:', e);
                                                reject(e);
                                            }
                                        });
                                    }

                                    pump();
                                } catch (pumpError) {
                                    console.error('Pump error:', pumpError);
                                    reject(pumpError);
                                }
                            };

                            pump();

                        } catch (sourceError) {
                            console.error('SourceBuffer error:', sourceError);
                            reject(sourceError);
                        }
                    });

                    audio.addEventListener('ended', () => {
                        cleanup();
                        resolve();
                    });

                    audio.addEventListener('error', (e) => {
                        console.error('Audio error:', e);
                        cleanup();
                        reject(new Error(`Audio error: ${audio.error?.message || 'Unknown'}`));
                    });

                    mediaSource.addEventListener('error', (e) => {
                        console.error('MediaSource error:', e);
                        cleanup();
                        reject(new Error('MediaSource error'));
                    });

                    // 超時保護
                    setTimeout(() => {
                        if (!hasStarted) {
                            cleanup();
                            reject(new Error('MediaSource timeout'));
                        }
                    }, 5000);
                });
            }

            async _playWithBlob(blob) {
                return new Promise((resolve, reject) => {
                    const audio = new Audio(URL.createObjectURL(blob));
                    this.currentAudio = audio;

                    audio.addEventListener('ended', () => {
                        URL.revokeObjectURL(audio.src);
                        resolve();
                    });

                    audio.addEventListener('error', (e) => {
                        console.error('Blob Audio error:', e);
                        URL.revokeObjectURL(audio.src);
                        reject(e);
                    });

                    // 🔧 FIX: Improved autoplay policy handling
                    audio.play().catch(e => {
                        // Check if it's an autoplay policy error
                        if (e.name === 'NotAllowedError' || e.message.includes('play() request was interrupted')) {
                            console.error('❌ Audio autoplay blocked by browser policy. User interaction required first.');
                            console.error('Please ensure user has clicked/tapped on the page before TTS plays.');
                            URL.revokeObjectURL(audio.src);
                            reject(new Error('Autoplay blocked - user interaction required'));
                        } else {
                            console.warn('Blob Audio play failed:', e);
                            URL.revokeObjectURL(audio.src);
                            // For other errors, resolve to allow playback to continue
                            resolve();
                        }
                    });
                });
            }

            _cleanTextForTTS(text) {
                // 🔥 首先移除指令分類區塊
                let cleaned = removeCommandBlocks(text);

                // 然後做基本清理
                cleaned = cleaned
                    .replace(/\*+/g, '')
                    .replace(/#+/g, '')
                    .replace(/`+/g, '')
                    .replace(/\[.*?\]\(.*?\)/g, '')
                    .replace(/[_~]/g, '')
                    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
                    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
                    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
                    .replace(/[\u{2600}-\u{26FF}]/gu, '')
                    .replace(/[\u{2700}-\u{27BF}]/gu, '')
                    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
                    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
                    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
                    .replace(/[\/\\\(\)\[\]{}]/g, ' ')
                    .replace(/[!?,.;:]+/g, '，')
                    .replace(/\n+/g, '，')
                    .replace(/\s+/g, ' ')
                    .replace(/^[，。！？；：\s]+|[，。！？；：\s]+$/g, '')
                    .trim();

                // 🔥 最後套用粵語預處理
                return preprocessForCantoneseTTS(cleaned);
            }

            _highlightSentence(index) {
                const sentences = document.querySelectorAll('.sentence');
                sentences.forEach((s, i) => {
                    if (i === index) {
                        s.classList.add('sentence-highlight');
                    } else {
                        s.classList.remove('sentence-highlight');
                    }
                });
            }

            stop() {
                console.log('⏹️ Stopping audio player');
                this.queue = [];
                this.cache.clear();
                this.prefetchInProgress.clear();
                this.isPlaying = false;
                this.playbackStarted = false;
                
                if (this.currentAudio) {
                    this.currentAudio.pause();
                    this.currentAudio = null;
                }
                this._hideIndicator();
                setFoxState(null);
            }

            _showIndicator() {
                const indicator = document.getElementById('speakingIndicator');
                if (indicator) indicator.classList.add('active');
            }

            _hideIndicator() {
                const indicator = document.getElementById('speakingIndicator');
                if (indicator) indicator.classList.remove('active');
            }

            _showFallbackWarning() {
                const warning = document.getElementById('fallbackWarning');
                if (warning) {
                    warning.classList.add('show');
                    setTimeout(() => {
                        warning.classList.remove('show');
                    }, 3000);
                }
            }
        }

        // ===== 智能分句器 =====
        class SmartSentenceDetector {
            constructor() {
                this.buffer = '';
                this.sentences = [];
                this.MAX_BUFFER = 60;
                this.MIN_SENTENCE = 8;
                this.QUICK_CUT = /[，,；;]/;
                this.sentenceCount = 0;
                this.processedText = '';
                this.lastUpdateTime = Date.now();
                this.idleFlushInterval = null;
            }

            addText(text) {
                this.buffer += text;
                this.lastUpdateTime = Date.now();
                this.startIdleCheck();
                return this.processSentences();
            }

            startIdleCheck() {
                if (!this.idleFlushInterval) {
                    this.idleFlushInterval = setInterval(() => {
                        this.flushIfIdle();
                    }, 800);
                }
            }

            stopIdleCheck() {
                if (this.idleFlushInterval) {
                    clearInterval(this.idleFlushInterval);
                    this.idleFlushInterval = null;
                }
            }

            flushIfIdle() {
                const idleTime = Date.now() - this.lastUpdateTime;
                if (idleTime > 1500 && this.buffer.trim().length >= this.MIN_SENTENCE) {
                    console.log(`🔄 Idle flush triggered after ${idleTime}ms`);
                    return this.flush();
                }
                return [];
            }

            flush() {
                const res = splitSentencesRespectDecimal(this.buffer, this.MIN_SENTENCE);
                const merged = joinBrokenTemperatureSentences([
                    ...res.sentences,
                    res.tail.trim()
                ].filter(Boolean));
                
                this.buffer = '';
                this.stopIdleCheck();
                
                if (merged.length > 0) {
                    this.sentences.push(...merged);
                    
                    // Add to TTS queue if auto-speak is enabled
                    merged.forEach(sentence => {
                        if (document.getElementById('autoSpeak').checked) {
                            audioQueue.addToQueue(sentence, this.sentenceCount);
                            this.sentenceCount++;
                        }
                    });
                    
                    console.log(`📝 Flushed ${merged.length} sentences:`, merged.map(s => s.substring(0, 20) + '...'));
                }
                
                return merged;
            }

            processSentences() {
                const newSentences = [];
                
                // 1) 先用不會把小數點當句號的切句器
                const result = splitSentencesRespectDecimal(this.buffer, this.MIN_SENTENCE);
                let pieces = result.sentences;
                
                // 2) 把被切斷的 31. / 攝氏5度 這類片段黏回去
                pieces = joinBrokenTemperatureSentences(pieces);
                
                if (pieces.length) {
                    newSentences.push(...pieces);
                    this.sentences.push(...pieces);
                }
                this.buffer = result.tail;

                // 3) 下面是原本的「快速切逗號 / 強制切割」策略
                if (this.buffer.length > 15) {
                    const commaMatch = this.buffer.match(this.QUICK_CUT);
                    if (commaMatch && commaMatch.index >= 15) {
                        const sentence = this.buffer.substring(0, commaMatch.index + 1).trim();
                        if (sentence.length >= this.MIN_SENTENCE) {
                            newSentences.push(sentence);
                            this.sentences.push(sentence);
                            this.buffer = this.buffer.substring(commaMatch.index + 1);
                        }
                    }
                    else if (this.buffer.length > this.MAX_BUFFER) {
                        // 取 0~50 的 substring 之前，避免切在「數字.數字」中間
                        let cut = 50;
                        const look = this.buffer.substring(0, cut + 2); // 多看兩個字元
                        
                        // 若在 cut-1 位置有 '.' 且 cut-2 / cut 是數字 → 把 cut 往後挪一點
                        if (/\d\.\d/.test(look.slice(cut - 2, cut + 1))) {
                            const nextEnd = look.slice(cut + 1).search(/[。！？!?]/);
                            if (nextEnd !== -1) {
                                cut += nextEnd + 1;
                            }
                        }
                        
                        const forcedSentence = this.buffer.substring(0, cut).trim();
                        if (forcedSentence.length >= this.MIN_SENTENCE) {
                            newSentences.push(forcedSentence);
                            this.sentences.push(forcedSentence);
                            this.buffer = this.buffer.substring(cut);
                        }
                    }
                }

                // Add to TTS queue
                newSentences.forEach(sentence => {
                    if (document.getElementById('autoSpeak').checked) {
                        audioQueue.addToQueue(sentence, this.sentenceCount);
                        this.sentenceCount++;
                    }
                });

                if (newSentences.length > 0) {
                    console.log(`📝 Generated ${newSentences.length} sentences:`, newSentences.map(s => s.substring(0, 20) + '...'));
                }

                return newSentences;
            }

            reset() {
                this.buffer = '';
                this.sentences = [];
                this.sentenceCount = 0;
                this.processedText = '';
                this.lastUpdateTime = Date.now();
                this.stopIdleCheck();
                console.log('🔄 Sentence detector reset');
            }
        }

        // ===== Speech Recognition Functions =====
        let audioLevelDetector = null;
        let wakeWordDetector = null;

        let recognitionMode = 'idle'; // idle, wake-word, recording

        // New function to calibrate microphone
        async function calibrateMicrophone() {
            const infoEl = document.getElementById('micCalibrationInfo');
            const origText = infoEl.textContent;
            infoEl.textContent = '請保持安靜，正在校準中...';

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const analyser = audioContext.createAnalyser();
                const microphone = audioContext.createMediaStreamSource(stream);
                microphone.connect(analyser);

                analyser.fftSize = 256;
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                
                let measurements = [];
                const calibrationDuration = 5000; // 5 seconds
                const sampleInterval = 100; // every 100ms

                const sampler = setInterval(() => {
                    analyser.getByteFrequencyData(dataArray);
                    const average = dataArray.reduce((a, b) => a + b) / bufferLength;
                    measurements.push(average);
                }, sampleInterval);

                setTimeout(() => {
                    clearInterval(sampler);
                    stream.getTracks().forEach(track => track.stop());
                    audioContext.close();

                    if (measurements.length > 0) {
                        const ambientNoise = measurements.reduce((a, b) => a + b) / measurements.length;
                        const newThreshold = ambientNoise * 1.5 + 10; // Heuristic: 1.5x ambient noise + a constant
                        localStorage.setItem('volumeThreshold', newThreshold.toFixed(2));
                        infoEl.textContent = `校準完成！新靈敏度閾值: ${newThreshold.toFixed(2)}`;
                        console.log(`🎤 Microphone calibrated. Ambient noise: ${ambientNoise.toFixed(2)}, New threshold: ${newThreshold.toFixed(2)}`);
                        saveSettings();
                    } else {
                        infoEl.textContent = '校準失敗，請重試。';
                    }

                    setTimeout(() => { infoEl.textContent = origText; }, 4000);

                }, calibrationDuration);

            } catch (error) {
                console.error("Microphone calibration failed:", error);
                infoEl.textContent = '無法訪問麥克風，校準失敗。';
                setTimeout(() => { infoEl.textContent = origText; }, 4000);
            }
        }

        function initBrowserSpeechRecognition() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                console.error("Speech Recognition API is not supported in this browser.");
                return;
            }

            browserRecognition = new SpeechRecognition();
            browserRecognition.continuous = true;
            browserRecognition.interimResults = true;
            browserRecognition.lang = 'yue-Hant-HK';

            // CORRECT: Declare transcript variables here, outside onresult
            let finalTranscript = '';
            let confidenceTimeout = null;
            let lastProcessedCommand = ''; // Track last command to prevent duplicates
            let lastProcessedTime = 0;

            browserRecognition.onstart = () => {
                // The isRecording flag is set by the calling function (startRecording or startAutoVoiceListening)
                const voiceButton = document.getElementById('voiceButton');
                if (!isAutoListening) { // Only show recording UI for manual recording
                    if (voiceButton) voiceButton.classList.add('recording');
                    updateVoiceHint('錄音中...', '#ff3838');
                    setFoxState('listening');
                }
            };

            browserRecognition.onend = () => {
                console.log('🛑 Browser recognition ended');

                // ✨ NEW: Handle end of Follow-up Mode
                if (isFollowUpListening) {
                    isFollowUpListening = false; // Always reset the flag
                    hideListeningIndicator();
                    // If it ends, it means the user didn't say anything.
                    // Now, we can start the wake word detector.
                    const wakeWordToggle = document.getElementById('wakeWordToggle');
                    if (wakeWordDetector && wakeWordToggle?.checked && !isMassageSessionActive) {
                         console.log("🎤 Follow-up period ended. Resuming wake word detector.");
                         wakeWordDetector.start();
                    }
                    return; // End here, don't process other onend logic
                }

                if (isIntentionalStop) {
                    isIntentionalStop = false; // Reset flag
                    // 🔧 FIX: Now we can safely set isAutoListening to false
                    // because recognition has actually stopped
                    if (isAutoListening) {
                        isAutoListening = false;
                        console.log("🎤 Recognition stopped intentionally for TTS. Flag reset. Will be resumed by TTS handler.");
                    }
                    return; // Do not proceed with any restart logic here
                }
                
                if (!isAutoListening) {
                    // Normal recording ended
                    isRecording = false;
                    if (audioLevelDetector) {
                        audioLevelDetector.stop();
                        audioLevelDetector = null;
                    }
                    const voiceButton = document.getElementById('voiceButton');
                    if (voiceButton) voiceButton.classList.remove('recording');
                    updateVoiceHint('按住說話');
                    setFoxState(null);
                    
                    const userInput = document.getElementById('userInput');
                    if (userInput && userInput.value.trim()) {
                        sendMessage();
                    }
                } else if (isMassageSessionActive && isAutoListening) {
                    // 🔧 FIX: If continuous listening stops UNEXPECTEDLY during a massage, restart it using safe restart
                    console.log("🔄 Continuous recognition ended unexpectedly, restarting...");
                    // Reset flag so safe restart can work
                    isAutoListening = false;
                    // Use safe restart to prevent race conditions
                    safeRestartMassageListening();
                }
                
                // Reset for the next recognition
                finalTranscript = '';

                // Ensure wake word restarts if enabled and we are not in another recording session
                setTimeout(() => {
                    const wakeWordToggle = document.getElementById('wakeWordToggle');
                    if (wakeWordDetector && wakeWordToggle?.checked && !isAutoListening && !isRecording && !isMassageSessionActive) {
                        console.log("🔄 Restarting wake word detection after recognition ended...");
                        if (!wakeWordDetector.isListening) {
                           wakeWordDetector.start();
                        }
                    }
                }, 800); // Delay to prevent immediate restart conflicts
            };

            browserRecognition.onerror = (event) => {
                // Don't log "no-speech" as error - it's normal when user doesn't speak
                if (event.error === 'no-speech') {
                    console.log('🔇 No speech detected (normal)');
                } else if (event.error === 'aborted') {
                    console.log('⏸️ Recognition aborted (normal)');
                } else {
                    console.error('❌ Speech recognition error:', event.error);
                }

                // 🔧 FIX: Faster recovery from network errors during massage
                if (isMassageSessionActive && event.error === 'network') {
                    console.log('🔄 Network error during massage, attempting quick restart...');
                    isAutoListening = false;
                    // Reduced from 1000ms to 250ms for faster recovery
                    setTimeout(() => {
                        if (isMassageSessionActive) {
                            safeRestartMassageListening();
                        }
                    }, 250); // Quick restart
                    return; // Don't clean up UI during massage
                }

                // 🔧 CRITICAL FIX: Don't reset isAutoListening during massage for harmless errors
                // Let the onend handler manage auto-restart for massage sessions
                if (isMassageSessionActive && (event.error === 'no-speech' || event.error === 'aborted')) {
                    console.log('🎤 Harmless error during massage, letting onend handler manage restart');
                    return; // Exit early, don't reset flags or clean up UI
                }

                // For non-massage errors or serious errors, do normal cleanup
                isRecording = false;
                isAutoListening = false;
                if (audioLevelDetector) {
                    audioLevelDetector.stop();
                    audioLevelDetector = null;
                }
                const voiceButton = document.getElementById('voiceButton');
                if (voiceButton) voiceButton.classList.remove('recording', 'auto-listening');
                updateVoiceHint('按住說話');
                setFoxState(null);
                hideListeningIndicator();
            };

            browserRecognition.onresult = (event) => {
                // 🔧 FIX: Track recognition activity for health check
                lastRecognitionActivity = Date.now();

                // ✨ NEW: If speech is detected during follow-up, process it and exit follow-up mode.
                if (isFollowUpListening) {
                    console.log("🎤 Speech detected during follow-up mode.");
                    isFollowUpListening = false; // Exit follow-up mode
                    hideListeningIndicator();
                    // The rest of the onresult logic will handle the transcript as a normal command.
                }

                let interimTranscript = '';
                
                // Use the parent-scoped finalTranscript to accumulate results
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }

                // 🎤 If in auto-listening mode, process immediately
                if (isAutoListening && currentMassageSession) {
                    // For faster response during massage: process high-confidence interim or final results
                    const latestResult = event.results[event.results.length - 1];
                    const transcript = latestResult[0].transcript.trim();
                    const confidence = latestResult[0].confidence;
                    const now = Date.now();

                    // 🎯 Show what we're hearing in real-time (for debugging)
                    const listeningHint = document.getElementById('listeningHint');
                    if (listeningHint && transcript) {
                        listeningHint.textContent = `聽到: ${transcript}`;
                        listeningHint.style.opacity = '1';
                    }

                    // Skip if this is a duplicate within 2 seconds
                    if (transcript === lastProcessedCommand && (now - lastProcessedTime) < 2000) {
                        console.log(`⏭️ Skipping duplicate command: "${transcript}"`);
                        return;
                    }

                    // Process if final OR high confidence interim result
                    if (latestResult.isFinal) {
                        console.log(`🎤 Final result (confidence: ${confidence.toFixed(2)}): "${transcript}"`);

                        // Clear the listening hint after processing
                        if (listeningHint) {
                            setTimeout(() => {
                                listeningHint.textContent = '聆聽中...';
                            }, 500);
                        }

                        currentMassageSession.processVoiceResponse(transcript);
                        lastProcessedCommand = transcript;
                        lastProcessedTime = now;
                        finalTranscript = ''; // Reset after processing
                    } else if (confidence > 0.7 && transcript.length >= 2) {
                        // Quick commands: process high-confidence interim results for short phrases
                        // Lowered threshold from 0.85 to 0.7 for better sensitivity
                        const quickCommands = ['停', '停止', '暫停', '繼續', '快啲', '慢啲', '輕啲', '大力啲', '好', '唔好', '太大力', '唔夠力',
                                              'stop', 'pause', 'continue', 'start', 'faster', 'slower', 'lighter', 'harder', 'good', 'ok'];
                        if (quickCommands.some(cmd => transcript.includes(cmd))) {
                            console.log(`⚡ Quick command detected (confidence: ${confidence.toFixed(2)}): "${transcript}"`);

                            // Clear the listening hint after processing
                            if (listeningHint) {
                                setTimeout(() => {
                                    listeningHint.textContent = '聆聽中...';
                                }, 500);
                            }

                            currentMassageSession.processVoiceResponse(transcript);
                            lastProcessedCommand = transcript;
                            lastProcessedTime = now;
                            finalTranscript = ''; // Reset after processing
                        } else {
                            console.log(`🔍 Interim transcript (not a quick command): "${transcript}" (confidence: ${confidence.toFixed(2)})`);
                        }
                    } else {
                        console.log(`🔍 Low confidence interim: "${transcript}" (confidence: ${confidence ? confidence.toFixed(2) : 'N/A'})`);
                    }
                } else {
                    // This is for normal "hold-to-talk" recording
                    const userInput = document.getElementById('userInput');
                    if (userInput) {
                        userInput.value = finalTranscript + interimTranscript;
                    }

                    // Check for submission conditions (punctuation or high confidence)
                    const latestResult = event.results[event.results.length - 1];
                    if (latestResult.isFinal) {
                        const confidence = latestResult[0].confidence;
                        const endPunctuations = /[。！？啦喇呀咩囉喎]/;
                        const confidenceTimeoutDuration = parseInt(document.getElementById('confidenceTimeoutSlider').value) || 800;

                        if (endPunctuations.test(finalTranscript)) {
                            console.log('✅ Punctuation detected: submitting.');
                            stopRecording();
                        } else if (confidence > 0.8) {
                            if (confidenceTimeout) clearTimeout(confidenceTimeout);
                            confidenceTimeout = setTimeout(() => {
                                console.log('✅ High confidence: submitting.');
                                stopRecording();
                            }, confidenceTimeoutDuration);
                        }
                    }
                }
            };
        }

        async function startRecording() {
            // Block manual recording during an active massage session
            if (isMassageSessionActive) {
                console.log("🎤 Manual recording is disabled during massage session.");
                showFoxReaction('listening', 1500); // Show that it's already listening
                return;
            }

            // If a massage session is active, pressing the mic button
            // should trigger the session's listening mode.
            if (currentMassageSession && !currentMassageSession.isWaitingForResponse) {
                console.log("🎤 Manually triggering massage session voice listening.");
                await currentMassageSession.activateVoiceListening();
                return; // Exit to not start a manual recording
            }

            if (isRecording || isAutoListening) {
                console.log(`[ASR] startRecording aborted. isRecording: ${isRecording}, isAutoListening: ${isAutoListening}`);
                return;
            }
            console.log('[ASR] Starting manual recording...');
            isRecording = true;

            if (wakeWordDetector && wakeWordDetector.isListening) {
                wakeWordDetector.stop();
                await new Promise(resolve => setTimeout(resolve, 250));
            }

            if (!browserRecognition) {
                initBrowserSpeechRecognition();
            }

            try {
                document.getElementById('userInput').value = '';
                browserRecognition.start();
            } catch (error) {
                console.error("[ASR] Could not start recording:", error);
                isRecording = false; // Reset flag on error
            }
        }

        function stopRecording() {
            // Block manual stop during an active massage session
            if (isMassageSessionActive) {
                return;
            }

            // If a massage session is active and listening, releasing the button should stop it.
            if (currentMassageSession && currentMassageSession.isWaitingForResponse) {
                console.log("🎤 Manually stopping massage session voice listening.");
                currentMassageSession.cancelVoiceListening();
                return; // Exit to not stop a manual recording
            }

            if (!isRecording) return;
            console.log('🛑 Stopping manual recording...');
            if (browserRecognition) {
                // The onend event handler will set isRecording = false and handle other cleanup
                browserRecognition.stop();
            }
        }
        // ===== Wake Word Detector (改進版) =====
        class WakeWordDetector {
            constructor() {
                this.recognition = null;
                this.isListening = false;
                this.wakeWord = "護理員";
                this.wakeWordDetected = false;
                this.errorBackoff = 1000;
                this.maxBackoff = 5000; // ✅ 降低最大退避時間：從30秒改為5秒
                this.lastActivityTime = Date.now();
                this.healthCheckInterval = null;
                this.restartAttempts = 0;
                this.maxRestartAttempts = 3;
            }

            init() {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (!SpeechRecognition) {
                    console.error("Speech Recognition API is not supported in this browser.");
                    return false;
                }

                this.recognition = new SpeechRecognition();
                this.recognition.continuous = true;
                this.recognition.interimResults = true;
                this.recognition.lang = 'yue-Hant-HK';

                this.recognition.onresult = (event) => {
                    // ✅ 重置錯誤退避和活動時間
                    this.errorBackoff = 1000;
                    this.lastActivityTime = Date.now();
                    this.restartAttempts = 0;
                    
                    const wakeWordRegex = new RegExp(this.wakeWord.replace(/ /g, '\\s*'));
                    let interimTranscript = '';
                    
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        const transcript = event.results[i][0].transcript;
                        console.log(`🎤 Wake word listening: "${transcript}"`); // ✅ 添加調試日誌
                        
                        if (event.results[i].isFinal) {
                            if (wakeWordRegex.test(transcript)) {
                                this.onWakeWordDetected();
                            }
                        } else {
                            interimTranscript += transcript;
                            if (wakeWordRegex.test(interimTranscript)) {
                                this.onWakeWordDetected();
                            }
                        }
                    }
                };

                this.recognition.onend = () => {
                    console.log(`🎤 Wake word service ended. isListening: ${this.isListening}`);
                    
                    // ✅ NEW: Safety check to prevent restarting during an active massage session
                    if (isMassageSessionActive) {
                        console.log('🎤 Wake word onend: Massage is active, preventing restart.');
                        this.isListening = false; // Force flag to false
                        return;
                    }

                    if (this.isListening) {
                        // ✅ 限制重啟次數，防止無限循環
                        if (this.restartAttempts < this.maxRestartAttempts) {
                            this.restartAttempts++;
                            console.log(`🔄 Restarting wake word (attempt ${this.restartAttempts}/${this.maxRestartAttempts}) in ${this.errorBackoff / 1000}s...`);
                            setTimeout(() => this._internalStart(), this.errorBackoff);
                        } else {
                            console.warn('⚠️ Max restart attempts reached. Stopping wake word detection.');
                            this.isListening = false;
                            // ✅ 5秒後重置並嘗試重新開始
                            setTimeout(() => {
                                this.restartAttempts = 0;
                                this.errorBackoff = 1000;
                                if (document.getElementById('wakeWordToggle')?.checked) {
                                    console.log('🔄 Resetting and restarting wake word detection...');
                                    this.start();
                                }
                            }, 5000);
                        }
                    }
                };

                this.recognition.onerror = (event) => {
                    // ✅ 根據錯誤類型處理
                    if (event.error === 'no-speech') {
                        // 沒有語音不算錯誤，不記錄
                        console.log('🔇 Wake word: No speech detected (normal)');
                        this.errorBackoff = 1000;
                    } else if (event.error === 'aborted') {
                        // 被中止，可能是正常停止
                        console.log('⏸️ Wake word: Recognition aborted (normal)');
                        this.errorBackoff = 1000;
                    } else {
                        // 只有真正的錯誤才記錄
                        console.error('❌ Speech recognition error:', event.error);
                        // 其他錯誤才增加退避時間
                        this.errorBackoff = Math.min(this.errorBackoff * 1.5, this.maxBackoff);
                    }
                };

                // ✅ 啟動健康檢查
                this.startHealthCheck();

                return true;
            }

            // ✅ 內部啟動方法，避免重複重置標誌
            _internalStart() {
                try {
                    this.recognition.start();
                    console.log("✅ Wake word recognition started internally");
                } catch (error) {
                    console.error("❌ Failed to start wake word recognition:", error);
                    // 如果啟動失敗，稍後再試
                    if (this.isListening) {
                        setTimeout(() => this._internalStart(), 2000);
                    }
                }
            }

            start() {
                if (this.isListening) {
                    console.log("⚠️ Wake word already listening");
                    return;
                }
                
                this.isListening = true;
                this.wakeWordDetected = false;
                this.errorBackoff = 1000;
                this.restartAttempts = 0;
                this.lastActivityTime = Date.now();
                
                try {
                    this.recognition.start();
                    console.log("🎤 Wake word listening started...");
                } catch (error) {
                    // Handle "already started" error gracefully
                    if (error.message && error.message.includes('already started')) {
                        console.log("⚠️ Wake word recognition already running, keeping current state");
                        // Keep isListening = true, don't retry
                        return;
                    }

                    console.error("❌ Could not start wake word listening:", error);
                    this.isListening = false;

                    // ✅ 如果啟動失敗，2秒後重試
                    setTimeout(() => {
                        if (document.getElementById('wakeWordToggle')?.checked) {
                            console.log("🔄 Retrying wake word start...");
                            this.start();
                        }
                    }, 2000);
                }
            }

            stop() {
                if (!this.isListening) return;
                
                this.isListening = false;
                this.wakeWordDetected = false;
                
                try {
                    this.recognition.stop();
                    console.log("🛑 Wake word listening stopped.");
                } catch (error) {
                    console.error("❌ Error stopping wake word:", error);
                }
                
                // ✅ 停止健康檢查
                this.stopHealthCheck();
            }

            onWakeWordDetected() {
                if (this.wakeWordDetected) {
                    console.log("⚠️ Wake word already detected, ignoring duplicate");
                    return;
                }
                
                this.wakeWordDetected = true;
                console.log("🦊 Wake word detected!");
                showFoxReaction('listening', 1500);
                
                if (typeof startRecording === 'function') {
                    this.stop();
                    startRecording();
                }
            }

            // ✅ 健康檢查：每5秒檢查一次
            startHealthCheck() {
                this.stopHealthCheck(); // 先清除舊的
                
                this.healthCheckInterval = setInterval(() => {
                    if (!this.isListening) return;
                    
                    const timeSinceActivity = Date.now() - this.lastActivityTime;
                    
                    // 如果超過30秒沒有活動，可能卡住了
                    if (timeSinceActivity > 30000) {
                        console.warn('⚠️ Wake word detector seems stuck. Restarting...');
                        this.restart();
                    }
                }, 5000);
            }

            stopHealthCheck() {
                if (this.healthCheckInterval) {
                    clearInterval(this.healthCheckInterval);
                    this.healthCheckInterval = null;
                }
            }

            // ✅ 強制重啟
            restart() {
                console.log('🔄 Force restarting wake word detector...');
                const wasListening = this.isListening;
                
                try {
                    this.stop();
                } catch (e) {
                    console.error('Error during stop:', e);
                }
                
                if (wasListening && document.getElementById('wakeWordToggle')?.checked) {
                    setTimeout(() => {
                        this.start();
                    }, 1000);
                }
            }
        }

        // ===== Interactive Massage Session =====

        class InteractiveMassageSession {
            constructor(command) {
                this.command = command;
                this.duration = command.duration * 60 * 1000; // Convert to ms
                this.startTime = Date.now();
                this.checkInPoints = [10, 30, 50, 70, 90]; // Percentage points
                this.completedCheckIns = new Set();
                this.userResponses = [];
                this.progressInterval = null;
                this.isPaused = false;
                this.pausedTime = 0; // Total time spent paused
                this.pauseStartTime = null;
            }
            
            async start() {
                // 🔧 FIX: Prevent duplicate session starts
                if (this.progressInterval) {
                    console.warn('⚠️ Attempted to start a session that is already running. Aborting.');
                    return;
                }

                // ============================================================
                // 🔧 CRITICAL: Session starts IMMEDIATELY - TTS is decoupled
                // Task state is committed FIRST, TTS is fire-and-forget
                // ============================================================
                isMassageSessionActive = true;
                console.log('🎯 Massage session started - Continuous listening enabled.');

                // Emit task started event (TTS can subscribe to this)
                if (window.TTSInfrastructure?.EventBus) {
                    window.TTSInfrastructure.EventBus.emit(
                        window.TTSInfrastructure.TTSEvents.TASK_STARTED,
                        {
                            taskId: Date.now(),
                            command: this.command,
                            timestamp: Date.now()
                        }
                    );
                }

                createEmergencyStopButton();
                createPauseResumeButton();

                this.createProgressBar();

                const startDialogue = randomChoice(massageDialogues.start)
                    .replace('{bodyPart}', this.command.bodyPart || '身體')
                    .replace('{intensity}', this.command.intensity || '適中')
                    .replace('{action}', this.command.action || '按摩')
                    .replace('{duration}', this.command.duration || '5');

                // ============================================================
                // 🔧 DECOUPLED: Timer and listening start IMMEDIATELY
                // These are NOT blocked by TTS success/failure
                // ============================================================
                this.progressInterval = setInterval(() => {
                    this.checkProgress();
                }, 1000);
                startContinuousMassageListening();

                // ============================================================
                // 🔧 FIRE-AND-FORGET: TTS announcement doesn't block session
                // If TTS fails, session still runs correctly
                // ============================================================
                (async () => {
                    try {
                        await updateProgressWithDialogue(0, startDialogue);
                    } catch (e) {
                        // TTS failed but session is already running - this is OK
                        console.warn('⚠️ Initial TTS announcement failed, but session started correctly. Error:', e);

                        // Show a visual fallback message since TTS failed
                        addSystemMessage(`🎤 語音提示暫時無法播放，但按摩已開始。${startDialogue}`, 'info');
                    }
                })();
            }

            createProgressBar() {
                const responseBox = document.getElementById('responseBox');
                if (!responseBox || !responseBox.parentNode) {
                    console.error("Cannot create progress bar: responseBox or its parent not found.");
                    return;
                }
                const parentContainer = responseBox.parentNode;

                // Remove old one if exists
                const oldProgress = document.getElementById('massageProgress');
                if(oldProgress) oldProgress.remove();

                const progressDiv = document.createElement('div');
                progressDiv.id = 'massageProgress';
                progressDiv.style.cssText = `
                    padding: 15px;
                    margin: 10px; /* Use margin to space it out */
                    background: linear-gradient(135deg, rgba(74, 144, 226, 0.1), rgba(126, 217, 195, 0.1));
                    border-radius: 12px;
                    border: 1px solid var(--tech-border);
                `;
                
                progressDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <span style="font-weight: 600; color: var(--medical-blue-dark);">⏳ 按摩進行中</span>
                        <span id="progressTime" style="font-weight: 600; color: var(--primary-color);">0:00 / ${this.command.duration}:00</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: rgba(74, 144, 226, 0.2); border-radius: 4px; overflow: hidden;">
                        <div id="progressBarFill" style="height: 100%; background: linear-gradient(90deg, var(--primary-color), var(--secondary-color)); width: 0%; transition: width 0.3s;"></div>
                    </div>
                `;
                
                // Insert the progress bar before the responseBox
                parentContainer.insertBefore(progressDiv, responseBox);
            }
            
            async checkProgress() {
                // If paused, don't update progress
                if (this.isPaused) return;

                // Calculate elapsed time excluding paused time
                const currentPausedTime = this.pauseStartTime
                    ? (Date.now() - this.pauseStartTime)
                    : 0;
                const totalPausedTime = this.pausedTime + currentPausedTime;
                const elapsed = Date.now() - this.startTime - totalPausedTime;

                let progress = (elapsed / this.duration) * 100;
                if (progress >= 100) {
                    progress = 100;
                    await this.stop();
                    return; // Stop further checks
                }

                // Update progress bar
                const progressBarFill = document.getElementById('progressBarFill');
                if(progressBarFill) progressBarFill.style.width = progress + '%';

                // Update time display
                const elapsedMinutes = Math.floor(elapsed / 60000);
                const elapsedSeconds = Math.floor((elapsed % 60000) / 1000);
                const totalMinutes = this.command.duration;
                const timeDisplay = document.getElementById('progressTime');
                if (timeDisplay) {
                    timeDisplay.textContent = `${elapsedMinutes}:${elapsedSeconds.toString().padStart(2, '0')} / ${totalMinutes}:00`;
                }

                // Trigger check-ins at specific points
                this.checkInPoints.forEach(point => {
                    if (progress >= point && !this.completedCheckIns.has(point)) {
                        this.triggerCheckIn(point);
                        this.completedCheckIns.add(point);
                    }
                });
            }
            
            async triggerCheckIn(point) {
                // Instead of speaking, play a gentle sound and show a text prompt
                // This avoids interrupting the continuous listening.
                soundEffects.playConfirmSound();
                addSystemMessage(`💬 按摩已進行 ${point}%，感覺如何？`, 'info');
            }
            
            async processVoiceResponse(transcript) {
                console.log('🎤 Received voice response during massage:', transcript);
                this.userResponses.push(transcript);

                // Process the response
                await handleMidSessionResponse(transcript);

                console.log('✅ Massage response processed.');
            }

            async pause() {
                if (this.isPaused) return;

                this.isPaused = true;
                this.pauseStartTime = Date.now();

                console.log('⏸️ Massage session paused');

                // 🔧 FIX: Keep listening active during pause so user can say "繼續" to resume!
                // Only stop TTS, not voice recognition
                stopCurrentTTS();

                // Update status display
                const statusSpan = document.querySelector('#massageProgress span:first-child');
                if (statusSpan) {
                    statusSpan.textContent = '⏸️ 按摩已暫停';
                    statusSpan.style.color = '#f39c12';
                }

                // Update button text
                updatePauseResumeButton(true);

                // Send pause command to robot
                sendRobotCommand('pause');

                addSystemMessage('⏸️ 按摩已暫停', 'info');

                // Voice reminder - listening will auto-resume after TTS finishes
                await speakNurseResponse('按摩已經暫停，您可以休息一下。');

                // 🔧 Update indicator to show we're still listening during pause
                const listeningHint = document.getElementById('listeningHint');
                if (listeningHint && isAutoListening) {
                    listeningHint.textContent = '已暫停 - 可以說「繼續」恢復';
                    listeningHint.style.color = '#f39c12'; // Orange color for pause state
                }
            }

            async resume() {
                if (!this.isPaused) return;

                this.isPaused = false;

                // Add the paused duration to total paused time
                if (this.pauseStartTime) {
                    this.pausedTime += (Date.now() - this.pauseStartTime);
                    this.pauseStartTime = null;
                }

                console.log('▶️ Massage session resumed');

                // Stop any ongoing TTS first
                stopCurrentTTS();

                // Update status display
                const statusSpan = document.querySelector('#massageProgress span:first-child');
                if (statusSpan) {
                    statusSpan.textContent = '⏳ 按摩進行中';
                    statusSpan.style.color = 'var(--medical-blue-dark)';
                }

                // Update button text
                updatePauseResumeButton(false);

                // Send resume command to robot
                sendRobotCommand('resume');

                addSystemMessage('▶️ 按摩已繼續', 'info');

                // Voice reminder - listening continues automatically after TTS
                await speakNurseResponse('好，而家繼續按摩。');

                // Note: No need to restart listening because it never stopped during pause

                // 🔧 Reset indicator to normal listening state
                const listeningHint = document.getElementById('listeningHint');
                if (listeningHint && isAutoListening) {
                    listeningHint.textContent = '聆聽中...';
                    listeningHint.style.color = ''; // Reset to default color
                }
            }

            async stop() {
                removeEmergencyStopButton();
                removePauseResumeButton();

                console.log('🛑 Massage session stopping...');

                // Stop any ongoing TTS first to prevent voice overlap
                stopCurrentTTS();

                if (this.progressInterval) {
                    clearInterval(this.progressInterval);
                    this.progressInterval = null;
                }

                const completeDialogue = randomChoice(massageDialogues.complete)
                    .replace('{duration}', this.command.duration)
                    .replace('{bodyPart}', this.command.bodyPart);

                // ============================================================
                // 🔧 DECOUPLED: Completion message is fire-and-forget
                // Session ends regardless of TTS success
                // ============================================================
                try {
                    await updateProgressWithDialogue(100, completeDialogue);
                } catch (e) {
                    console.warn('⚠️ Completion TTS failed, showing fallback message:', e);
                    addSystemMessage(`✅ ${completeDialogue}`, 'info');
                }

                // NOW deactivate the session after speaking
                isMassageSessionActive = false;
                stopContinuousMassageListening();
                console.log('✅ Massage session stopped - Continuous listening disabled.');

                // Emit task completed event
                if (window.TTSInfrastructure?.EventBus) {
                    window.TTSInfrastructure.EventBus.emit(
                        window.TTSInfrastructure.TTSEvents.TASK_COMPLETED,
                        {
                            command: this.command,
                            timestamp: Date.now()
                        }
                    );
                }

                // Resume wake word detection for normal mode
                setTimeout(() => {
                    if (wakeWordDetector && !wakeWordDetector.isListening) {
                        wakeWordDetector.start();
                        console.log('🎤 Wake word detection resumed');
                    }
                }, 1000);

                // Hide controls after session ends
                setTimeout(() => {
                    const controls = document.querySelector('.massage-controls-panel');
                    if(controls) controls.style.display = 'none';
                    hideQuickResponseButtons();
                    const liveControls = document.querySelector('.live-controls');
                    if(liveControls) liveControls.style.display = 'none';
                }, 5000);

                currentMassageSession = null;
            }

            async emergencyStop() {
                console.log("🛑 EMERGENCY STOP TRIGGERED 🛑");

                // 🔧 FIX: Immediately clear session state to prevent race condition
                // This MUST happen first, before any async operations
                isMassageSessionActive = false;
                const sessionToStop = currentMassageSession;
                currentMassageSession = null;

                console.log('✅ Session state cleared immediately (prevents race condition)');

                removeEmergencyStopButton();
                removePauseResumeButton();

                // Hide/disable the stop task button in confirmation card
                const stopTaskBtn = document.getElementById('stopTaskBtn');
                if (stopTaskBtn) {
                    stopTaskBtn.disabled = true;
                    stopTaskBtn.style.opacity = '0.5';
                    stopTaskBtn.style.cursor = 'not-allowed';
                    stopTaskBtn.innerHTML = '✅ 已停止';
                }

                if (this.progressInterval) {
                    clearInterval(this.progressInterval);
                    this.progressInterval = null;
                }

                // Stop any ongoing TTS first
                stopCurrentTTS();

                // Stop robot and listening
                stopContinuousMassageListening();
                sendRobotCommand('stop');

                // Show system message first
                addSystemMessage('⛔ 緊急停止！按摩已立即中止。', 'error');

                // Clean up UI synchronously
                const controls = document.querySelector('.massage-controls-panel');
                if(controls) controls.style.display = 'none';
                hideQuickResponseButtons();
                const liveControls = document.querySelector('.live-controls');
                if(liveControls) liveControls.style.display = 'none';

                const progressDiv = document.getElementById('massageProgress');
                if (progressDiv) progressDiv.remove();

                // 🔧 FIX: Fire-and-forget TTS announcement (don't await)
                // This prevents blocking new tasks from starting
                const emergencyMessage = '緊急停止！按摩已經立即中止。';
                const emergencyVoice = 'zh-HK-HiuGaaiNeural';

                console.log('🚨 Emergency stop: Playing announcement (fire-and-forget)');
                playCantoneseTTS(emergencyMessage, emergencyVoice).catch(err => {
                    console.warn('⚠️ TTS announcement failed, but stop succeeded:', err);
                });

                // Resume wake word detection for normal mode
                setTimeout(() => {
                    if (wakeWordDetector && !wakeWordDetector.isListening) {
                        wakeWordDetector.start();
                        console.log('🎤 Wake word detection resumed after emergency stop');
                    }
                }, 1000);
            }
        }

        // 🔧 FIX: Health check for massage listening
        function startMassageListeningHealthCheck() {
            if (massageListeningHealthCheck) {
                clearInterval(massageListeningHealthCheck);
            }

            console.log('🏥 Starting massage listening health check');
            massageListeningHealthCheck = setInterval(() => {
                if (!isMassageSessionActive) {
                    stopMassageListeningHealthCheck();
                    return;
                }

                // 🔧 FIX: Skip health checks during pause (lack of activity is normal)
                if (currentMassageSession && currentMassageSession.isPaused) {
                    return; // Don't check during pause
                }

                const timeSinceActivity = Date.now() - lastRecognitionActivity;

                // If no recognition activity for 15 seconds AND listening should be active
                if (timeSinceActivity > 15000 && !isAutoListening) {
                    console.warn('⚠️ Massage listening stopped unexpectedly (no activity for 15s), restarting...');
                    safeRestartMassageListening();
                }

                // If isAutoListening is true but recognition might be stuck
                if (timeSinceActivity > 30000 && isAutoListening) {
                    console.warn('⚠️ Massage listening may be stuck (no activity for 30s), forcing restart...');
                    isAutoListening = false; // Reset flag
                    safeRestartMassageListening();
                }
            }, 5000); // Check every 5 seconds
        }

        function stopMassageListeningHealthCheck() {
            if (massageListeningHealthCheck) {
                console.log('🏥 Stopping massage listening health check');
                clearInterval(massageListeningHealthCheck);
                massageListeningHealthCheck = null;
            }
        }

        // 🔧 FIX: Safe restart function with mutex to prevent concurrent restarts
        function safeRestartMassageListening() {
            if (recognitionRestartPending) {
                console.log('⚠️ Recognition restart already pending, skipping duplicate request');
                return;
            }

            recognitionRestartPending = true;
            console.log('🔄 Safe restart initiated...');

            setTimeout(() => {
                try {
                    if (!isMassageSessionActive) {
                        console.log('⚠️ Massage session no longer active, aborting restart');
                        return;
                    }

                    if (isAutoListening) {
                        console.log('⚠️ Recognition already active, skipping restart');
                        return;
                    }

                    // Now safe to restart
                    isAutoListening = true;
                    browserRecognition.start();
                    showListeningIndicator("聆聽中...");
                    lastRecognitionActivity = Date.now();
                    console.log('✅ Recognition safely restarted');

                } catch (e) {
                    if (e.message && e.message.includes('already started')) {
                        console.log('⚠️ Recognition already running (caught in safe restart)');
                        isAutoListening = true;
                        showListeningIndicator("聆聽中...");
                    } else {
                        console.error('❌ Error in safe restart:', e);
                        isAutoListening = false;
                    }
                } finally {
                    recognitionRestartPending = false;
                }
            }, 150); // 150ms delay to avoid race conditions
        }

        async function startContinuousMassageListening() {
            if (isAutoListening) return;
            console.log('🎤 Starting continuous listening for massage session...');

            // Stop any other recognition first
            if (isRecording) {
                stopRecording();
                await new Promise(resolve => setTimeout(resolve, 250));
            }
            if (wakeWordDetector && wakeWordDetector.isListening) {
                wakeWordDetector.stop();
                await new Promise(resolve => setTimeout(resolve, 250));
            }

            if (!browserRecognition) {
                initBrowserSpeechRecognition();
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            try {
                isAutoListening = true;
                browserRecognition.start();
                showListeningIndicator("聆聽中..."); // Show a persistent indicator
                lastRecognitionActivity = Date.now(); // Reset activity timer
                startMassageListeningHealthCheck(); // 🔧 FIX: Start health monitoring
                console.log('✅ Continuous listening started - ready for quick commands');
            } catch (error) {
                // Handle "already started" error gracefully
                if (error.message && error.message.includes('already started')) {
                    console.log('⚠️ Continuous listening already running, keeping active');
                    isAutoListening = true; // Keep it active
                    showListeningIndicator("聆聽中...");
                } else {
                    console.error('❌ Continuous listening failed to start:', error);
                    isAutoListening = false;
                    hideListeningIndicator();
                }
            }
        }

        function stopContinuousMassageListening() {
            if (!isAutoListening) return;
            console.log('🎤 Stopping continuous listening for massage session...');
            isAutoListening = false;

            if (browserRecognition) {
                try {
                    browserRecognition.stop();
                } catch (e) {
                    console.warn('⚠️ Error stopping continuous recognition:', e);
                }
            }
            stopMassageListeningHealthCheck(); // 🔧 FIX: Stop health monitoring
            hideListeningIndicator();
        }

        function showListeningIndicator(message = "正在聆聽...") {
            const indicator = document.getElementById('autoListeningIndicator');
            if (indicator) {
                indicator.innerHTML = `
                    <div class="listening-animation">
                        <span class="listening-dot"></span>
                        <span class="listening-dot"></span>
                        <span class="listening-dot"></span>
                    </div>
                    <span class="listening-text">${message}</span>
                `;
                indicator.style.display = 'flex';
                indicator.classList.add('always-listening');
            }
        }

        function hideListeningIndicator() {
            const indicator = document.getElementById('autoListeningIndicator');
            if (indicator) {
                indicator.style.display = 'none';
                indicator.classList.remove('always-listening');
            }
        }

        // 🎯 Show visual feedback when command is recognized
        function showCommandRecognized(command) {
            const indicator = document.getElementById('autoListeningIndicator');
            if (indicator) {
                indicator.classList.add('command-recognized');
                setTimeout(() => {
                    indicator.classList.remove('command-recognized');
                }, 500);
            }

            // Show floating command label
            const commandLabel = document.createElement('div');
            commandLabel.className = 'command-label';
            commandLabel.textContent = `✓ 指令識別: ${command.substring(0, 20)}`;
            document.body.appendChild(commandLabel);

            setTimeout(() => {
                commandLabel.style.opacity = '0';
                setTimeout(() => commandLabel.remove(), 300);
            }, 2000);
        }

        // 🔊 Play audio beep for command confirmation
        function playCommandBeep(type = 'confirm') {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            // Different frequencies for different command types
            const frequencies = {
                'stop': 300,      // Low tone for stop
                'pause': 500,     // Mid tone for pause
                'resume': 700,    // Higher tone for resume
                'adjust': 600,    // Adjustment tone
                'confirm': 800    // High tone for confirmation
            };

            oscillator.frequency.value = frequencies[type] || frequencies.confirm;
            oscillator.type = 'sine';

            // Quick beep
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        }

        // This function is no longer needed for massage sessions but might be called from elsewhere.
        function cancelCurrentListening() {
            if (currentMassageSession) {
                // In the new model, we don't manually cancel.
            } else {
                stopAutoVoiceListening(); // Keep for non-massage contexts if any
            }
        }

        // 🎤 NEW: Handle mid-session user response
        async function handleMidSessionResponse(userInput) {
            const input = userInput.toLowerCase();
            console.log(`🔍 Command matching - Input: "${input}"`);
            console.log(`🔍 Session state - Exists: ${!!currentMassageSession}, Paused: ${currentMassageSession?.isPaused}`);

            // Show command recognition feedback
            showCommandRecognized(input);

            // ⏸️ Pause command (check FIRST - more specific)
            if (input.includes('暫停') || input.includes('停一停') || input.includes('休息') ||
                input.includes('pause') || input.includes('wait') || input.includes('hold')) {
                console.log('✅ Matched PAUSE command');
                playCommandBeep('pause');
                if(currentMassageSession && !currentMassageSession.isPaused) {
                    console.log('⏸️ Executing pause action');
                    await currentMassageSession.pause();
                } else {
                    console.log('⚠️ Cannot pause - session already paused or not active');
                }
            }
            // 🔴 Emergency/Stop commands (check AFTER pause to avoid conflict)
            else if (input.includes('停止') || input.includes('唔要') || input.includes('緊急停止') || input.includes('結束') ||
                     input.includes('stop') || input.includes('quit') || input.includes('end')) {
                console.log('✅ Matched STOP command');
                playCommandBeep('stop');
                if(currentMassageSession) {
                    console.log('🛑 Executing emergency stop');
                    currentMassageSession.emergencyStop();
                } else {
                    console.log('⚠️ Cannot stop - no active session');
                }
                // Voice announcement already handled by emergencyStop() with HiuGaai voice
            }
            // ▶️ Resume command
            else if (input.includes('繼續') || input.includes('開始') || input.includes('再嚟') || input.includes('恢復') ||
                     input.includes('continue') || input.includes('resume') || input.includes('start') || input.includes('go')) {
                console.log('✅ Matched RESUME command');
                playCommandBeep('resume');
                if(currentMassageSession && currentMassageSession.isPaused) {
                    console.log('▶️ Executing resume action');
                    await currentMassageSession.resume();
                } else {
                    console.log('⚠️ Cannot resume - session not paused or not active');
                }
            }
            // 🔻 Reduce intensity
            else if (input.includes('太大力') || input.includes('痛') || input.includes('唔舒服') || input.includes('輕柔') ||
                     input.includes('lighter') || input.includes('softer') || input.includes('gentle') || input.includes('hurt')) {
                console.log('✅ Matched REDUCE INTENSITY command');
                playCommandBeep('adjust');
                await adjustIntensity('lighter');
                await speakNurseResponse(randomChoice(massageDialogues.discomfort));
            }
            // 🔺 Increase intensity
            else if (input.includes('大力') || input.includes('加強') || input.includes('強力') ||
                     input.includes('harder') || input.includes('stronger') || input.includes('more')) {
                console.log('✅ Matched INCREASE INTENSITY command');
                playCommandBeep('adjust');
                await adjustIntensity('stronger');
                await speakNurseResponse("好，我加大啲力度。");
            }
            // 🐌 Slower speed
            else if (input.includes('慢啲') || input.includes('慢少少') || input.includes('太快') ||
                     input.includes('slower') || input.includes('slow')) {
                console.log('✅ Matched SLOWER command');
                playCommandBeep('adjust');
                await speakNurseResponse("好，我慢啲按。");
                sendRobotCommand('speed_slower');
            }
            // 🐇 Faster speed
            else if (input.includes('快啲') || input.includes('快少少') || input.includes('太慢') ||
                     input.includes('faster') || input.includes('fast')) {
                console.log('✅ Matched FASTER command');
                playCommandBeep('adjust');
                await speakNurseResponse("好，我快啲按。");
                sendRobotCommand('speed_faster');
            }
            // 🎯 Body Part Change (部位)
            else if (input.includes('肩膀') || input.includes('肩') || input.includes('shoulder')) {
                console.log('✅ Matched BODY PART: Shoulder');
                playCommandBeep('adjust');
                if (currentMassageSession) {
                    currentMassageSession.command.bodyPart = '肩膀';
                    await speakNurseResponse("好，而家轉去按肩膀。");
                    sendRobotCommand('change_bodypart_shoulder');
                }
            }
            else if (input.includes('背部') || input.includes('背') || input.includes('back')) {
                console.log('✅ Matched BODY PART: Back');
                playCommandBeep('adjust');
                if (currentMassageSession) {
                    currentMassageSession.command.bodyPart = '背部';
                    await speakNurseResponse("好，而家轉去按背部。");
                    sendRobotCommand('change_bodypart_back');
                }
            }
            else if (input.includes('腰部') || input.includes('腰') || input.includes('waist') || input.includes('lower back')) {
                console.log('✅ Matched BODY PART: Waist');
                playCommandBeep('adjust');
                if (currentMassageSession) {
                    currentMassageSession.command.bodyPart = '腰部';
                    await speakNurseResponse("好，而家轉去按腰部。");
                    sendRobotCommand('change_bodypart_waist');
                }
            }
            else if (input.includes('腿部') || input.includes('腿') || input.includes('leg')) {
                console.log('✅ Matched BODY PART: Legs');
                playCommandBeep('adjust');
                if (currentMassageSession) {
                    currentMassageSession.command.bodyPart = '腿部';
                    await speakNurseResponse("好，而家轉去按腿部。");
                    sendRobotCommand('change_bodypart_legs');
                }
            }
            else if (input.includes('頸部') || input.includes('頸') || input.includes('脖子') || input.includes('neck')) {
                console.log('✅ Matched BODY PART: Neck');
                playCommandBeep('adjust');
                if (currentMassageSession) {
                    currentMassageSession.command.bodyPart = '頸部';
                    await speakNurseResponse("好，而家轉去按頸部。");
                    sendRobotCommand('change_bodypart_neck');
                }
            }
            else if (input.includes('手臂') || input.includes('手') || input.includes('arm')) {
                console.log('✅ Matched BODY PART: Arms');
                playCommandBeep('adjust');
                if (currentMassageSession) {
                    currentMassageSession.command.bodyPart = '手臂';
                    await speakNurseResponse("好，而家轉去按手臂。");
                    sendRobotCommand('change_bodypart_arms');
                }
            }
            // 🎬 Action Change (動作)
            else if (input.includes('揉捏') || input.includes('揉') || input.includes('knead')) {
                console.log('✅ Matched ACTION: Kneading');
                playCommandBeep('adjust');
                if (currentMassageSession) {
                    currentMassageSession.command.action = '揉捏';
                    await speakNurseResponse("好，而家改用揉捏動作。");
                    sendRobotCommand('change_action_knead');
                }
            }
            else if (input.includes('敲打') || input.includes('敲') || input.includes('tap') || input.includes('pat')) {
                console.log('✅ Matched ACTION: Tapping');
                playCommandBeep('adjust');
                if (currentMassageSession) {
                    currentMassageSession.command.action = '敲打';
                    await speakNurseResponse("好，而家改用敲打動作。");
                    sendRobotCommand('change_action_tap');
                }
            }
            else if (input.includes('推拿') || input.includes('推') || input.includes('massage') || input.includes('press')) {
                console.log('✅ Matched ACTION: Massage');
                playCommandBeep('adjust');
                if (currentMassageSession) {
                    currentMassageSession.command.action = '推拿';
                    await speakNurseResponse("好，而家改用推拿動作。");
                    sendRobotCommand('change_action_massage');
                }
            }
            else if (input.includes('指壓') || input.includes('acupressure') || input.includes('pressure point')) {
                console.log('✅ Matched ACTION: Acupressure');
                playCommandBeep('adjust');
                if (currentMassageSession) {
                    currentMassageSession.command.action = '指壓';
                    await speakNurseResponse("好，而家改用指壓動作。");
                    sendRobotCommand('change_action_acupressure');
                }
            }
            // ⏱️ Duration Change (時長)
            else if (input.includes('延長') || input.includes('加長') || input.includes('多啲時間') ||
                     input.includes('extend') || input.includes('longer') || input.includes('more time')) {
                console.log('✅ Matched DURATION: Extend');
                playCommandBeep('adjust');
                if (currentMassageSession) {
                    const extraMinutes = 5;
                    currentMassageSession.duration += extraMinutes * 60 * 1000;
                    currentMassageSession.command.duration += extraMinutes;
                    await speakNurseResponse(`好，我幫您延長${extraMinutes}分鐘。`);
                    sendRobotCommand('extend_duration');
                }
            }
            else if (input.includes('縮短') || input.includes('減少時間') || input.includes('快啲完') ||
                     input.includes('shorten') || input.includes('less time') || input.includes('finish sooner')) {
                console.log('✅ Matched DURATION: Shorten');
                playCommandBeep('adjust');
                if (currentMassageSession) {
                    const reduceMinutes = 2;
                    currentMassageSession.duration -= reduceMinutes * 60 * 1000;
                    if (currentMassageSession.duration < 60000) {
                        currentMassageSession.duration = 60000; // Minimum 1 minute
                    }
                    await speakNurseResponse(`好，我幫您縮短${reduceMinutes}分鐘。`);
                    sendRobotCommand('shorten_duration');
                }
            }
            // ✅ Positive feedback
            else if (input.includes('好') || input.includes('啱') || input.includes('舒服') || input.includes('正') ||
                     input.includes('good') || input.includes('ok') || input.includes('fine') || input.includes('nice')) {
                console.log('✅ Matched POSITIVE FEEDBACK');
                playCommandBeep('confirm');
                await speakNurseResponse("好！咁就繼續啦。");
            }
            // ❓ Default acknowledgment
            else {
                console.log('ℹ️ No specific command matched, using default acknowledgment');
                // If the response is not a clear command, just acknowledge and continue
                await speakNurseResponse("收到，我哋繼續按摩。");
            }
        }

        // 🎤 NEW: Update UI with dialogue
        async function updateProgressWithDialogue(progress, message) {
            const progressDiv = document.getElementById('massageProgress');
            
            if(progressDiv) {
                const progressBarFill = progressDiv.querySelector('#progressBarFill');
                if(progressBarFill) progressBarFill.style.width = progress + '%';
            }
            
            const dialogueBubble = document.createElement('div');
            dialogueBubble.className = 'nurse-dialogue-bubble message-bubble visible';
            dialogueBubble.innerHTML = `
                <div class="nurse-avatar"><img src="/static/nurse_chatbot_logo.png" alt="Nurse Avatar" style="width: 40px; height: 40px; border-radius: 50%;"></div>
                <div class="dialogue-text">${message}</div>
            `;
            
            const responseBox = document.getElementById('responseBox');
            responseBox.appendChild(dialogueBubble);
            responseBox.scrollTop = responseBox.scrollHeight;
            
            // ✅ Use fixed speakNurseResponse which will use server TTS during massage
            await speakNurseResponse(message);
        }

        // Speak response as nurse
        // ============================================================
        // 🔧 OPTIMIZED: Event-driven TTS with graceful degradation
        // TTS failures will NOT block task execution or crash UI
        // ============================================================
        async function speakNurseResponse(text, customVoice = null) {
            if (!document.getElementById('autoSpeak')?.checked) {
                return;
            }

            const cleanText = preprocessForCantoneseTTS(stripHTML(text));

            // ✅ Use RobustTTS infrastructure when available
            if (window.robustTTS) {
                try {
                    // During massage session, use high priority
                    if (isMassageSessionActive) {
                        console.log('🎤 Massage session: Using RobustTTS (high priority)');
                        await window.robustTTS.speakAsync(cleanText, {
                            voice: customVoice,
                            priority: 'high'
                        });
                    } else {
                        // Normal mode: non-blocking
                        window.robustTTS.speak(cleanText, {
                            voice: customVoice,
                            priority: 'normal'
                        });
                    }
                } catch (error) {
                    // TTS error should NOT crash the app - just log it
                    console.warn('[speakNurseResponse] TTS error (non-fatal):', error.message);
                }
                return;
            }

            // ============================================================
            // LEGACY FALLBACK: Original implementation
            // ============================================================
            // ✅ During massage session, ALWAYS use server TTS (never browser fallback)
            if (isMassageSessionActive) {
                console.log('🎤 Massage session: Using server TTS');
                await playCantoneseTTS(cleanText, customVoice);
                return;
            }

            // Normal mode: Use UltraFastTTS or fallback
            if (window.ultraFastTTS && typeof window.ultraFastTTS.addText === 'function') {
                window.ultraFastTTS.addText(cleanText);
            } else if (audioQueue && typeof audioQueue.addText === 'function') {
                audioQueue.addText(cleanText);
            } else {
                // Only use browser TTS as last resort (not during massage)
                console.warn('⚠️ Using browser TTS fallback');
                speakText(cleanText);
            }
        }

        function showQuickResponseButtons() {
            const buttons = document.querySelector('.quick-response-buttons');
            if(buttons) buttons.style.display = 'flex';
        }

        function hideQuickResponseButtons() {
            const buttons = document.querySelector('.quick-response-buttons');
            if(buttons) buttons.style.display = 'none';
        }
        
        async function adjustIntensity(direction) {
            const intensityDisplay = document.getElementById('currentIntensityDisplay');
            if (!intensityDisplay) return;

            const currentIndex = INTENSITY_LEVELS.indexOf(intensityDisplay.textContent.replace('當前：', ''));
            let newIndex = currentIndex;

            if (direction === 'lighter' && currentIndex > 0) {
                newIndex--;
            } else if (direction === 'stronger' && currentIndex < INTENSITY_LEVELS.length - 1) {
                newIndex++;
            }
            
            if (newIndex !== currentIndex) {
                const newIntensity = INTENSITY_LEVELS[newIndex];
                intensityDisplay.textContent = `當前：${newIntensity}`;
                if(currentMassageSession) {
                    currentMassageSession.command.intensity = newIntensity;
                }
                console.log(`Intensity changed to: ${newIntensity}`);
            }
        }

        function randomChoice(arr) {
            return arr[Math.floor(Math.random() * arr.length)];
        }

        // ===== Audio Level Detector =====
        class AudioLevelDetector {
            constructor() {
                this.audioContext = null;
                this.analyser = null;
                this.microphone = null;
                this.isSpeaking = false;
                this.silenceStartTime = null;
                // Get values from settings, with defaults
                const settings = 'nurseAISettings'
                this.volumeThreshold = parseFloat(settings.volumeThreshold) || 30;
                this.silenceThreshold = parseInt(settings.silenceThreshold) || 1500;
                this.animationFrameId = null; // To hold the requestAnimationFrame ID
            }

            async init(stream) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 256;
                
                this.microphone = this.audioContext.createMediaStreamSource(stream);
                this.microphone.connect(this.analyser);
                
                this.startMonitoring();
            }

            startMonitoring() {
                const bufferLength = this.analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                
                const checkVolume = () => {
                    if (!isRecording) {
                        this.stop(); // Stop monitoring if recording has stopped
                        return;
                    }
                    
                    this.analyser.getByteFrequencyData(dataArray);
                    
                    const average = dataArray.reduce((a, b) => a + b) / bufferLength;
                    
                    const volumeBar = document.getElementById('volumeBar');
                    if (volumeBar) {
                        volumeBar.style.width = Math.min(average * 2, 100) + '%';
                    }
                    
                    if (average > this.volumeThreshold) {
                        if (!this.isSpeaking) {
                            console.log('🎤 開始說話');
                            this.isSpeaking = true;
                        }
                        this.silenceStartTime = null;
                    } else {
                        if (this.isSpeaking && !this.silenceStartTime) {
                            this.silenceStartTime = Date.now();
                            console.log('🤫 開始靜音');
                        }
                        
                        if (this.silenceStartTime) {
                            const silenceDuration = Date.now() - this.silenceStartTime;
                            if (silenceDuration > this.silenceThreshold) {
                                console.log('✅ 音量檢測:靜音超時');
                                const userInput = document.getElementById('userInput');
                                if (userInput?.value.trim()) {
                                    stopRecording();
                                }
                            }
                        }
                    }
                    
                    this.animationFrameId = requestAnimationFrame(checkVolume);
                };
                
                this.animationFrameId = requestAnimationFrame(checkVolume);
            }

            stop() {
                if (this.animationFrameId) {
                    cancelAnimationFrame(this.animationFrameId);
                    this.animationFrameId = null;
                }
                if (this.microphone) {
                    this.microphone.disconnect();
                }
                if (this.audioContext && this.audioContext.state !== 'closed') {
                    this.audioContext.close();
                }
                this.isSpeaking = false;
                this.silenceStartTime = null;
            }
        }


        /**
         * 將文字切句，但忽略數字之間的小數點（例如 32.5）。
         * @param {string} str
         * @param {number} minLen
         * @returns {{sentences: string[], tail: string}}
         */
        function splitSentencesRespectDecimal(str, minLen = 8) {
            const sentences = [];
            const endMarks = new Set(['。', '！', '!', '？', '?']);
            let start = 0;
            
            for (let i = 0; i < str.length; i++) {
                const ch = str[i];
                if (ch === '.') {
                    // 如果 . 兩邊都是數字 => 小數點，不當句號
                    const prev = str[i - 1], next = str[i + 1];
                    if (prev && next && /\d/.test(prev) && /\d/.test(next)) {
                        continue; // 跳過小數點
                    }
                    // 否則視作句號
                    const s = str.slice(start, i + 1).trim();
                    if (s.length >= minLen) sentences.push(s);
                    start = i + 1;
                } else if (endMarks.has(ch)) {
                    const s = str.slice(start, i + 1).trim();
                    if (s.length >= minLen) sentences.push(s);
                    start = i + 1;
                }
            }
            
            const tail = str.slice(start);
            return { sentences, tail };
        }

        /** 把「31.」「攝氏5度。」這類被拆開的句子黏回去 */
        function joinBrokenTemperatureSentences(sentences) {
            if (!sentences || sentences.length <= 1) return sentences;
            
            const result = [];
            let i = 0;
            
            while (i < sentences.length) {
                let current = sentences[i];
                
                // 檢查當前句子是否以數字結尾（可能被切斷的溫度）
                if (i < sentences.length - 1) {
                    const next = sentences[i + 1];
                    
                    // 情況1: "31." + "5°C" 或 "31." + "5度"
                    if (/\d+\.$/.test(current.trim()) && /^\d+[°度℃]/.test(next.trim())) {
                        current = current + next;
                        i += 2; // 跳過下一個句子
                    }
                    // 情況2: "攝氏31" + ".5度" 
                    else if (/攝氏\d+$/.test(current.trim()) && /^\.\d+[度°℃]/.test(next.trim())) {
                        current = current + next;
                        i += 2;
                    }
                    // 情況3: "溫度31" + ".5°C"
                    else if (/溫度\d+$/.test(current.trim()) && /^\.\d+[°℃度]/.test(next.trim())) {
                        current = current + next;
                        i += 2;
                    }
                    // 情況4: "31" + ".5°C今日..."
                    else if (/\d+$/.test(current.trim()) && /^\.\d+[°℃度]/.test(next.trim())) {
                        current = current + next;
                        i += 2;
                    }
                    else {
                        i++;
                    }
                } else {
                    i++;
                }
                
                result.push(current);
            }
            
            return result;
        }      

        // ===== 麥克風管理功能 =====
        async function getMicrophoneStream() {
            if (sharedMicStream) {
                const tracks = sharedMicStream.getTracks();
                if (tracks.length > 0 && tracks[0].readyState === 'live') {
                    tracks[0].enabled = true;
                    return sharedMicStream;
                }
            }

            try {
                sharedMicStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        sampleRate: 16000,
                        channelCount: 1,
                        echoCancellation: true,
                        noiseSuppression: true
                    } 
                });
                
                microphonePermissionGranted = true;
                micStreamActive = true;
                console.log('Microphone stream obtained');
                
                return sharedMicStream;
            } catch (error) {
                console.error('Failed to get microphone:', error);
                microphonePermissionGranted = false;
                throw error;
            }
        }

        async function checkMicrophonePermission() {
            if ('permissions' in navigator) {
                try {
                    const result = await navigator.permissions.query({ name: 'microphone' });
                    microphonePermissionGranted = result.state === 'granted';
                    
                    result.addEventListener('change', () => {
                        microphonePermissionGranted = result.state === 'granted';
                        console.log('Microphone permission changed:', result.state);
                    });
                    
                    return result.state;
                } catch (error) {
                    console.log('Permissions API not fully supported');
                }
            }
            return 'unknown';
        }

        async function initializeMicrophone() {
            const permissionState = await checkMicrophonePermission();
            
            if (permissionState === 'prompt') {
                const guide = document.createElement('div');
                guide.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: white;
                    padding: 20px;
                    border-radius: 10px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                    z-index: 10000;
                    text-align: center;
                    max-width: 300px;
                `;
                guide.innerHTML = `
                    <h3 style="color: #FFA76E; margin-bottom: 10px;">🎤 麥克風權限</h3>
                    <p style="color: #5D4E37; margin-bottom: 15px;">
                        請撳「允許」使用麥克風<br>
                        <strong>建議揀選「訪問呢個網站時允許」</strong><br>
                        咁就唔使每次都問喇！
                    </p>
                    <button onclick="this.parentElement.remove()" style="
                        background: #FFA76E;
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 20px;
                        cursor: pointer;
                        font-size: 16px;
                    ">我知道喇</button>
                `;
                document.body.appendChild(guide);
                
                setTimeout(() => guide.remove(), 5000);
            }
            
            if (permissionState === 'granted' || permissionState === 'prompt') {
                try {
                    await getMicrophoneStream();
                    if (sharedMicStream) {
                        sharedMicStream.getTracks().forEach(track => {
                            track.enabled = false;
                        });
                    }
                    return true;
                } catch (error) {
                    return false;
                }
            }
            
            return permissionState === 'granted';
        }



        // ===== 小狐狸狀態管理 =====
        function setNurseState(state) {
            const assistant = document.getElementById('nurseAssistant');
            if (!assistant) return;
            assistant.classList.remove('listening', 'thinking', 'speaking', 'happy', 'surprised');
            if (state) {
                assistant.classList.add(state);
            }
        }

        function setFoxState(state) {
            setNurseState(state);
        }

        function showFoxReaction(type, duration = 2000) {
            setFoxState(type);
            if (duration > 0) {
                setTimeout(() => setFoxState(null), duration);
            }
        }



        // 生成粒子效果
        function spawnParticles(emoji, count = 5) {
            const assistant = document.getElementById('nurseAssistant');
            if (!assistant) return;

            const rect = assistant.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    const particle = document.createElement('div');
                    particle.className = 'particle';
                    particle.textContent = emoji;
                    particle.style.left = `${centerX + (Math.random() - 0.5) * 50}px`;
                    particle.style.top = `${centerY + (Math.random() - 0.5) * 50}px`;
                    particle.style.fontSize = `${Math.random() * 24 + 16}px`;
                    particle.style.opacity = Math.random() * 0.5 + 0.5;
                    
                    document.body.appendChild(particle);
                    
                    // 移除粒子
                    setTimeout(() => {
                        particle.remove();
                    }, 2500);
                }, i * 100);
            }
        }

        // 解鎖成就
        function unlockBadge(badgeId, emoji = '🎉', particleCount = 12) {
            const badge = document.getElementById(badgeId);
            if (badge && !badge.classList.contains('unlocked')) {
                badge.classList.add('unlocked');
                showFoxReaction('happy', 3000);
                spawnParticles(emoji, particleCount);
                
                // 添加震動效果
                badge.animate([
                    { transform: 'translateX(0)' },
                    { transform: 'translateX(-5px)' },
                    { transform: 'translateX(5px)' },
                    { transform: 'translateX(0)' }
                ], {
                    duration: 300,
                    iterations: 2
                });

                // 播放音效（如果有音頻API）
                playSound('achievement');
            }
        }

        // 情感分析
        function analyzeSentiment(text) {
            const positiveWords = ["舒服", "放鬆", "好", "謝謝", "舒適", "滿意", "棒"];
            const negativeWords = ["痛", "不舒服", "酸", "累", "緊繃"];
            const massageWords = ["按摩", "推拿", "揉捏", "指壓", "肩膀", "背部", "腰部"];
            const relaxWords = ["放鬆", "舒緩", "休息", "冥想"];
            const careWords = ["護理", "照顧", "關懷", "健康"];
            
            const positiveScore = positiveWords.filter(w => text.includes(w)).length;
            const negativeScore = negativeWords.filter(w => text.includes(w)).length;
            
            // 根據情感分數做出反應
            if (positiveScore > negativeScore) {
                showFoxReaction("happy", 3000);
                spawnParticles("💙", 8);
            } else if (negativeScore > positiveScore) {
                showFoxReaction("thinking", 2000);
                spawnParticles("💭", 5);
            }

            // 檢查成就解鎖條件
            if (massageWords.some(w => text.includes(w))) {
                setTimeout(() => unlockBadge('massageExpert', '⭐', 10), 1000);
            }
            if (relaxWords.some(w => text.includes(w))) {
                setTimeout(() => unlockBadge('relaxationMaster', '🧘', 10), 1500);
            }
            if (careWords.some(w => text.includes(w))) {
                setTimeout(() => unlockBadge('wellnessGuardian', '❤️', 10), 2000);
            }

            // 夜晚檢查
            const hour = new Date().getHours();
            if (hour >= 20 || hour <= 6) {
                setTimeout(() => unlockBadge('nightCare', '🌙', 10), 2500);
            }
        }

        // 播放音效
        function playSound(type) {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            switch(type) {
                case 'achievement':
                    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
                    oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
                    oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
                    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                    oscillator.start(audioContext.currentTime);
                    oscillator.stop(audioContext.currentTime + 0.3);
                    break;
                case 'message':
                    oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
                    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
                    oscillator.start(audioContext.currentTime);
                    oscillator.stop(audioContext.currentTime + 0.1);
                    break;
            }
        }

        // 創建螢火蟲
        function createFireflies() {
            const forestBg = document.getElementById('forestBg');
            for (let i = 0; i < 5; i++) {
                const firefly = document.createElement('div');
                firefly.className = 'firefly';
                firefly.style.left = Math.random() * 100 + '%';
                firefly.style.top = Math.random() * 100 + '%';
                firefly.style.animationDelay = Math.random() * 20 + 's';
                firefly.style.animationDuration = (15 + Math.random() * 10) + 's';
                forestBg.appendChild(firefly);
            }
        }

        // 顯示打字指示器
        function showTypingIndicator() {
            if (currentTypingBubble) return;

            const responseBox = document.getElementById('responseBox');
            const typingBubble = document.createElement('div');
            typingBubble.className = 'fox-bubble message-bubble visible';
            typingBubble.innerHTML = `
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            `;
            
            responseBox.appendChild(typingBubble);
            currentTypingBubble = typingBubble;
            responseBox.scrollTop = responseBox.scrollHeight;
        }

        // 隱藏打字指示器
        function hideTypingIndicator() {
            if (currentTypingBubble) {
                currentTypingBubble.remove();
                currentTypingBubble = null;
            }
        }

        // 添加消息的通用函數
        function addMessage(message, isUser = false) {
            const responseBox = document.getElementById('responseBox');
            
            const bubble = document.createElement('div');
            bubble.className = isUser ? 'user-bubble message-bubble' : 'fox-bubble message-bubble';
            bubble.innerHTML = message;
            
            responseBox.appendChild(bubble);
            
            // 觸發動畫
            setTimeout(() => {
                bubble.classList.add('visible');
            }, 10);

            responseBox.scrollTop = responseBox.scrollHeight;
            
            if (isUser) {
                analyzeSentiment(message);
                messageCount++;
            } else {
                // 小狐狸說話狀態
                showFoxReaction('speaking', 2000);
                
                // 自動朗讀
                if (document.getElementById('autoSpeak').checked) {
                    speakText(message);
                }
            }
        }

        // 添加用戶消息
        function addUserMessage(message) {
            addMessage(message, true);
        }

        // 添加小狐狸回復
        function addFoxMessage(message) {
            hideTypingIndicator();
            addMessage(message, false);
        }

        function updateVoiceHint(text, color) {
            const hint = document.querySelector('.voice-button-container .voice-hint');
            if (!hint) return;
            hint.textContent = text;
            if (color) {
                hint.style.color = color;
            } else {
                hint.style.removeProperty('color');
            }
        }

        const COMMAND_BLOCK_OPEN = '[指令分類]';
        const COMMAND_BLOCK_CLOSE = '[/指令分類]';

        function removeCommandBlocks(text) {
            if (!text) return '';
            return text
                .replace(/\[指令分類\][\s\S]*?(?:\[\/指令分類\]|$)/g, '')
                .replace(/\[\/指令分類\]/g, '')
                .replace(/\[指令分類\]/g, '');
        }

        function filterCommandBlockChunk(chunk) {
            if (!chunk) return '';
            let remaining = chunk;
            let result = '';

            while (remaining.length > 0) {
                if (isInCommandBlock) {
                    const endIndex = remaining.indexOf(COMMAND_BLOCK_CLOSE);
                    if (endIndex === -1) {
                        return result;
                    }
                    remaining = remaining.slice(endIndex + COMMAND_BLOCK_CLOSE.length);
                    isInCommandBlock = false;
                    continue;
                }

                const startIndex = remaining.indexOf(COMMAND_BLOCK_OPEN);
                if (startIndex === -1) {
                    const strayCloseIndex = remaining.indexOf(COMMAND_BLOCK_CLOSE);
                    if (strayCloseIndex !== -1) {
                        result += remaining.slice(0, strayCloseIndex);
                        remaining = remaining.slice(strayCloseIndex + COMMAND_BLOCK_CLOSE.length);
                        continue;
                    }
                    result += remaining;
                    break;
                }

                result += remaining.slice(0, startIndex);
                remaining = remaining.slice(startIndex + COMMAND_BLOCK_OPEN.length);
                isInCommandBlock = true;
            }

            return result;
        }

        // 4 + 5) 文字轉語音：改用粵語 (zh-HK)，並在送進 TTS 前把 32.8°C 轉成「攝氏32點8度」
        function speakText(text) {
            if ('speechSynthesis' in window) {
                speechSynthesis.cancel(); // 停止當前播放

                const processed = preprocessForCantoneseTTS(stripHTML(text));
                const utterance = new SpeechSynthesisUtterance(processed);

                const voices = speechSynthesis.getVoices();
                const selectedVoiceValue = document.getElementById('voiceSelect')?.value;
                let selectedVoice = null;

                // 🔥 Map Edge TTS voice IDs to browser TTS preferences
                const voicePreferences = {
                    'zh-HK-HiuGaaiNeural': ['zh-HK', 'zh-TW', 'Hiu', 'female', 'Chinese'],  // Female Cantonese
                    'zh-HK-HiuMaanNeural': ['zh-HK', 'zh-TW', 'Hiu', 'female', 'Chinese'], // Female Cantonese
                    'zh-HK-WanLungNeural': ['zh-HK', 'zh-TW', 'Wan', 'male', 'Chinese']    // Male Cantonese
                };

                // 1. Try to find browser voice matching Edge TTS preference
                if (selectedVoiceValue && voicePreferences[selectedVoiceValue]) {
                    const keywords = voicePreferences[selectedVoiceValue];

                    // Prefer female voices for HiuGaai/HiuMaan, male for WanLung
                    const preferFemale = selectedVoiceValue.includes('Hiu');

                    // Search for best matching voice
                    for (const keyword of keywords) {
                        selectedVoice = voices.find(v => {
                            const matchesLang = v.lang?.toLowerCase().includes(keyword.toLowerCase());
                            const matchesName = v.name?.toLowerCase().includes(keyword.toLowerCase());
                            const matchesGender = preferFemale ?
                                (v.name?.toLowerCase().includes('female') || v.name?.toLowerCase().includes('woman')) :
                                (v.name?.toLowerCase().includes('male') || v.name?.toLowerCase().includes('man'));

                            return matchesLang || matchesName || matchesGender;
                        });

                        if (selectedVoice) {
                            console.log(`🎤 Browser TTS: Using ${selectedVoice.name} (mapped from ${selectedVoiceValue})`);
                            break;
                        }
                    }
                }

                // 2. Fallback: Find any Cantonese/Chinese voice, STRONGLY prefer female
                if (!selectedVoice) {
                    // Priority 1: HK female voices
                    selectedVoice = voices.find(v =>
                        v.lang?.toLowerCase().startsWith('zh-hk') &&
                        (v.name?.toLowerCase().includes('female') || v.name?.toLowerCase().includes('woman') || v.name?.includes('Tracy') || v.name?.includes('HiuMaan') || v.name?.includes('HiuGaai'))
                    );

                    // Priority 2: Any HK voice (but prefer non-Danny if multiple exist)
                    if (!selectedVoice) {
                        const hkVoices = voices.filter(v => v.lang?.toLowerCase().startsWith('zh-hk'));
                        // Try to avoid Danny if there are other options
                        selectedVoice = hkVoices.find(v => !v.name?.includes('Danny')) || hkVoices[0];
                    }

                    // Priority 3: Taiwan female voices (similar to Cantonese)
                    if (!selectedVoice) {
                        selectedVoice = voices.find(v =>
                            v.lang?.toLowerCase().startsWith('zh-tw') &&
                            (v.name?.toLowerCase().includes('female') || v.name?.toLowerCase().includes('woman'))
                        );
                    }

                    // Priority 4: Any Chinese female voice
                    if (!selectedVoice) {
                        selectedVoice = voices.find(v =>
                            v.lang?.toLowerCase().includes('zh') &&
                            (v.name?.toLowerCase().includes('female') || v.name?.toLowerCase().includes('woman'))
                        );
                    }

                    // Priority 5: Any Chinese voice with "Hiu" or Cantonese markers
                    if (!selectedVoice) {
                        selectedVoice = voices.find(v => v.name?.includes('Hiu') || v.lang?.includes('yue'));
                    }

                    // Priority 6: Any Chinese voice
                    if (!selectedVoice) {
                        selectedVoice = voices.find(v => v.lang?.toLowerCase().includes('zh'));
                    }

                    if (selectedVoice) {
                        console.log(`🎤 Browser TTS: Using fallback voice ${selectedVoice.name} (${selectedVoice.lang})`);
                    }
                }

                if (selectedVoice) {
                    utterance.voice = selectedVoice;
                } else {
                    console.warn('⚠️ No suitable Cantonese voice found, using default');
                }

                utterance.lang = 'zh-HK';
                utterance.rate = 1.0;
                utterance.pitch = 1.1;
                utterance.volume = 0.95;

                utterance.onstart = () => {
                    showFoxReaction('speaking', 0);
                };

                utterance.onend = () => {
                    setFoxState(null);
                };

                speechSynthesis.speak(utterance);
            }
        }

        function stopCurrentTTS() {
            // ============================================================
            // 🔧 OPTIMIZED: Stop RobustTTS if available
            // ============================================================
            if (window.robustTTS) {
                window.robustTTS.stop(true); // Stop and clear queue
                console.log('🛑 Stopped RobustTTS');
            }

            // Also stop legacy audio if present
            if (currentTTSAudio) {
                console.log('🛑 Stopping current TTS audio');
                currentTTSAudio.pause();
                currentTTSAudio.currentTime = 0;
                currentTTSAudio = null;
            }

            // Stop browser speech synthesis
            if ('speechSynthesis' in window) {
                speechSynthesis.cancel();
            }

            const indicator = document.getElementById('speakingIndicator');
            if (indicator) indicator.classList.remove('active');
            setFoxState(null);

            // Reset the TTS playing flag
            isTTSPlaying = false;
        }

        async function playCantoneseTTS(text, customVoice = null, meta = { isFollowUp: false }) {
            // ============================================================
            // 🔧 OPTIMIZED: Use RobustTTS Infrastructure when available
            // This provides: circuit breaker, retry, queue, and decoupling
            // ============================================================
            if (window.robustTTS) {
                const wasListening = isAutoListening;
                const wasWakeWordActive = wakeWordDetector && wakeWordDetector.isListening;

                // Pause listening during TTS (will auto-resume via onSpeakingEnd callback)
                if (wasListening) {
                    console.log("🎤 Pausing continuous listening for TTS (robust mode).");
                    isIntentionalStop = true;
                    try { browserRecognition.stop(); } catch(e) { /* ignore */ }
                }
                if (wasWakeWordActive) {
                    console.log("🎤 Stopping wake word detector for TTS.");
                    wakeWordDetector.stop();
                }

                const cleanText = stripHTML(text);
                const processedText = preprocessForCantoneseTTS(cleanText);
                const selectedVoice = customVoice || document.getElementById('voiceSelect')?.value || 'zh-HK-HiuGaaiNeural';

                // Use speakAsync for blocking calls (like massage dialogues)
                // This returns immediately but waits for completion
                try {
                    await window.robustTTS.speakAsync(processedText, {
                        voice: selectedVoice,
                        priority: 'high'
                    });
                } catch (error) {
                    // Error already handled by infrastructure, just log
                    console.warn('[playCantoneseTTS] TTS completed with error (task continues):', error.message);
                }

                // Resume wake word if needed (listening resumes via callback)
                if (wasWakeWordActive && !isMassageSessionActive) {
                    if (wakeWordDetector && !wakeWordDetector.isListening) {
                        wakeWordDetector.start();
                    }
                }

                // Handle follow-up listening
                if (meta.isFollowUp && !isMassageSessionActive) {
                    startFollowUpListening();
                }

                return; // Done with robust TTS
            }

            // ============================================================
            // LEGACY FALLBACK: Original implementation for backward compatibility
            // ============================================================
            // 🚫 Prevent overlapping TTS: Stop any currently playing or fetching audio first
            if (isTTSPlaying || currentTTSAudio) {
                console.log('🛑 Stopping previous TTS to prevent overlap');
                stopCurrentTTS();
                await new Promise(resolve => setTimeout(resolve, 150));
            }

            isTTSPlaying = true;
            const wasListening = isAutoListening;
            const wasWakeWordActive = wakeWordDetector && wakeWordDetector.isListening;

            try {
                if (wasListening) {
                    console.log("🎤 Pausing continuous listening for TTS.");
                    isIntentionalStop = true;
                    browserRecognition.stop();
                }
                if (wasWakeWordActive) {
                    console.log("🎤 Stopping wake word detector to prevent self-listening during TTS.");
                    wakeWordDetector.stop();
                }

                const indicator = document.getElementById('speakingIndicator');
                if (indicator) indicator.classList.add('active');
                setFoxState('speaking');

                const cleanText = stripHTML(text);
                const processedText = preprocessForCantoneseTTS(cleanText);
                const selectedVoice = customVoice || document.getElementById('voiceSelect')?.value || 'zh-HK-HiuGaaiNeural';

                console.log(`🎤 Server TTS: voice="${selectedVoice}", text="${processedText.substring(0, 50)}..."`);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

                const response = await fetch(`${API_URL}/api/tts/stream`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Priority': 'high' },
                    body: JSON.stringify({ text: processedText, voice: selectedVoice, rate: 160, pitch: 100, skip_browser: false }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.status === 503 && response.headers.get('X-TTS-Fallback') === 'browser') {
                    console.log('🌐 Server suggests using Browser TTS (Edge TTS unavailable)');
                    await playBrowserTTS(processedText, meta, wasListening, wasWakeWordActive);
                } else if (!response.ok) {
                    throw new Error(`TTS failed: ${response.status}`);
                } else {
                    const blob = await response.blob();
                    if (blob.size === 0) throw new Error('Empty audio response from server');
                    await playAudioBlob(blob, meta, wasListening, wasWakeWordActive);
                }
            } catch (error) {
                console.error('❌ 粵語TTS錯誤:', error);
                try {
                    await playBrowserTTS(text, meta, wasListening, wasWakeWordActive); // Fallback to browser TTS on any error
                } catch (fallbackError) {
                    console.error('❌ Browser TTS fallback also failed:', fallbackError);
                }
            } finally {
                // 🛡️ GUARANTEE cleanup and state restoration
                isTTSPlaying = false;
                const indicator = document.getElementById('speakingIndicator');
                if (indicator) indicator.classList.remove('active');
                setFoxState(null);

                // This block ensures listeners are correctly resumed even if TTS promise chain breaks
                if (wasListening && isMassageSessionActive) {
                    console.log("🛡️ Finally block: Resuming continuous listening for massage.");
                    safeRestartMassageListening();
                } else if (meta.isFollowUp) {
                    console.log("🛡️ Finally block: Starting follow-up listening.");
                    startFollowUpListening();
                } else if (wasWakeWordActive && !isMassageSessionActive) {
                    console.log("🛡️ Finally block: Resuming wake word detector.");
                    if (wakeWordDetector && !wakeWordDetector.isListening) {
                        wakeWordDetector.start();
                    }
                }
            }
        }


        // 將 HTML 去掉（TTS 不需要）
        function stripHTML(html) {
            const div = document.createElement('div');
            div.innerHTML = html;
            return div.textContent || div.innerText || '';
        }

        // 5) 粵語數字讀法預處理（32.8°C → 攝氏32點8度、27.1 → 27點1）
        function preprocessForCantoneseTTS(text) {
            if (!text) return text;
            let t = text;

            // 統一成 °C
            t = t.replace(/℃/g, '°C');

            // 攝氏溫度（含小數、整數）
            t = t.replace(/(-?\d+(?:\.\d+)?)\s*°\s*C/gi, (_, num) => {
                const [i, d] = num.split('.');
                return d ? `攝氏${i}點${d}度` : `攝氏${i}度`;
            });

            // 百分比
            t = t.replace(/(\d+)\.(\d+)\s*%/g, (_, a, b) => `${a}點${b}巴仙`);

            // 常見單位（mm, cm, km, m…）
            const unitMap = { 
                mm: '毫米', 公厘: '毫米', 毫米: '毫米', 
                cm: '厘米', 厘米: '厘米', 公分: '厘米', 
                km: '公里', 公里: '公里', 千米: '公里', 
                m: '米', 米: '米' 
            };
            t = t.replace(/(\d+)\.(\d+)\s*(mm|公厘|毫米|cm|厘米|公分|km|公里|千米|m|米)/gi,
                (_, a, b, u) => `${a}點${b}${(unitMap[u.toLowerCase?.()] || unitMap[u] || u)}`);

            // 其他一般小數
            t = t.replace(/(\d+)\.(\d+)/g, (_, a, b) => `${a}點${b}`);

            // 口語化
            t = t.replace(/什麼/g, '咩')
                .replace(/怎麼/g, '點樣')
                .replace(/這個/g, '呢個')
                .replace(/那個/g, '嗰個');

            return t;
        }

        // 停止語音播放
        function stopSpeaking() {
            if ('speechSynthesis' in window) {
                speechSynthesis.cancel();
                setFoxState(null);
            }
        }

        // ===== 天氣功能 =====
        async function loadWeather() {
            console.log('🌤️ Loading weather...');
            const weatherElement = document.querySelector('.mini-weather');
            
            // 立即顯示天氣元素
            if (weatherElement) {
                weatherElement.style.display = 'flex';
                weatherElement.style.opacity = '0';
            }
            
            // 先顯示模擬天氣(立即顯示,不等待 API)
            simulateWeather();
            
            // 顯示天氣動畫
            if (weatherElement) {
                setTimeout(() => {
                    weatherElement.style.opacity = '1';
                    weatherElement.style.animation = 'fadeIn 0.5s ease-out forwards';
                }, 100); // 從 500ms 改為 100ms,更快顯示
            }
            
            // 🔥 關鍵修復:使用非阻塞方式獲取真實天氣
            // 即使 API 失敗也不會阻塞頁面載入
            fetchRealWeatherAsync();
        }

        // 🔥 新增:非阻塞的天氣 API 請求
        async function fetchRealWeatherAsync() {
            try {
                console.log(`🌤️ Fetching weather from ${API_URL}/api/chat`);
                
                // 設置 2 秒超時,避免永久等待
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                
                const response = await fetch(`${API_URL}/api/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'text/event-stream'
                    },
                    body: JSON.stringify({
                        prompt: '今日香港天氣點樣?幾多度?',
                        model: 'gemini-1.5-flash-001',
                        responseLength: 'brief'
                    }),
                    signal: controller.signal // 加入超時控制
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let weatherData = '';

                    // 也為讀取過程設置超時
                    const readTimeout = setTimeout(() => {
                        reader.cancel();
                        console.log('⚠️ Weather data read timeout');
                    }, 3000);

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });
                        const lines = chunk.split('\n');
                        
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6);
                                if (data !== '[DONE]') {
                                    try {
                                        const parsed = JSON.parse(data);
                                        const content = parsed.choices?.[0]?.delta?.content;
                                        if (content) weatherData += content;
                                    } catch (e) {}
                                }
                            }
                        }
                    }

                    clearTimeout(readTimeout);

                    // 如果獲得真實數據,更新顯示
                    if (weatherData) {
                        console.log('✅ Real weather data received:', weatherData.substring(0, 50));
                        parseAndDisplayWeather(weatherData);
                    }
                }
            } catch (error) {
                // 任何錯誤都不影響頁面載入
                console.log('⚠️ Weather API failed, using simulated data:', error.message);
                // 保持模擬天氣數據
            }
        }


        // 新增：統一的圖示選擇器，確保你列出的所有表情都能覆蓋
        function pickWeatherEmoji(temp, textDesc, hour) {
            const night = (hour >= 18 || hour < 6);
            const hasRain = /雨|落雨/.test(textDesc);
            const hasCloud = /多雲|陰/.test(textDesc);
            const hasSun   = /晴|陽光/.test(textDesc);

            if (night) {
                if (hasRain) return { icon: '🌧️', desc: '有雨' };
                if (hasCloud) return { icon: '☁️',  desc: '多雲' };
                // 晴或晴間多雲夜晚 → 🌙
                return { icon: '🌙', desc: '晴朗夜晚' };
            }

            if (hasRain)  return { icon: '🌧️', desc: '有雨' };
            if (hasCloud) return { icon: '☁️',  desc: '多雲' };
            if (hasSun) {
                if (temp > 30) return { icon: '🌞', desc: '炎熱' };
                return { icon: '☀️', desc: '晴朗' };
            }
            // 沒命中 → 默認晴間多雲
            return { icon: '🌤️', desc: '晴間多雲' };
        }

        function parseAndDisplayWeather(weatherText) {
            const iconElement    = document.getElementById('weatherIcon');
            const tempElement    = document.getElementById('weatherTemp');
            const descElement    = document.getElementById('weatherDesc');
            const weatherElement = document.getElementById('miniWeather');

            // --- 更穩健的溫度抽取 ---
            // 1) 優先：而家/現時/當前/目前 + 溫度/氣溫 + 數字
            const m1 = weatherText.match(/(?:現時|當前|目前|而家)\s*(?:氣溫|溫度)[^\d-]*(-?\d+(?:\.\d+)?)/i);
            // 2) 退回：xx.x °C / °
            const m2 = weatherText.match(/(-?\d+(?:\.\d+)?)\s*°\s*C?/i);
            const temp = m1 ? parseFloat(m1[1])
                            : (m2 ? parseFloat(m2[1]) : NaN);

            const hour = new Date().getHours();
            const { icon, desc } = pickWeatherEmoji(isNaN(temp) ? 25 : temp, weatherText, hour);

            iconElement.textContent = icon;
            tempElement.textContent = isNaN(temp) ? '--°' : `${temp.toFixed(1)}°`;
            descElement.textContent = desc;

            if (weatherElement) {
                weatherElement.style.animation = 'none';
                setTimeout(() => {
                    weatherElement.style.animation = 'fadeIn 0.5s ease-out forwards';
                }, 10);
            }
        }

        function simulateWeather() {
            const iconElement = document.getElementById('weatherIcon');
            const tempElement = document.getElementById('weatherTemp');
            const descElement = document.getElementById('weatherDesc');
            
            // Add safety checks
            if (!iconElement || !tempElement || !descElement) {
                console.warn('Weather elements not found, skipping weather update');
                return;
            }
            
            // 根據時間和隨機數據生成天氣
            const hour = new Date().getHours();
            const month = new Date().getMonth() + 1;
            
            // 根據月份調整溫度範圍
            let baseTemp = 25;
            if (month >= 6 && month <= 9) { // 夏季
                baseTemp = 28 + Math.floor(Math.random() * 5); // 28-32度
            } else if (month >= 12 || month <= 2) { // 冬季
                baseTemp = 15 + Math.floor(Math.random() * 5); // 15-19度
            } else { // 春秋
                baseTemp = 22 + Math.floor(Math.random() * 4); // 22-25度
            }
            
            // 隨機天氣類型
            const weatherTypes = [
                { icon: '☀️', desc: '晴朗', weight: 3 },
                { icon: '🌤️', desc: '晴間多雲', weight: 3 },
                { icon: '☁️', desc: '多雲', weight: 2 },
                { icon: '🌧️', desc: '有雨', weight: 1 }
            ];
            
            // 根據權重選擇天氣
            const totalWeight = weatherTypes.reduce((sum, w) => sum + w.weight, 0);
            let random = Math.random() * totalWeight;
            let weather = weatherTypes[0];
            
            for (const w of weatherTypes) {
                random -= w.weight;
                if (random <= 0) {
                    weather = w;
                    break;
                }
            }
            
            // 特殊處理
            if (baseTemp > 30 && weather.icon === '☀️') {
                weather.icon = '🌞';
                weather.desc = '炎熱';
            }
            
            // 夜間調整
            if (hour >= 18 || hour < 6) {
                if (weather.icon === '☀️' || weather.icon === '🌞' || weather.icon === '🌤️') {
                    weather.icon = '🌙';
                    weather.desc = '晴朗夜晚';
                }
            }
            
            // 更新顯示
            iconElement.textContent = weather.icon;
            tempElement.textContent = `${baseTemp}°`;
            descElement.textContent = weather.desc;
        }

        // ===== API 狀態更新功能 =====
        async function updateAPIStatus() {
            try {
                const response = await fetch(`${API_URL}/health`);
                if (response.ok) {
                    const data = await response.json();
                    const apiStatus = data.api_keys_configured;
                    
                    const statusList = document.getElementById('apiStatusList');
                    if (statusList) {
                        statusList.innerHTML = `
                            <div>${apiStatus.gemini ? '✅' : '❌'} Gemini</div>
                            <div>${apiStatus.deepseek ? '✅' : '❌'} DeepSeek</div>
                            <div>${apiStatus.together ? '✅' : '❌'} Together AI</div>
                            <div>${apiStatus.qwen ? '✅' : '❌'} 通義千問</div>
                        `;
                    }
                }
            } catch (error) {
                console.error('Failed to update API status:', error);
            }
        }

        // ===== 知識庫管理功能 =====
        let knowledgeData = [];

        async function loadQAPairs() {
            try {
                const response = await fetch(`${API_URL}/api/knowledge/qa-pairs`);
                const result = await response.json();
                
                if (result.status === 'success') {
                    knowledgeData = result.data;
                    displayQAPairs(result.data);
                    updateCategoryList(result.categories);
                    
                    // 更新統計
                    if (result.stats) {
                        document.getElementById('kbTotal').textContent = result.stats.total || '0';
                        document.getElementById('kbEnabled').textContent = result.stats.enabled || '0';
                        
                        if (result.stats.cache_info) {
                            const hitRate = result.stats.cache_info.hits / 
                                            Math.max(result.stats.cache_info.hits + result.stats.cache_info.misses, 1);
                            document.getElementById('kbHitRate').textContent = 
                                Math.round(hitRate * 100) + '%';
                        }
                    }
                }
            } catch (error) {
                console.error('載入問答對失敗:', error);
            }
        }

        function displayQAPairs(qaPairs) {
            const qaList = document.getElementById('qaList');
            
            if (qaPairs.length === 0) {
                qaList.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">還沒有問答對，快來添加吧！</p>';
                return;
            }
            
            qaList.innerHTML = qaPairs.map(qa => `
                <div class="qa-item ${qa.enabled ? '' : 'disabled'}" data-id="${qa.id}">
                    <div class="qa-category">分類：${qa.category}</div>
                    <div class="qa-questions">
                        問題：${qa.questions.join(' / ')}
                    </div>
                    <div class="qa-answer">答案：${qa.answer}</div>
                    ${qa.hit_count > 0 ? `<div class="qa-hit-count">命中次數：${qa.hit_count}</div>` : ''}
                    <div class="qa-actions">
                        <button class="qa-action-btn qa-toggle-btn" onclick="toggleQA('${qa.id}')" title="${qa.enabled ? '停用' : '啟用'}">
                            ${qa.enabled ? '✓' : '✗'}
                        </button>
                        <button class="qa-action-btn qa-delete-btn" onclick="deleteQA('${qa.id}')" title="刪除">
                            🗑️
                        </button>
                    </div>
                </div>
            `).join('');
        }

        function updateCategoryList(categories) {
            const datalist = document.getElementById('categoryList');
            if (datalist) {
                datalist.innerHTML = categories.map(cat => `<option value="${cat}">`).join('');
            }
        }

        function addQuestionInput() {
            const questionsList = document.getElementById('questionsList');
            const newInput = document.createElement('input');
            newInput.type = 'text';
            newInput.className = 'kb-question';
            newInput.placeholder = '輸入問題';
            questionsList.appendChild(newInput);
        }

        // Replace the existing saveQAPair function
        async function saveQAPair() {
            const category = document.getElementById('kbCategory').value.trim();
            const questionInputs = document.querySelectorAll('.kb-question');
            const questions = Array.from(questionInputs)
                .map(input => input.value.trim())
                .filter(q => q.length > 0);
            const answer = document.getElementById('kbAnswer').value.trim();
            
            if (questions.length === 0 || !answer) {
                alert('請至少輸入一個問題和答案！');
                return;
            }
            
            try {
                const response = await fetch(`${API_URL}/api/knowledge/qa-pairs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        category: category || '未分類',
                        questions,
                        answer
                    })
                });
                
                const result = await response.json();
                
                if (result.status === 'success') {
                    alert('問答對添加成功！');
                    
                    // 清空表單
                    document.getElementById('kbCategory').value = '';
                    document.getElementById('questionsList').innerHTML = '<input type="text" class="kb-question" placeholder="輸入問題">';
                    document.getElementById('kbAnswer').value = '';
                    
                    // 重新載入列表
                    loadQAPairs();
                } else {
                    alert('添加失敗：' + result.detail);
                }
            } catch (error) {
                console.error('保存問答對失敗:', error);
                alert('保存失敗，請稍後再試。');
            }
        }

        // Replace the existing toggleQA function
        async function toggleQA(qaId) {
            try {
                const response = await fetch(`${API_URL}/api/knowledge/qa-pairs/${qaId}/toggle`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    loadQAPairs();
                }
            } catch (error) {
                console.error('切換狀態失敗:', error);
            }
        }

        async function deleteQA(qaId) {
            if (!confirm('確定要刪除這個問答對嗎？')) {
                return;
            }
            
            try {
                const response = await fetch(`${API_URL}/api/knowledge/qa-pairs/${qaId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    loadQAPairs();
                }
            } catch (error) {
                console.error('刪除失敗:', error);
            }
        }

        // ===== 核心功能函數 =====
        function updateDisplayWithSentences(text) {
            const sentences = sentenceDetector.sentences;
            let html = '';

            sentences.forEach((sentence, index) => {
                html += `<span class="sentence" data-index="${index}">${sentence}</span>`;
            });

            if (sentenceDetector.buffer.trim()) {
                html += sentenceDetector.buffer;
            }

            const reconstructed = sentences.join('') + sentenceDetector.buffer;
            if (text.length > reconstructed.length) {
                console.warn('Text mismatch detected, appending missing content');
                html += text.substring(reconstructed.length);
            }

            document.getElementById('responseBox').innerHTML = html + 
                '<div class="speaking-indicator" id="speakingIndicator">' +
                '<span class="animal-dot">🦊</span><span class="animal-dot">🐿️</span><span class="animal-dot">🐰</span>' +
                '<span>正在朗讀</span></div>' +
                '<div class="performance-metrics" id="performanceMetrics">' +
                '<div>首幀延遲: <span id="firstChunkLatency">--</span>ms</div>' +
                '<div>句間間隔: <span id="chunkGap">--</span>ms</div>' +
                '<div>音訊品質: <span id="audioQuality">--</span></div></div>';
            document.getElementById('responseBox').scrollTop = document.getElementById('responseBox').scrollHeight;
        }

        // Initialize connection and setup
        async function initializeConnection() {
            console.log('🚀 Starting connection initialization...');
            
            // First, detect the available port
            await detectAvailablePort();
            
            // Then proceed with normal initialization
            console.log('✅ Port detection complete, starting services...');
            
            // Check connection
            await checkConnection();
            
            // Load other services
            loadWeather();
            updateAPIStatus();
            
            console.log('✅ All services initialized');
        }

        // Update checkConnection to use the detected API_URL
        async function checkConnection() {
            try {
                const response = await fetch(`${API_URL}/health`);
                if (response.ok) {
                    const data = await response.json();
                    document.getElementById('statusDot').classList.add('connected');
                    document.getElementById('statusDot').classList.remove('error');
                    document.getElementById('statusText').textContent = '已連線';
                    isConnected = true;

                    // Update performance metrics
                    if (debugMode && data.performance) {
                        updatePerformanceMetrics(data.performance);
                    }
                    
                    console.log(`✅ 成功連接到 ${API_URL}`);
                } else {
                    throw new Error('Server error');
                }
            } catch (error) {
                document.getElementById('statusDot').classList.remove('connected');
                document.getElementById('statusDot').classList.add('error');
                document.getElementById('statusText').textContent = `未連線 (${actualPort})`;
                isConnected = false;
                console.error(`❌ 無法連接到 ${API_URL}`, error);
            }
        }

        function updatePerformanceMetrics(perf) {
            if (!perf || !perf.performance) return;
            
            const metrics = document.getElementById('performanceMetrics');
            if (!metrics) return;
            
            if (debugMode) {
                metrics.classList.add('show');
                
                if (perf.performance.first_chunk) {
                    document.getElementById('firstChunkLatency').textContent = 
                        perf.performance.first_chunk.avg_ms.toFixed(0);
                }
                
                if (perf.performance.chunk_gaps) {
                    document.getElementById('chunkGap').textContent = 
                        perf.performance.chunk_gaps.avg_ms.toFixed(0);
                }
                
                document.getElementById('audioQuality').textContent = 
                    mediaSourceFallbacks > 0 ? 'Fallback' : 'Optimal';
            } else {
                metrics.classList.remove('show');
            }
        }

        async function testSystem() {
            if (!isConnected) {
                alert('請先確保小狐狸已經連線到伺服器喎！');
                return;
            }

            const testText = '你好！我係小狐狸AI助手。歡迎嚟到知識嘅森林，等我哋一齊探索有趣嘅世界啦！';
            document.getElementById('responseBox').innerHTML = testText;

            audioQueue.stop();
            audioQueue.addToQueue(testText, 0);
        }

        function toggleDebugMode() {
            debugMode = !debugMode;
            const metrics = document.getElementById('performanceMetrics');
            if (metrics) {
                if (debugMode) {
                    metrics.classList.add('show');
                } else {
                    metrics.classList.remove('show');
                }
            }
            console.log(`🔧 Debug mode: ${debugMode ? 'ON' : 'OFF'}`);
        }

        // ===== 護理 AI 系統提示詞 =====
        const NURSE_SYSTEM_PROMPT = `# 角色設定
你是一個專業、溫柔、關懷的智能按摩護理助手。你的名字是「小護」。

# 核心職責
1. 理解用戶的身體不適和按摩需求
2. 識別按摩部位（肩膀、背部、腰部、腿部、頸部、手臂）
3. 判斷合適的力度（輕柔、適中、強力）
4. 推薦按摩動作類型（揉捏、敲打、推拿、指壓、推油）
5. 建議合適的時長（1-10分鐘）
6. 提供安全建議和健康提醒
7. 記錄用戶的偏好和歷史

# 溝通風格
- 使用溫柔、專業、關懷的語氣
- 用繁體中文（香港用語）回應
- 簡潔明瞭，避免冗長
- 適時給予鼓勵和關心
- 詢問用戶感受和舒適度

# 指令識別格式
當用戶提到按摩需求時，請在回應中包含以下結構化資訊：

[指令分類]
部位: [肩膀/背部/腰部/腿部/頸部/手臂]
動作: [揉捏/敲打/推拿/指壓/推油]
力度: [輕柔/適中/強力]
時間: [1-10分鐘]
[/指令分類]

# 示例對話

用戶: "我肩膀好痛"
小護: "我明白您肩膀唔舒服，一定很辛苦。讓我幫您舒緩一下吧。

[指令分類]
部位: 肩膀
動作: 揉捏
力度: 適中
時間: 5分鐘
[/指令分類]

我會用適中力度為您的肩膀進行揉捏按摩，時長5分鐘。這樣可以嗎？如果需要調整力度或時間，隨時告訴我。"

用戶: "輕柔一點"
小護: "好的，我會調整為輕柔力度。請放鬆身體，按摩即將開始。如果有任何不適，請立即告訴我。"

用戶: "幫我按腰"
小護: "收到！為您提供腰部護理。

[指令分類]
部位: 腰部
動作: 指壓
力度: 適中
時間: 5分鐘
[/指令分類]

我會為您的腰部進行指壓按摩，持續5分鐘。腰部是很重要的部位，我會特別小心。準備好了嗎？"

# 安全注意事項
- 如果用戶提到嚴重疼痛，建議就醫
- 提醒用戶單次按摩不宜超過10分鐘
- 連續按摩需要休息間隔
- 特殊人群（孕婦、有心臟病等）需要醫生建議
- 遇到緊急情況立即停止

# 禁止事項
- 不要診斷疾病
- 不要取代專業醫療建議
- 不要處理按摩以外的請求
- 不要提供藥物建議

請始終保持專業、關懷的態度，優先考慮用戶的安全和舒適。`;

        async function sendMessage() {
            if (isMassageSessionActive) {
                console.warn("⚠️ sendMessage blocked during an active massage session to prevent conflicting TTS.");
                const userInput = document.getElementById('userInput');
                if (userInput) userInput.value = ''; // Clear input from any race condition
                return;
            }

            const userInput = document.getElementById('userInput');
            if (!userInput) {
                console.error('❌ sendMessage: userInput element not found');
                return;
            }
            const prompt = userInput.value.trim();
            if (!prompt) {
                return;
            }

            if (!isConnected) {
                alert('護理系統未連接到伺服器，請稍候！');
                return;
            }

            // 停止所有音訊
            if (window.ultraFastTTS) {
                window.ultraFastTTS.stop();
            }
            window.ultraFastTTS = new UltraFastTTSPlayer(); // Add this line back
            audioQueue.stop();
            sentenceDetector.reset();
            lastResponse = '';
            isInCommandBlock = false;

            // 禁用輸入
            document.getElementById('sendButton').disabled = true;
            userInput.disabled = true;
            const stopButtonEl = document.getElementById('stopButton');
            if (stopButtonEl) stopButtonEl.disabled = false;
            document.getElementById('responseBox').innerHTML = '<span class="thinking">小護正在思考...</span>';
            setFoxState('thinking');

            try {
                // ✅ 整合系統提示詞
                const responseLengthSelect = document.getElementById('responseLengthSelect');
                
                // 組合完整提示詞
                let fullPrompt = NURSE_SYSTEM_PROMPT + "\n\n# 當前對話\n\n用戶: " + prompt + "\n小護: ";
                
                // 根據回答長度調整
                if (responseLengthSelect.value === 'brief') {
                    fullPrompt = "請簡短回答（2-3句話）。\n\n" + fullPrompt;
                }

                const response = await fetch(`${API_URL}/api/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'text/event-stream'
                    },
                    body: JSON.stringify({
                        prompt: fullPrompt,
                        model: document.getElementById('modelSelect').value,
                        responseLength: responseLengthSelect.value,
                        temperature: 0.7,  // 稍微提高創造性
                        max_tokens: 500
                    })
                });

                if (!response.ok) {
                    throw new Error(`Server error ${response.status}`);
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let firstChunk = true;
                let displayText = '';
                let fullResponse = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        // If a command was executed, the session will handle its own TTS.
                        // If not, flush the normal chat response to the TTS player.
                        const commandExecuted = await parseAndExecuteCommand(fullResponse, prompt);
                        if (!commandExecuted && document.getElementById('autoSpeak').checked) {
                            window.ultraFastTTS.flush();
                        }
                        
                        // ✅ 解析並執行指令 (This line is now moved up and modified)
                        // await parseAndExecuteCommand(fullResponse, prompt);
                        break;
                    }

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines[lines.length - 1];

                    for (let i = 0; i < lines.length - 1; i++) {
                        const line = lines[i].trim();
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;

                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content;
                                if (content) {
                                    if (firstChunk) {
                                        document.getElementById('responseBox').innerHTML = '';
                                        firstChunk = false;
                                        setFoxState(null);
                                    }

                                    displayText += content;
                                    fullResponse += content;

                                    const cleanChunk = filterCommandBlockChunk(content);
                                    lastResponse += cleanChunk;
                                    const sanitizedDisplay = removeCommandBlocks(displayText);
                                    
                                    // 更新顯示
                                    const responseBox = document.getElementById('responseBox');
                                    responseBox.innerHTML = sanitizedDisplay +
                                        '<div class="speaking-indicator" id="speakingIndicator">' +
                                        '<span class="animal-dot">💙</span><span class="animal-dot">✨</span>' +
                                        '<span>正在朗讀</span></div>';
                                    
                                    // 極速TTS處理
                                    if (document.getElementById('autoSpeak').checked && cleanChunk.trim()) {
                                        window.ultraFastTTS.addText(cleanChunk);
                                    }
                                    
                                    responseBox.scrollTop = responseBox.scrollHeight;
                                }
                            } catch (e) {
                                console.error('Parse error:', e);
                            }
                        }
                    }
                }

                const playButtonEl = document.getElementById('playButton');
                if (playButtonEl) playButtonEl.disabled = false;
                userInput.value = '';

            } catch (error) {
                console.error('Error:', error);
                document.getElementById('responseBox').innerHTML = 
                    `<span class="error-msg">抱歉，護理系統遇到問題: ${error.message}</span>`;
                setFoxState(null);
            } finally {
                document.getElementById('sendButton').disabled = false;
                userInput.disabled = false;
                const stopButtonElFinal = document.getElementById('stopButton');
                if (stopButtonElFinal) stopButtonElFinal.disabled = true;
                userInput.focus();
            }
        }

        async function replayLastResponse() {
            if (!lastResponse) return;

            audioQueue.stop();
            sentenceDetector.reset();

            const sentences = lastResponse.match(/[^。！？]+[。！？]/g) || [lastResponse];
            sentences.forEach((sentence, index) => {
                audioQueue.addToQueue(sentence, index);
            });
        }

        function stopAllAudio() {
            // Stop current TTS audio first
            stopCurrentTTS();

            // Stop audio queue
            audioQueue.stop();

            // Stop ultra fast TTS if available
            if (window.ultraFastTTS) {
                window.ultraFastTTS.stop();
            }
        }

        let currentAnswerLevel = 'primary';

        function showLevelChangeNotification(level) {
            const levelNames = {
                primary: '小學程度',
                secondary: '中學程度',
                university: '大學程度',
                professional: '專業層級'
            };
            
            const levelIcons = {
                primary: '🌱',
                secondary: '🌿',
                university: '🌳',
                professional: '🎓'
            };
            
            // 創建通知元素
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.8);
                padding: 25px 40px;
                background: linear-gradient(135deg, #7FCB8A, #5DBB63);
                border-radius: 20px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                z-index: 3000;
                opacity: 0;
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                text-align: center;
            `;
            
            notification.innerHTML = `
                <div style="font-size: 48px; margin-bottom: 10px;">${levelIcons[level]}</div>
                <div style="color: white; font-size: 20px; font-weight: 700;">
                    已切換到: ${levelNames[level]}
                </div>
            `;
            
            document.body.appendChild(notification);
            
            // 顯示動畫
            setTimeout(() => {
                notification.style.opacity = '1';
                notification.style.transform = 'translate(-50%, -50%) scale(1)';
            }, 10);
            
            // 自動隱藏
            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transform = 'translate(-50%, -50%) scale(0.8)';
                setTimeout(() => notification.remove(), 300);
            }, 2000);
        }

        function getPromptPrefix(level) {
            const prompts = {
                primary: '請用小學生都能明白嘅簡單詞彙,好似講故仔咁解釋:',
                secondary: '請用中學程度嘅語言,清楚詳細咁解釋:',
                university: '請用大學程度嘅語言,包含相關學術概念同理論:',
                professional: '請用專業術語同深入分析,提供專業層級嘅詳細回答:'
            };
            
            return prompts[level] || prompts.primary;
        }

        function openSettings() {
            const overlayEl = document.getElementById('overlay');
            document.getElementById('settingsPanel').classList.add('open');
            overlayEl?.classList.add('show');
        }

        function closeSettingsPanel() {
            const overlayEl = document.getElementById('overlay');
            document.getElementById('settingsPanel').classList.remove('open');
            if (!document.getElementById('knowledgePanel')?.classList.contains('open')) {
                overlayEl?.classList.remove('show');
            }
        }

        function saveSettings() {
            const modelSelect = document.getElementById('modelSelect');
            const voiceSelect = document.getElementById('voiceSelect');
            const responseLengthSelect = document.getElementById('responseLengthSelect');
            const autoSpeakCheckbox = document.getElementById('autoSpeak');
            const asrEngineSelect = document.getElementById('asrEngineSelect');
            const wakeWordToggle = document.getElementById('wakeWordToggle');
            const confidenceSlider = document.getElementById('confidenceTimeoutSlider');
            const silenceSlider = document.getElementById('silenceThresholdSlider');
            const robotWSUrlInput = document.getElementById('robotWSUrl');
            const debugModeCheckbox = document.getElementById('debugMode');

            const settings = {
                // AI 設置
                model: modelSelect?.value || 'together-mixtral',
                voice: voiceSelect?.value || 'zh-HK-HiuGaaiNeural',
                responseLength: responseLengthSelect?.value || 'brief',
                autoSpeak: autoSpeakCheckbox ? autoSpeakCheckbox.checked : true,
                
                // 語音識別設置
                asrEngine: asrEngineSelect?.value || 'browser',
                wakeWord: wakeWordToggle?.checked || false,
                confidenceTimeout: confidenceSlider?.value || 800,
                silenceThreshold: silenceSlider?.value || 1500,
                volumeThreshold: localStorage.getItem('volumeThreshold') || 30,
                
                // 機械臂連接
                robotWSUrl: robotWSUrlInput?.value || 'ws://localhost:8765',
                
                // 調試設置
                debugMode: debugModeCheckbox?.checked || false,
                
                // 版本標記
                version: '2.0-nurse'
            };
            
            localStorage.setItem('foxAISettings', JSON.stringify(settings));
            debugLog('info', '設置已保存', settings);
        }

        function loadSettings() {
            const savedSettings = localStorage.getItem('foxAISettings');
            if (savedSettings) {
                try {
                    const settings = JSON.parse(savedSettings);

                    // 加載 AI 設置
                    const modelSelect = document.getElementById('modelSelect');
                    if (modelSelect && settings.model) modelSelect.value = settings.model;
                    const voiceSelect = document.getElementById('voiceSelect');
                    // Force default to HiuGaai (曉佳姐姐) if not set or invalid
                    if (voiceSelect) {
                        voiceSelect.value = settings.voice || 'zh-HK-HiuGaaiNeural';
                        // Verify the voice exists, otherwise reset to HiuGaai
                        if (!voiceSelect.value) {
                            voiceSelect.value = 'zh-HK-HiuGaaiNeural';
                        }
                    }
                    const responseLengthSelect = document.getElementById('responseLengthSelect');
                    if (responseLengthSelect && settings.responseLength) responseLengthSelect.value = settings.responseLength;
                    const autoSpeakCheckbox = document.getElementById('autoSpeak');
                    if (autoSpeakCheckbox) autoSpeakCheckbox.checked = settings.autoSpeak !== false;
                    
                    // 加載語音識別設置
                    const asrEngineSelect = document.getElementById('asrEngineSelect');
                    if (asrEngineSelect && settings.asrEngine) asrEngineSelect.value = settings.asrEngine;
                    
                    const wakeWordToggle = document.getElementById('wakeWordToggle');
                    if (wakeWordToggle && settings.wakeWord) {
                        wakeWordToggle.checked = true;
                        if (wakeWordDetector) {
                            setTimeout(() => wakeWordDetector.start(), 1000);
                        }
                    }
                    
                    const confidenceSlider = document.getElementById('confidenceTimeoutSlider');
                    const confidenceValue = document.getElementById('confidenceTimeoutValue');
                    if (confidenceSlider && settings.confidenceTimeout) {
                        confidenceSlider.value = settings.confidenceTimeout;
                        if (confidenceValue) confidenceValue.textContent = `${settings.confidenceTimeout} ms`;
                    }
                    
                    const silenceSlider = document.getElementById('silenceThresholdSlider');
                    const silenceValue = document.getElementById('silenceThresholdValue');
                    if (silenceSlider && settings.silenceThreshold) {
                        silenceSlider.value = settings.silenceThreshold;
                        if (silenceValue) silenceValue.textContent = `${settings.silenceThreshold} ms`;
                    }
                    
                    // 加載機械臂設置
                    const robotWSUrl = document.getElementById('robotWSUrl');
                    if (robotWSUrl && settings.robotWSUrl) {
                        robotWSUrl.value = settings.robotWSUrl;
                    }
                    
                    // 加載調試設置
                    const debugModeCheckbox = document.getElementById('debugMode');
                    if (debugModeCheckbox && settings.debugMode) {
                        debugModeCheckbox.checked = true;
                        debugMode = true;
                    }
                    
                    debugLog('info', '設置已加載', settings);
                    
                } catch (e) {
                    console.error('❌ 載入設定錯誤:', e);
                }
            }
            else {
                const modelSelect = document.getElementById('modelSelect');
                if (modelSelect) {
                    modelSelect.value = 'together-mixtral';
                }
                const wakeWordToggle = document.getElementById('wakeWordToggle');
                if (wakeWordToggle) {
                    wakeWordToggle.checked = true;
                    if (wakeWordDetector) {
                        setTimeout(() => wakeWordDetector.start(), 500);
                    }
                }
            }
            
            // 加載統計
            updateStatistics();
        }

        function initAnswerLevelSetting() {
            const answerLevelSelect = document.getElementById('answerLevelSelect');
            if (answerLevelSelect) {
                answerLevelSelect.addEventListener('change', (e) => {
                    currentAnswerLevel = e.target.value;
                    saveSettings();
                    console.log(`🎓 回答層級已更新為: ${currentAnswerLevel}`);
                    showLevelChangeNotification(currentAnswerLevel);
                });
            }
        }

// ===== 按摩控制面板邏輯 =====

// 面板狀態管理
let controlPanelMode = 'quick'; // 'quick' 或 'voice'

// 初始化控制面板
function initMassageControlPanel() {
    // 模式切換按鈕
    const modeButtons = document.querySelectorAll('.mode-btn');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            switchControlMode(mode);
        });
    });
    
    // 快速方案按鈕
    const quickPresetBtn = document.getElementById('quickPresetBtn');
    if (quickPresetBtn) {
        quickPresetBtn.addEventListener('click', showQuickPresets);
    }
    
    // 執行按摩按鈕
    const executeBtn = document.getElementById('executeManualBtn');
    if (executeBtn) {
        executeBtn.addEventListener('click', executeManualMassage);
    }
    
    // 選擇框變化監聽（自動推薦）
    const bodyPartSelect = document.getElementById('bodyPartSelect');
    if (bodyPartSelect) {
        bodyPartSelect.addEventListener('change', handleBodyPartChange);
    }
}

// 切換控制模式
function switchControlMode(mode) {
    controlPanelMode = mode;
    
    // 更新按鈕狀態
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    // 切換面板顯示
    const panel = document.getElementById('massageControlPanel');
    const quickParams = document.querySelector('.quick-params-collapsible');
    const voiceInput = document.getElementById('userInput');
    const voiceButton = document.getElementById('voiceButton');
    
    if (mode === 'voice') {
        if (panel) panel.classList.add('hidden');
        if (quickParams) quickParams.open = false;
        if (voiceInput) voiceInput.focus();
        if (voiceButton) voiceButton.classList.add('pulse');
        addSystemMessage('💬 已切換到語音模式，請直接說出您的需求', 'info');
    } else {
        if (panel) panel.classList.remove('hidden');
        if (quickParams) quickParams.open = true;
        if (voiceButton) voiceButton.classList.remove('pulse');
        addSystemMessage('🎛️ 已切換到快速模式，請使用選擇框設定參數', 'info');
    }
}

// 處理部位變化（智能推薦）
function handleBodyPartChange(e) {
    const bodyPart = e.target.value;
    if (!bodyPart) return;
    
    // 根據部位推薦動作
    const recommendations = {
        '肩膀': { action: '揉捏', intensity: '適中' },
        '背部': { action: '推拿', intensity: '適中' },
        '腰部': { action: '指壓', intensity: '適中' },
        '腿部': { action: '敲打', intensity: '輕柔' },
        '頸部': { action: '推拿', intensity: '輕柔' },
        '手臂': { action: '揉捏', intensity: '輕柔' }
    };
    
    const rec = recommendations[bodyPart];
    if (rec) {
        // 自動填充推薦值
        document.getElementById('actionSelect').value = rec.action;
        document.getElementById('intensitySelect').value = rec.intensity;
        
        // 顯示提示
        addSystemMessage(`💡 根據${bodyPart}的特性，推薦使用「${rec.action}」動作，「${rec.intensity}」力度`, 'info');
    }
}

// 顯示快速方案選擇
function showQuickPresets() {
    const presets = [
        {
            name: '🏢 辦公室肩頸舒緩',
            bodyPart: '肩膀',
            action: '揉捏',
            intensity: '適中',
            duration: 5
        },
        {
            name: '🏃 運動後腿部放鬆',
            bodyPart: '腿部',
            action: '敲打',
            intensity: '輕柔',
            duration: 8
        },
        {
            name: '😴 睡前全身舒壓',
            bodyPart: '背部',
            action: '推拿',
            intensity: '輕柔',
            duration: 10
        },
        {
            name: '💪 深層腰部理療',
            bodyPart: '腰部',
            action: '指壓',
            intensity: '強力',
            duration: 8
        }
    ];
    
    // 創建方案選擇彈窗
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;
    
    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 20px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        ">
            <h3 style="margin-bottom: 20px; color: var(--medical-blue-dark);">
                ⚡ 快速方案選擇
            </h3>
            <div class="preset-list">
                ${presets.map((preset, index) => `
                    <button class="preset-item" data-preset-index="${index}" style="
                        width: 100%;
                        padding: 15px;
                        margin-bottom: 10px;
                        background: linear-gradient(135deg, rgba(74, 144, 226, 0.1), rgba(126, 217, 195, 0.1));
                        border: 2px solid var(--secondary-color);
                        border-radius: 12px;
                        text-align: left;
                        cursor: pointer;
                        transition: var(--transition);
                    ">
                        <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">
                            ${preset.name}
                        </div>
                        <div style="font-size: 13px; color: var(--text-secondary);">
                            ${preset.bodyPart} · ${preset.action} · ${preset.intensity} · ${preset.duration}分鐘
                        </div>
                    </button>
                `).join('')}
            </div>
            <button id="closePresetModal" style="
                width: 100%;
                padding: 12px;
                margin-top: 15px;
                background: var(--bg-secondary);
                border: none;
                border-radius: 12px;
                cursor: pointer;
            ">取消</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 綁定事件
    modal.querySelectorAll('.preset-item').forEach((btn, index) => {
        btn.addEventListener('click', () => {
            applyPreset(presets[index]);
            modal.remove();
        });
        
        // 懸停效果
        btn.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0 4px 12px rgba(74, 144, 226, 0.3)';
        });
        
        btn.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = 'none';
        });
    });
    
    document.getElementById('closePresetModal').addEventListener('click', () => {
        modal.remove();
    });
    
    // 點擊背景關閉
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// 應用快速方案
function applyPreset(preset) {
    document.getElementById('bodyPartSelect').value = preset.bodyPart;
    document.getElementById('actionSelect').value = preset.action;
    document.getElementById('intensitySelect').value = preset.intensity;
    document.getElementById('durationSelect').value = preset.duration;
    
    addSystemMessage(`✅ 已套用「${preset.name}」方案`, 'success');
    soundEffects.playConfirmSound();
}

// 執行手動設定的按摩
async function executeManualMassage() {
    // 獲取選擇的參數
    const bodyPart = document.getElementById('bodyPartSelect').value;
    const action = document.getElementById('actionSelect').value;
    const intensity = document.getElementById('intensitySelect').value;
    const duration = parseInt(document.getElementById('durationSelect').value);
    
    // 驗證參數
    if (!bodyPart || !action || !intensity || !duration) {
        addSystemMessage('⚠️ 請完整選擇所有按摩參數', 'warning');
        soundEffects.playErrorSound();
        return;
    }
    
    // 構建指令對象
    const command = {
        bodyPart,
        action,
        intensity,
        duration,
        rawText: `${bodyPart} ${action} ${intensity} ${duration}分鐘`,
        source: 'manual',
        confidence: 100
    };
    
    debugLog('command', '手動執行按摩指令', command);
    
    // 調用解析執行函數
    const userPrompt = `幫我${action}${bodyPart}，力度${intensity}，時間${duration}分鐘`;
    const aiResponse = `好的，為您安排${bodyPart}的${action}按摩，力度${intensity}，持續${duration}分鐘。\n\n[指令分類]\n部位: ${bodyPart}\n動作: ${action}\n力度: ${intensity}\n時間: ${duration}分鐘\n[/指令分類]`;
    const displayAiResponse = removeCommandBlocks(aiResponse);
    
    // 添加到對話記錄
    const responseBox = document.getElementById('responseBox');
    responseBox.innerHTML += `<div class="user-bubble message-bubble visible">${userPrompt}</div>`;
    responseBox.innerHTML += `<div class="fox-bubble message-bubble visible">${displayAiResponse}</div>`;
    responseBox.scrollTop = responseBox.scrollHeight;
    lastResponse = displayAiResponse;
    isInCommandBlock = false;
    
    // 執行指令
    await parseAndExecuteCommand(aiResponse, userPrompt);
}

// 從語音/文字輸入自動填充選擇框
function autoFillControlsFromText(text) {
    const command = commandParser.parse(text);
    
    if (command.bodyPart) {
        document.getElementById('bodyPartSelect').value = command.bodyPart;
    }
    if (command.action) {
        document.getElementById('actionSelect').value = command.action;
    }
    if (command.intensity) {
        document.getElementById('intensitySelect').value = command.intensity;
    }
    if (command.duration) {
        document.getElementById('durationSelect').value = command.duration;
    }
}

        // ===== 事件綁定 =====
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🚀 DOM載入完成，初始化事件監聽器...');
            
            // 初始化核心組件
            audioQueue = new OptimizedAudioPlayer();
            sentenceDetector = new SmartSentenceDetector();
            initAnswerLevelSetting();

            // ============================================================
            // 初始化 Robust TTS Infrastructure (解耦 TTS 與任務生成)
            // ============================================================
            if (window.TTSInfrastructure) {
                const { RobustTTSService, EventBus, TTSEvents } = window.TTSInfrastructure;

                window.robustTTS = new RobustTTSService({
                    apiUrl: API_URL,
                    defaultVoice: 'zh-HK-HiuGaaiNeural',
                    maxQueueSize: 10,
                    onSpeakingStart: () => {
                        const indicator = document.getElementById('speakingIndicator');
                        if (indicator) indicator.classList.add('active');
                        setFoxState('speaking');
                    },
                    onSpeakingEnd: () => {
                        const indicator = document.getElementById('speakingIndicator');
                        if (indicator) indicator.classList.remove('active');
                        setFoxState(null);

                        // Resume listening if massage session is active
                        if (isMassageSessionActive && !isAutoListening) {
                            safeRestartMassageListening();
                        }
                    },
                    onError: (error) => {
                        console.warn('[RobustTTS] Error handled gracefully:', error.message);
                        // Don't crash - just log and continue
                    }
                });

                // Subscribe TTS to assistant events (decoupled from task state)
                EventBus.on(TTSEvents.ASSISTANT_REPLY, (payload) => {
                    if (document.getElementById('autoSpeak')?.checked) {
                        window.robustTTS.speak(payload.text, {
                            voice: payload.voice,
                            priority: payload.priority || 'normal',
                            skipIfBusy: payload.skipIfBusy
                        });
                    }
                });

                EventBus.on(TTSEvents.ASSISTANT_DIALOGUE, (payload) => {
                    if (document.getElementById('autoSpeak')?.checked) {
                        window.robustTTS.speak(payload.text, {
                            voice: payload.voice,
                            priority: 'high' // Dialogues are high priority
                        });
                    }
                });

                // Log TTS status periodically for diagnostics
                setInterval(() => {
                    if (window.robustTTS && debugMode) {
                        const status = window.robustTTS.getStatus();
                        console.log('[TTS Status]', status.telemetry);
                    }
                }, 60000);

                console.log('✅ Robust TTS Infrastructure initialized (Task-TTS decoupled)');
            } else {
                console.warn('⚠️ TTS Infrastructure not loaded, using legacy TTS');
            }

            // 初始化控制面板
            initMassageControlPanel();
    
            // 默認顯示快速模式
            switchControlMode('quick');
            initAudioUnlock();

            // Event listener for quick response buttons
            const quickResponseButtonsContainer = document.querySelector('.quick-response-buttons');
            if (quickResponseButtonsContainer) {
                quickResponseButtonsContainer.addEventListener('click', (e) => {
                    if (e.target.classList.contains('response-btn')) {
                        const response = e.target.dataset.response;
                        if (currentMassageSession && currentMassageSession.isWaitingForResponse) {
                            currentMassageSession.processVoiceResponse(response);
                        } else {
                            // If no session is active or waiting, treat it as a normal user input
                            const userInput = document.getElementById('userInput');
                            userInput.value = response;
                            sendMessage();
                        }
                    }
                });
            }
            
            // 獲取DOM元素
            const userInput = document.getElementById('userInput');
            const sendButton = document.getElementById('sendButton');
            const playButton = document.getElementById('playButton');
            const stopButton = document.getElementById('stopButton');
            const settingsBtn = document.getElementById('settingsBtn');
            const closeSettings = document.getElementById('closeSettings');
            const overlay = document.getElementById('overlay');
            const drawerInitialized = initializeDrawerSystem();
            if (drawerInitialized) {
                showMobileParamsOnboarding();
            }
            const testSystemBtn = document.getElementById('testSystemBtn');
            const modelSelect = document.getElementById('modelSelect');
            const voiceSelect = document.getElementById('voiceSelect');
            const responseLengthSelect = document.getElementById('responseLengthSelect');
            const asrEngineSelect = document.getElementById('asrEngineSelect');
            const asrInfo = document.getElementById('asrInfo');
            const autoSpeak = document.getElementById('autoSpeak');
            const voiceButton = document.getElementById('voiceButton');
            const wakeWordToggle = document.getElementById('wakeWordToggle');
            const confidenceSlider = document.getElementById('confidenceTimeoutSlider');
            const confidenceValue = document.getElementById('confidenceTimeoutValue');
            const silenceSlider = document.getElementById('silenceThresholdSlider');
            const silenceValue = document.getElementById('silenceThresholdValue');
            const calibrateMicBtn = document.getElementById('calibrateMicBtn');
            const restartWakeWordBtn = document.getElementById('restartWakeWordBtn');

            if (wakeWordToggle) {
                wakeWordDetector = new WakeWordDetector();
                if (wakeWordDetector.init()) {
                    console.log('✅ 喚醒詞功能可用');

                    if (wakeWordToggle.checked) {
                        wakeWordDetector.start();
                        if (restartWakeWordBtn) restartWakeWordBtn.disabled = false;
                    }

                    wakeWordToggle.addEventListener('change', () => {
                        if (wakeWordToggle.checked) {
                            wakeWordDetector.start();
                            if (restartWakeWordBtn) restartWakeWordBtn.disabled = false;
                        } else {
                            wakeWordDetector.stop();
                            if (restartWakeWordBtn) restartWakeWordBtn.disabled = true;
                        }
                        saveSettings();
                    });

                } else {
                    wakeWordToggle.disabled = true;
                    if (restartWakeWordBtn) restartWakeWordBtn.disabled = true;
                    const wakeWordLabel = document.querySelector('label[for="wakeWordToggle"]');
                    if (wakeWordLabel) {
                        wakeWordLabel.classList.add('disabled');
                    }
                }
            }

            // Event listener for the new manual restart button
            if (restartWakeWordBtn) {
                restartWakeWordBtn.addEventListener('click', () => {
                    if (wakeWordDetector) {
                        console.log('🔄 Manual restart triggered');
                        wakeWordDetector.restart();
                    }
                });
            }

            // Event listeners for new STT settings
            if (confidenceSlider) {
                confidenceSlider.addEventListener('input', () => {
                    confidenceValue.textContent = `${confidenceSlider.value} ms`;
                });
                confidenceSlider.addEventListener('change', saveSettings);
            }

            if (silenceSlider) {
                silenceSlider.addEventListener('input', () => {
                    silenceValue.textContent = `${silenceSlider.value} ms`;
                });
                silenceSlider.addEventListener('change', saveSettings);
            }

            if (calibrateMicBtn) {
                calibrateMicBtn.addEventListener('click', calibrateMicrophone);
            }

            // 知識庫管理按鈕
            const manageKnowledgeBtn = document.getElementById('manageKnowledgeBtn');
            if (manageKnowledgeBtn) {
                manageKnowledgeBtn.addEventListener('click', () => {
                    document.getElementById('knowledgePanel').classList.add('open');
                    overlay?.classList.add('show');
                    loadQAPairs();
                });
            }
            
            // 關閉知識庫管理面板
            const closeKnowledge = document.getElementById('closeKnowledge');
            if (closeKnowledge) {
                closeKnowledge.addEventListener('click', () => {
                    document.getElementById('knowledgePanel').classList.remove('open');
                    if (!document.getElementById('settingsPanel').classList.contains('open')) {
                        overlay?.classList.remove('show');
                    }
                });
            }

            userInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    console.log('📤 Enter鍵觸發傳送');
                    sendMessage();
                }
            });

            // 自動調整textarea高度
            const adjustUserInputHeight = () => {
                const maxHeight = 120;
                userInput.style.height = 'auto';
                const newHeight = Math.min(userInput.scrollHeight, maxHeight);
                userInput.style.height = `${newHeight}px`;
                userInput.style.overflowY = userInput.scrollHeight > maxHeight ? 'auto' : 'hidden';
            };

            userInput.addEventListener('input', adjustUserInputHeight);
            adjustUserInputHeight();

            // 按鈕事件
            sendButton.addEventListener('click', () => {
                console.log('📤 傳送按鈕點擊');
                sendMessage();
            });

            if (playButton) {
                playButton.addEventListener('click', () => {
                    console.log('🔊 播放按鈕點擊');
                    replayLastResponse();
                });
            }

            if (stopButton) {
                stopButton.addEventListener('click', async () => {
                    console.log('⏹️ 停止按鈕點擊');
                    stopAllAudio();
                    if (sessionManager) {
                        await sessionManager.stop('user-stop');
                    }
                });
            }

            settingsBtn.addEventListener('click', () => {
                console.log('⚙️ 設定按鈕點擊');
                openSettings();
            });

            if (closeSettings) {
                closeSettings.addEventListener('click', closeSettingsPanel);
            }

            if (overlay) {
                overlay.addEventListener('click', () => {
                    closeSettingsPanel();
                    document.getElementById('knowledgePanel')?.classList.remove('open');
                    overlay.classList.remove('show');
                });
            }

            if (testSystemBtn) {
                testSystemBtn.addEventListener('click', testSystem);
            }

            // ASR Engine change handler
            if (asrEngineSelect) {
                asrEngineSelect.addEventListener('change', async (e) => {
                    currentASREngine = e.target.value;

                    // Stop any ongoing recognition
                    stopRecording();

                    // Update UI
                    if (currentASREngine === 'browser') {
                        asrInfo.textContent = '使用瀏覽器內建語音識別，完全免費㗎！';
                        // Initialize browser recognition
                        initBrowserSpeechRecognition();
                    } else if (currentASREngine === 'xunfei') {
                        asrInfo.textContent = '使用訊飛語音識別，更準確咁聽明你講嘅嘢！';
                        voiceButton.disabled = true;
                        asrInfo.textContent += '（需要伺服器配置）';
                    }
                    saveSettings();
                });
            }

            // Voice button events
            if (voiceButton) {
                // 桌面版:按住錄音
                voiceButton.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    startRecording();
                });

                voiceButton.addEventListener('mouseup', (e) => {
                    e.preventDefault();
                    stopRecording();
                });

                // 移動版:觸控錄音
                voiceButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    startRecording();
                });

                voiceButton.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    stopRecording();
                });

                // 防止意外離開按鈕時錄音繼續
                voiceButton.addEventListener('mouseleave', (e) => {
                    if (isRecording) {
                        stopRecording();
                    }
                });
            }

            // 在這裡添加模型選擇變更事件 👇
            if (modelSelect) {
                modelSelect.addEventListener('change', function() {
                    const selectedModel = this.value;
                    const modelInfo = document.getElementById('currentModelInfo');
                    
                    if (modelInfo) {
                        switch(selectedModel) {
                            case 'gemini-2.5-flash':
                                modelInfo.textContent = '使用 Gemini 2.5 Flash - 最快速的回應';
                                break;
                            case 'gemini-2.0-flash':
                                modelInfo.textContent = '使用 Gemini 2.0 Flash - 穩定版本';
                                break;
                            case 'deepseek-chat':
                                modelInfo.textContent = '使用 DeepSeek Chat - 智慧狐狸';
                                break;
                            case 'together-llama-70b':
                                modelInfo.textContent = '使用 Llama 3.1 70B - 羊駝狐狸';
                                break;
                            case 'together-mixtral':
                                modelInfo.textContent = '使用 Mixtral 8x7B - 混合狐狸';
                                break;
                            case 'together-qwen':
                                modelInfo.textContent = '使用 Qwen 72B (Together)';
                                break;
                            case 'qwen-turbo':
                                modelInfo.textContent = '使用 Qwen Turbo - 飛速狐狸';
                                break;
                            case 'qwen-plus':
                                modelInfo.textContent = '使用 Qwen Plus - 超級狐狸';
                                break;
                            default:
                                modelInfo.textContent = `當前模型：${selectedModel}`;
                        }
                    }
                    
                    // 同時觸發保存設定
                    saveSettings();
                });
            }

            // 設定變更事件
            if (modelSelect) modelSelect.addEventListener('change', saveSettings);
            if (voiceSelect) voiceSelect.addEventListener('change', saveSettings);
            if (responseLengthSelect) responseLengthSelect.addEventListener('change', saveSettings);
            if (autoSpeak) autoSpeak.addEventListener('change', saveSettings);

        // 小狐狸互動
        document.getElementById('nurseAssistant').addEventListener('click', async () => {
            showFoxReaction('happy', 2000);
            spawnParticles('💙', 8);
            
            const greetings = [
                "您好！需要什麼護理服務嗎？",
                "我隨時準備為您服務～",
                "請告訴我您哪裡不舒服？",
                "今天感覺如何？需要放鬆一下嗎？",
                "智能護理助手隨時待命！",
                "讓我幫您舒緩疲勞吧！"
            ];
            const greeting = greetings[Math.floor(Math.random() * greetings.length)];
            
            const autoSpeakCheckbox = document.getElementById('autoSpeak');
            const originalAutoSpeak = autoSpeakCheckbox.checked;
            autoSpeakCheckbox.checked = false;
            
            addFoxMessage(greeting);
            
            autoSpeakCheckbox.checked = originalAutoSpeak;
            
            if (originalAutoSpeak) {
                await playCantoneseTTS(greeting);
            }
        });

            console.log('✅ 所有事件監聽器已綁定');

            // 🎤 FORCE RESET: Ensure voice is HiuGaai BEFORE loading settings
            try {
                const savedSettings = localStorage.getItem('foxAISettings');
                let needsUpdate = false;

                if (savedSettings) {
                    const settings = JSON.parse(savedSettings);

                    // Force reset voice to HiuGaai if it's not set or is a male voice
                    const maleVoices = ['zh-HK-WanLungNeural', 'zh-TW-YunJheNeural'];
                    if (!settings.voice || maleVoices.includes(settings.voice)) {
                        console.log(`🔄 Resetting voice from "${settings.voice}" to "zh-HK-HiuGaaiNeural" (曉佳姐姐)`);
                        settings.voice = 'zh-HK-HiuGaaiNeural';
                        needsUpdate = true;
                    }

                    if (needsUpdate) {
                        localStorage.setItem('foxAISettings', JSON.stringify(settings));
                    }
                } else {
                    // First time - set default voice
                    console.log('🎀 Setting default voice to HiuGaai (曉佳姐姐)');
                    const defaultSettings = {
                        voice: 'zh-HK-HiuGaaiNeural',
                        model: 'together-mixtral',
                        responseLength: 'brief',
                        autoSpeak: true,
                        asrEngine: 'browser',
                        wakeWord: true
                    };
                    localStorage.setItem('foxAISettings', JSON.stringify(defaultSettings));
                }
            } catch (e) {
                console.error('Error resetting voice settings:', e);
            }

            // 載入設定
            loadSettings();
        });

        // ===== 初始化 =====

        window.addEventListener('load', async () => {
            console.log('🌐 頁面載入完成');

            // Hide loading animation first
            setTimeout(() => {
                document.getElementById('loadingOverlay').classList.add('hidden');
                // Play welcome animation
                showFoxReaction('happy', 4000);
                spawnParticles('🌲', 15);
                createFireflies();
            }, 1000);

            // Initialize connection with proper port detection
            await initializeConnection();
            
            // Set up periodic connection checks
            setInterval(checkConnection, 5000);
            setInterval(updateAPIStatus, 30000);

            // Check if running from file:// protocol
            if (window.location.protocol === 'file:') {
                console.warn('建議使用 HTTP 伺服器運行此應用以獲得更好嘅體驗');
                const notice = document.createElement('div');
                notice.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #FFE4B5;
                    color: #8B4513;
                    padding: 10px 20px;
                    border-radius: 20px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    font-size: 14px;
                    z-index: 100;
                `;
                notice.innerHTML = `
                    💡 提示：建議使用以下方式開啟頁面以避免權限問題：<br>
                    <code>python -m http.server 8000</code> 然後訪問 <code>http://localhost:8000</code>
                `;
                document.body.appendChild(notice);
                setTimeout(() => notice.remove(), 10000);
            }

            // Microphone permission will be initialized on first use.

            // Initialize based on selected engine
            if (currentASREngine === 'browser') {
                initBrowserSpeechRecognition();
            }
            
            // Focus input box
            const userInput = document.getElementById('userInput');
            if (userInput) userInput.focus();

            console.log('✅ 初始化完成');
        });


        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
            if (sharedMicStream) {
                sharedMicStream.getTracks().forEach(track => {
                    track.stop();
                });
            }
            isMassageSessionActive = false;
        });

        // 全域 setImmediate polyfill
        if (typeof window.setImmediate === 'undefined') {
            window.setImmediate = function(callback) {
                return setTimeout(callback, 0);
            };
        }

        // 調試功能 - 手動顯示天氣
        window.showWeather = function() {
            const weatherEl = document.getElementById('miniWeather');
            if (weatherEl) {
                // 移除所有可能的隱藏樣式
                weatherEl.style.display = 'flex';
                weatherEl.style.opacity = '1';
                weatherEl.style.visibility = 'visible';
                weatherEl.classList.remove('hidden');
                
                // 設置測試數據
                document.getElementById('weatherIcon').textContent = '☀️';
                document.getElementById('weatherTemp').textContent = '28°';
                document.getElementById('weatherDesc').textContent = '晴朗';
                
                console.log('✅ 天氣已強制顯示');
                console.log('Element styles:', window.getComputedStyle(weatherEl));
            } else {
                console.error('❌ 找不到天氣元素');
            }
        };

        console.log('✅ 智能按摩護理助手極致融合版腳本載入完成');

        // ===== 指令解析與執行 =====
        async function parseAndExecuteCommand(responseText, userPrompt) {
            debugLog('parse', '開始解析用戶指令', { userPrompt, responseText: responseText.substring(0, 100) });
            
            // 1. 嘗試從 AI 回應中提取結構化指令
            const commandMatch = responseText.match(/\[指令分類\]([\s\S]*?)\[\/指令分類\]/);
            
            let command = null;
            
            if (commandMatch) {
                // AI 提供了結構化指令
                const commandBlock = commandMatch[1];
                debugLog('parse', '檢測到 AI 結構化指令', { commandBlock });
                
                command = {
                    bodyPart: extractField(commandBlock, '部位'),
                    action: extractField(commandBlock, '動作'),
                    intensity: extractField(commandBlock, '力度'),
                    duration: parseInt(extractField(commandBlock, '時間')) || 5,
                    rawText: userPrompt,
                    aiResponse: responseText,
                    source: 'ai'
                };
            } else {
                // 使用本地解析器
                debugLog('parse', '使用本地解析器解析指令');
                command = commandParser.parse(userPrompt);
                command.source = 'parser';
                
                // 格式化指令（填充默認值）
                if (commandParser.isValid(command)) {
                    command = commandParser.formatCommand(command);
                }
            }
            
            debugLog('parse', '指令解析完成', command);
            
            // 2. 驗證指令有效性
            if (!isValidCommand(command)) {
                debugLog('parse', '指令無效，跳過執行', { reason: '缺少必要參數' });
                
                if (command.bodyPart && !command.action) {
                    addSystemMessage('💡 提示：請告訴我您想要什麼類型的按摩（揉捏、敲打、推拿、指壓）');
                }
                return false; // Command was not valid/executed
            }
            
            await handleMassageCommand(command, {
                userPrompt,
                responseText
            });
            return true; // Command was valid and handled
        }

        async function handleMassageCommand(command, meta) {
            if (command.emergency) {
                addSystemMessage('⛔ 已收到停止指令，立即停止按摩。', 'warning');
                await sendRobotCommand('stop');
                if (sessionManager) {
                    await sessionManager.stop('emergency', { notifyRobot: false });
                }
                return;
            }

            // 🔧 FIX: Check if already processing consent
            // If consent prompt is already visible, don't show again (prevents infinite loop)
            if (consentPromptVisible) {
                console.log('⚠️ Consent prompt already visible, skipping duplicate');
                return;
            }

            // 🔧 FIX: Always show consent screen for EVERY massage command (safety requirement)
            // Store pending command and show consent prompt
            pendingCommand = { command, meta };
            showConsentPrompt();
            // Note: Execution continues in handleConsentResponse when user confirms
        }

        async function executeMassageCommand(command, meta) {
            // 🔧 FIX: Check if a massage session is already active (use OR for defensive check)
            // If EITHER flag is set, block new tasks to prevent race conditions
            if (currentMassageSession || isMassageSessionActive) {
                debugLog('safety', '已有按摩任務進行中，拒絕新任務', {
                    hasSession: !!currentMassageSession,
                    isActive: isMassageSessionActive
                });

                // Stop any currently playing TTS first to prevent overlap
                stopCurrentTTS();

                soundEffects.playErrorSound();

                const errorMsg = '❌ 已經有按摩任務進行中！\n\n請先停止當前按摩，才可以開始新的任務。\n您可以：\n• 按 🛑 緊急停止按鈕\n• 說「停止」或「緊急停止」';
                addSystemMessage(errorMsg, 'error');

                // Voice announcement to alert user (using HiuGaai voice for error)
                await playCantoneseTTS('已經有按摩任務進行中！請先停止當前按摩，才可以開始新嘅任務。', 'zh-HK-HiuGaaiNeural');

                return; // Prevent creating new session
            }

            debugLog('safety', '開始安全檢查', command);
            const safetyResult = safetyChecker.checkCommand(command);

            if (!safetyResult.safe) {
                debugLog('safety', '安全檢查失敗', safetyResult);
                soundEffects.playErrorSound();

                const errorMsg = '⚠️ 安全檢查未通過：\n' + safetyResult.errors.join('\n');
                addSystemMessage(errorMsg, 'error');
                return;
            }

            if (safetyResult.warnings.length > 0) {
                debugLog('safety', '安全警告', safetyResult.warnings);
                const warningMsg = '⚠️ 提醒：\n' + safetyResult.warnings.join('\n');
                addSystemMessage(warningMsg, 'warning');
            }

            debugLog('safety', '安全檢查通過');

            addConfirmationMessage(command);
            soundEffects.playStartSound();

            safetyChecker.recordOperation(command);
            updateStatistics();

            // 🎤 Start interactive session with auto voice
            currentMassageSession = new InteractiveMassageSession(command);
            await currentMassageSession.start();

            // Enable quick response buttons
            showQuickResponseButtons();
            const liveControls = document.querySelector('.live-controls');
            if(liveControls) liveControls.style.display = 'flex';

            console.log('✅ Interactive massage session started with auto voice listening');

            const started = await sendRobotCommand('start', {
                body_part: command.bodyPart,
                action: command.action,
                intensity: command.intensity,
                duration: command.duration
            });

            if (!started) {
                addSystemMessage('⚠️ 未能連線至機械臂，已啟用模擬模式協助您感受流程。', 'warning');
            }

            // The new session manager handles its own simulation/execution flow.
            // await simulateMassageExecution(command);
        }

        // ===== Text Similarity Calculation (for improved voice recognition) =====
        function levenshteinDistance(s1, s2) {
            const matrix = [];

            // Initialize matrix
            for (let i = 0; i <= s2.length; i++) {
                matrix[i] = [i];
            }
            for (let j = 0; j <= s1.length; j++) {
                matrix[0][j] = j;
            }

            // Fill matrix
            for (let i = 1; i <= s2.length; i++) {
                for (let j = 1; j <= s1.length; j++) {
                    if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(
                            matrix[i - 1][j - 1] + 1, // Substitution
                            matrix[i][j - 1] + 1,     // Insertion
                            matrix[i - 1][j] + 1      // Deletion
                        );
                    }
                }
            }

            return matrix[s2.length][s1.length];
        }

        function calculateSimilarity(str1, str2) {
            if (!str1 || !str2) return 0;

            const s1 = str1.toLowerCase();
            const s2 = str2.toLowerCase();

            // Exact match
            if (s1 === s2) return 1;

            // Contains relationship
            if (s1.includes(s2) || s2.includes(s1)) return 0.8;

            // Calculate edit distance similarity
            const distance = levenshteinDistance(s1, s2);
            const maxLength = Math.max(s1.length, s2.length);
            return 1 - distance / maxLength;
        }

        // 🔧 IMPROVED: Start voice listening for consent confirmation with better sensitivity
        function startConsentVoiceListening() {
            if (consentVoiceListening) return;

            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                console.warn('⚠️ Speech recognition not supported for consent');
                return;
            }

            consentRecognition = new SpeechRecognition();
            consentRecognition.continuous = true;
            consentRecognition.interimResults = true;
            consentRecognition.lang = 'yue-Hant-HK';

            // 🔧 Improvement 1: Get more alternative results
            consentRecognition.maxAlternatives = 3;

            consentRecognition.onresult = (event) => {
                const latestResult = event.results[event.results.length - 1];
                const transcript = latestResult[0].transcript.trim().toLowerCase();
                const confidence = latestResult[0].confidence;

                console.log(`🎤 Consent listening: "${transcript}" (confidence: ${confidence})`);

                // 🔧 Improvement 3: Lower confidence threshold and improve matching logic
                const shouldProcess = latestResult.isFinal ||
                                    (confidence > 0.3 && transcript.length >= 2) || // Lowered from 0.7 to 0.3
                                    transcript.length >= 4; // Process longer text even with low confidence

                if (shouldProcess) {
                    // Expanded confirmation keywords
                    const confirmWords = ['確認', '開始', '好', '係', '同意', '可以', '得', '確定', 'ok', 'yes', 'start', '係呀', '好呀'];
                    const declineWords = ['取消', '唔要', '停', '唔使', '唔好', '不要', 'no', 'cancel', 'stop', '唔需要'];

                    // 🔧 Improvement 4: Partial matching and similarity calculation
                    const isConfirm = confirmWords.some(word =>
                        transcript.includes(word) ||
                        word.includes(transcript) || // Partial matching
                        calculateSimilarity(transcript, word) > 0.6 // Similarity threshold
                    );

                    const isDecline = declineWords.some(word =>
                        transcript.includes(word) ||
                        word.includes(transcript) ||
                        calculateSimilarity(transcript, word) > 0.6
                    );

                    if (isConfirm) {
                        console.log(`✅ Voice consent: CONFIRMED - "${transcript}"`);
                        soundEffects.playConfirmSound();
                        handleConsentResponse(true);
                    } else if (isDecline) {
                        console.log(`❌ Voice consent: DECLINED - "${transcript}"`);
                        soundEffects.playErrorSound();
                        handleConsentResponse(false);
                    } else {
                        console.log(`❓ Unrecognized consent response: "${transcript}"`);
                    }
                }
            };

            consentRecognition.onerror = (event) => {
                // Ignore no-speech errors, only log real errors
                if (event.error !== 'no-speech' && event.error !== 'aborted') {
                    console.error('❌ Consent voice recognition error:', event.error);

                    // 🔧 Improvement 5: Auto-restart on error
                    if (consentVoiceListening) {
                        setTimeout(() => {
                            if (consentPromptVisible) {
                                console.log('🔄 Restarting consent voice recognition after error');
                                stopConsentVoiceListening();
                                startConsentVoiceListening();
                            }
                        }, 1000);
                    }
                }
            };

            consentRecognition.onend = () => {
                console.log('🔚 Consent voice recognition ended');
                // 🔧 Improvement 6: More aggressive restart strategy
                if (consentVoiceListening && consentPromptVisible) {
                    console.log('🔄 Auto-restarting consent voice recognition');
                    setTimeout(() => {
                        try {
                            consentRecognition.start();
                        } catch (error) {
                            console.warn('⚠️ Consent voice restart failed, retrying...', error);
                            setTimeout(() => startConsentVoiceListening(), 500);
                        }
                    }, 300); // Shorter restart delay
                }
            };

            try {
                consentRecognition.start();
                consentVoiceListening = true;
                console.log('🎤 Consent voice listening started with improved settings');
            } catch (error) {
                console.error('❌ Failed to start consent voice recognition:', error);
                // 🔧 Improvement 7: Retry on failure
                setTimeout(() => {
                    if (consentPromptVisible && !consentVoiceListening) {
                        startConsentVoiceListening();
                    }
                }, 1000);
            }
        }

        // 🔧 NEW: Stop consent voice listening
        function stopConsentVoiceListening() {
            if (!consentVoiceListening) return;

            consentVoiceListening = false;
            if (consentRecognition) {
                try {
                    consentRecognition.stop();
                    console.log('🛑 Consent voice listening stopped');
                } catch (e) {
                    console.warn('⚠️ Error stopping consent voice:', e);
                }
            }
        }

        function pauseWakeWordForConsent() {
            wakeWordWasActiveBeforeConsent = false;

            if (wakeWordDetector && wakeWordDetector.isListening) {
                wakeWordWasActiveBeforeConsent = true;
                try {
                    wakeWordDetector.stop();
                    console.log('🎤 Wake word paused while awaiting consent.');
                } catch (error) {
                    console.warn('⚠️ Failed to pause wake word for consent:', error);
                }
            }
        }

        function restoreWakeWordAfterConsent() {
            if (!wakeWordWasActiveBeforeConsent) return;
            wakeWordWasActiveBeforeConsent = false;

            if (!wakeWordDetector) return;
            if (isMassageSessionActive) return; // Active sessions manage wake word state themselves

            if (!wakeWordDetector.isListening) {
                try {
                    wakeWordDetector.start();
                    console.log('🎤 Wake word resumed after consent flow.');
                } catch (error) {
                    console.error('❌ Failed to resume wake word after consent:', error);
                }
            }
        }

        function showConsentPrompt() {
            if (consentPromptVisible) return;
            const responseBox = document.getElementById('responseBox');
            if (!responseBox) return;

            consentPromptVisible = true;
            pauseWakeWordForConsent();

            const prompt = document.createElement('div');
            prompt.id = 'consentPrompt';
            prompt.className = 'command-confirmation';
            prompt.style.cssText = `
                margin-top: 15px;
                padding: 16px;
                border-radius: 14px;
                border: 1px solid var(--tech-border);
                background: linear-gradient(135deg, rgba(127, 203, 138, 0.12), rgba(135, 206, 235, 0.12));
            `;

            prompt.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                    <span style="font-size:22px;">🛡️</span>
                    <div>
                        <div style="font-weight:600;color:var(--medical-blue-dark);">開始前安全確認</div>
                        <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">
                            請確認您目前沒有皮膚破損、近期手術或明顯疼痛。若過程中感到不適，可隨時說「停」或按下停止鍵。
                        </div>
                        <div style="font-size:12px;color:var(--primary-color);margin-top:6px;font-weight:500;">
                            🎤 <strong>語音確認提示：</strong>請清晰說出「確認」或「開始」
                        </div>
                        <div id="consentListeningStatus" style="font-size:11px;color:var(--secondary-color);margin-top:4px;font-weight:500;">
                            🔄 正在啟動語音聆聽...
                        </div>
                    </div>
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button data-action="agree" class="preset-item" style="padding:10px 18px;background:var(--secondary-color);color:white;border:none;border-radius:10px;cursor:pointer;">✅ 我已確認，請開始</button>
                    <button data-action="decline" class="preset-item" style="padding:10px 18px;background:var(--error);color:white;border:none;border-radius:10px;cursor:pointer;">⚠️ 需要再評估</button>
                </div>
            `;

            prompt.querySelector('[data-action="agree"]').addEventListener('click', () => handleConsentResponse(true));
            prompt.querySelector('[data-action="decline"]').addEventListener('click', () => handleConsentResponse(false));

            responseBox.appendChild(prompt);
            responseBox.scrollTop = responseBox.scrollHeight;

            // 🔧 IMPROVED: Helper to update listening status
            const updateListeningStatus = (message, isActive = true) => {
                const statusEl = document.getElementById('consentListeningStatus');
                if (statusEl) {
                    statusEl.textContent = isActive ? `🎤 ${message}` : `⏸️ ${message}`;
                    statusEl.style.color = isActive ? 'var(--secondary-color)' : 'var(--text-secondary)';
                }
            };

            // 🔧 IMPROVED: Start voice listening with health check
            setTimeout(() => {
                startConsentVoiceListening();
                updateListeningStatus('正在聆聽您的確認...');

                // Periodic health check for voice recognition
                const healthCheck = setInterval(() => {
                    if (!consentPromptVisible) {
                        clearInterval(healthCheck);
                        return;
                    }

                    if (!consentVoiceListening) {
                        updateListeningStatus('語音聆聽已停止，正在重啟...', false);
                        startConsentVoiceListening();
                    } else {
                        updateListeningStatus('正在聆聽您的確認...');
                    }
                }, 2000);

                // Store health check ID for cleanup
                prompt.dataset.healthCheckId = healthCheck;
            }, 500); // Small delay to let UI settle
        }

        function resolveAudioUnlock() {
            if (!audioUnlocked) {
                audioUnlocked = true;
                audioUnlockResolvers.forEach(resolve => resolve());
                audioUnlockResolvers = [];
                console.log('🔊 Audio playback unlocked by user gesture');
            }

            audioUnlockListenersAttached = false;

            const banner = document.getElementById('audioUnlockBanner');
            if (banner) banner.remove();

            const overlay = document.getElementById('audioUnlockOverlay');
            if (overlay) overlay.remove();
        }

        async function performAudioUnlock() {
            if (audioUnlocked) {
                resolveAudioUnlock();
                return;
            }

            const contexts = [
                window.ultraFastTTS?.audioContext,
                window.audioContext,
                window.soundEffects?.audioContext
            ].filter(ctx => ctx && typeof ctx.resume === 'function');

            if (contexts.length === 0) {
                const TempAudioContext = window.AudioContext || window.webkitAudioContext;
                if (TempAudioContext) {
                    window.__audioUnlockContext = window.__audioUnlockContext || new TempAudioContext();
                    contexts.push(window.__audioUnlockContext);
                }
            }

            for (const ctx of contexts) {
                try {
                    if (ctx.state === 'suspended') {
                        await ctx.resume();
                    }
                } catch (error) {
                    console.warn('⚠️ Audio resume failed during unlock:', error);
                }

                if (ctx.state === 'suspended') {
                    try {
                        const buffer = ctx.createBuffer(1, 1, 22050);
                        const source = ctx.createBufferSource();
                        source.buffer = buffer;
                        source.connect(ctx.destination);
                        source.start(0);
                        await ctx.resume();
                        console.log('🔊 Played silent audio to unlock context.');
                    } catch (error) {
                        console.warn('⚠️ Silent unlock attempt failed:', error);
                    }
                }
            }

            resolveAudioUnlock();
        }

        function waitForAudioUnlock() {
            if (audioUnlocked) return Promise.resolve();
            initAudioUnlock();
            return new Promise(resolve => audioUnlockResolvers.push(resolve));
        }

        function initAudioUnlock() {
            if (audioUnlocked) return;

            if (!document.getElementById('audioUnlockOverlay') && document.body) {
                const overlay = document.createElement('div');
                overlay.id = 'audioUnlockOverlay';
                overlay.style.cssText = `
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.45);
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                `;
                overlay.innerHTML = `
                    <div style="background:#fff;border-radius:18px;padding:22px 28px;max-width:320px;text-align:center;box-shadow:0 12px 35px rgba(0,0,0,0.25);">
                        <div style="font-size:26px;margin-bottom:12px;">🔊</div>
                        <div style="font-weight:600;font-size:16px;color:var(--medical-blue-dark,#2c3e50);">請點擊啟用語音播放</div>
                        <div style="font-size:13px;color:var(--text-secondary,#556);margin:10px 0 18px;">為遵守瀏覽器的音訊安全政策，需要一次輕觸或按鍵後才能開始播放語音提示。</div>
                        <button id="audioUnlockConfirmBtn" class="preset-item" style="padding:10px 22px;border:none;border-radius:10px;background:var(--secondary-color,#2ecc71);color:#fff;cursor:pointer;font-weight:600;">我明白，啟用語音</button>
                    </div>
                `;
                document.body.appendChild(overlay);

                const button = document.getElementById('audioUnlockConfirmBtn');
                if (button) {
                    button.addEventListener('click', async (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        await performAudioUnlock();
                    });
                }

                overlay.addEventListener('click', async (event) => {
                    if (event.target === overlay) {
                        await performAudioUnlock();
                    }
                });
            }

            if (!audioUnlockListenersAttached) {
                audioUnlockListenersAttached = true;

                const gestureHandler = async () => {
                    document.removeEventListener('pointerdown', gestureHandler, true);
                    document.removeEventListener('keydown', gestureHandler, true);
                    audioUnlockListenersAttached = false;

                    await performAudioUnlock();

                    if (!audioUnlocked) {
                        initAudioUnlock();
                    }
                };

                document.addEventListener('pointerdown', gestureHandler, { once: true, capture: true });
                document.addEventListener('keydown', gestureHandler, { once: true, capture: true });
            }
        }

        function showTapToEnableAudioBanner() {
            if (audioUnlocked) return; // Already unlocked
            if (document.getElementById('audioUnlockBanner')) return; // Don't show if already visible

            initAudioUnlock();

            const banner = document.createElement('div');
            banner.id = 'audioUnlockBanner';
            banner.style.cssText = `
                position: fixed;
                bottom: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: #f39c12;
                color: white;
                padding: 12px 20px;
                border-radius: 25px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                z-index: 10001;
                cursor: pointer;
                font-size: 16px;
                font-weight: 600;
            `;
            banner.textContent = '🔊 請輕觸螢幕一下以啟用語音提示';

            banner.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await performAudioUnlock();
            });

            document.body.appendChild(banner);
        }

        async function ensureAudioReadyForTTS() {
            console.log('🔊 Ensuring audio context is ready...');
            let wasSuspended = false;

            if (!audioUnlocked) {
                console.warn('⚠️ AudioContext requires a user gesture before playback. Waiting for unlock...');
                showTapToEnableAudioBanner();
                await waitForAudioUnlock();
            }

            const contexts = [
                window.ultraFastTTS?.audioContext,
                window.audioContext,
                window.soundEffects?.audioContext
            ].filter(Boolean);

            for (const ctx of contexts) {
                if (ctx.state === 'suspended') {
                    wasSuspended = true;
                    await ctx.resume().catch(e => console.error('Error resuming context:', e));
                }
            }

            // If there was no context or it was suspended, create a silent buffer to play
            // This is a robust way to unlock audio on strict browsers like iOS Safari
            if (wasSuspended || contexts.length === 0) {
                let tempCtx = contexts[0] || new (window.AudioContext || window.webkitAudioContext)();
                if (tempCtx.state === 'suspended') {
                    const buffer = tempCtx.createBuffer(1, 1, 22050);
                    const source = tempCtx.createBufferSource();
                    source.buffer = buffer;
                    source.connect(tempCtx.destination);
                    source.start(0);
                    await tempCtx.resume();
                    console.log('🔊 Played silent audio to unlock context.');
                }
            }

            // Final check: if still suspended, show the banner
            const finalCtx = window.ultraFastTTS?.audioContext || window.audioContext;
            if (finalCtx && finalCtx.state === 'suspended') {
                console.warn('⚠️ AudioContext still suspended after attempts. Showing user prompt.');
                showTapToEnableAudioBanner();
            }
        }

        async function handleConsentResponse(accepted) {
            // 🔧 NEW: Stop voice listening when consent is handled
            stopConsentVoiceListening();
            removeElement('consentPrompt');
            consentPromptVisible = false;

            try {
                if (!accepted) {
                    addSystemMessage('✅ 已取消本次按摩。如有不適，請儘速休息或聯絡專業人員。', 'info');
                    pendingCommand = null;
                    return;
                }

                // 🔊 NEW: Ensure audio is allowed before any TTS
                try {
                    await ensureAudioReadyForTTS();
                } catch (e) {
                    console.warn('Audio resume failed (will fallback to no-sound start):', e);
                }

                consentGranted = true;
                addSystemMessage('✅ 感謝您的確認，我會隨時留意您的狀態。', 'success');

                // 🔧 FIX: Call executeMassageCommand directly instead of handleMassageCommand
                // to avoid showing consent screen again
                if (pendingCommand) {
                    const { command, meta } = pendingCommand;
                    pendingCommand = null;

                    if (!safetyReminderShown) {
                        showSafetyReminder();
                        safetyReminderShown = true;
                    }

                    try {
                        await executeMassageCommand(command, meta);
                    } catch (error) {
                        console.error('❌ Massage execution error:', error);
                        // Ensure flag is cleared on error
                        isMassageSessionActive = false;
                    }
                }
            } finally {
                restoreWakeWordAfterConsent();
            }
        }

        function showSafetyReminder() {
            addSystemMessage('🛟 安全提醒：若感到不適，請立即說「停」、「太痛」或按下⏹️停止鍵，我會馬上為您中止或調整。', 'warning');
        }



        function removeElement(id) {
            const element = document.getElementById(id);
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        }

        function extractField(text, fieldName) {
            const regex = new RegExp(`${fieldName}\s*[:：]\s*([^\n]+)`);
            const match = text.match(regex);
            return match ? match[1].trim() : null;
        }

        function isValidCommand(command) {
            // 緊急停止指令總是有效
            if (command.emergency) return true;
            
            // 檢查必要參數
            return command.bodyPart && 
                   command.action && 
                   command.intensity && 
                   command.duration > 0 &&
                   command.duration <= 10;
        }

        function addSystemMessage(message, type = 'info') {
            const responseBox = document.getElementById('responseBox');
            
            const typeStyles = {
                'info': 'background: rgba(74, 144, 226, 0.1); border-left-color: var(--primary-color);',
                'warning': 'background: rgba(243, 156, 18, 0.1); border-left-color: var(--warning);',
                'error': 'background: rgba(231, 76, 60, 0.1); border-left-color: var(--error);',
                'success': 'background: rgba(82, 200, 159, 0.1); border-left-color: var(--success);'
            };
            
            const typeIcons = {
                'info': 'ℹ️',
                'warning': '⚠️',
                'error': '❌',
                'success': '✅'
            };
            
            const msgDiv = document.createElement('div');
            msgDiv.style.cssText = `
                margin: 15px 0;
                padding: 12px 15px;
                border-left: 4px solid;
                border-radius: 8px;
                font-size: 14px;
                line-height: 1.6;
                ${typeStyles[type]}
            `;
            
            msgDiv.innerHTML = `<strong>${typeIcons[type]}</strong> ${message.replace(/\n/g, '<br>')}`;
            
            responseBox.appendChild(msgDiv);
            responseBox.scrollTop = responseBox.scrollHeight;
        }

        function addConfirmationMessage(command) {
            const responseBox = document.getElementById('responseBox');

            const confirmDiv = document.createElement('div');
            confirmDiv.className = 'command-confirmation';
            confirmDiv.style.cssText = `
                margin-top: 15px;
                padding: 15px;
                background: linear-gradient(135deg, rgba(82, 200, 159, 0.15), rgba(74, 144, 226, 0.15));
                border-left: 4px solid var(--secondary-color);
                border-radius: 12px;
                font-size: 14px;
                position: relative;
                overflow: hidden;
            `;

            // 添加動畫背景
            confirmDiv.innerHTML = `
                <div style="position: absolute; top: 0; right: 0; width: 100px; height: 100px; background: radial-gradient(circle, rgba(126, 217, 195, 0.3), transparent); border-radius: 50%; transform: translate(30%, -30%);"></div>

                <div style="position: relative; z-index: 1;">
                    <div style="font-weight: 600; color: var(--medical-blue-dark); margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 20px;">📋</span>
                            <span>按摩方案已確認</span>
                        </div>
                        <button id="stopTaskBtn" style="
                            padding: 8px 16px;
                            background: #e74c3c;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-weight: 600;
                            font-size: 13px;
                            transition: all 0.2s;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                        " onmouseover="this.style.background='#c0392b'" onmouseout="this.style.background='#e74c3c'">
                            🛑 停止任務
                        </button>
                    </div>

                    <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px 15px; color: var(--text-primary);">
                        <span style="color: var(--text-secondary);">🎯 部位：</span>
                        <span style="font-weight: 600;">${command.bodyPart}</span>

                        <span style="color: var(--text-secondary);">💆 動作：</span>
                        <span style="font-weight: 600;">${command.action}</span>

                        <span style="color: var(--text-secondary);">💪 力度：</span>
                        <span style="font-weight: 600;">${command.intensity}</span>

                        <span style="color: var(--text-secondary);">⏱️ 時長：</span>
                        <span style="font-weight: 600;">${command.duration} 分鐘</span>
                    </div>

                    ${command.source === 'parser' ? `
                        <div style="margin-top: 10px; padding: 8px; background: rgba(255, 255, 255, 0.5); border-radius: 6px; font-size: 12px; color: var(--text-secondary);">
                            <span style="color: var(--primary-color);">💡</span> 提示：部分參數由系統自動推薦
                        </div>
                    ` : ''}
                </div>
            `;

            responseBox.appendChild(confirmDiv);
            responseBox.scrollTop = responseBox.scrollHeight;

            // 添加停止按鈕事件監聽器
            const stopBtn = document.getElementById('stopTaskBtn');
            if (stopBtn) {
                stopBtn.addEventListener('click', async () => {
                    console.log('🛑 Stop task button clicked');
                    if (currentMassageSession) {
                        await currentMassageSession.emergencyStop();
                    } else {
                        console.warn('⚠️ No active massage session to stop');
                    }
                });
            }

            // 添加進入動畫
            setTimeout(() => {
                confirmDiv.style.animation = 'slideInFromRight 0.5s ease-out';
            }, 10);
        }

        function createEmergencyStopButton() {
            if (document.getElementById('emergencyStopBtn')) return;

            const stopButton = document.createElement('button');
            stopButton.id = 'emergencyStopBtn';
            stopButton.innerHTML = '🛑 緊急停止';

            stopButton.style.cssText = `
                position: fixed;
                bottom: 100px;
                left: 50%;
                transform: translateX(40px);
                z-index: 9999;
                padding: 15px 30px;
                font-size: 20px;
                font-weight: bold;
                color: white;
                background-color: #e74c3c;
                border: 2px solid #c0392b;
                border-radius: 25px;
                cursor: pointer;
                box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                transition: all 0.2s ease;
                animation: pulse 2s infinite;
            `;

            stopButton.onmouseover = () => { stopButton.style.backgroundColor = '#c0392b'; };
            stopButton.onmouseout = () => { stopButton.style.backgroundColor = '#e74c3c'; };

            stopButton.addEventListener('click', async () => {
                if (currentMassageSession) {
                    await currentMassageSession.emergencyStop();
                }
            });

            document.body.appendChild(stopButton);

            const styleSheet = document.createElement("style");
            styleSheet.id = 'emergencyBtnStyles';
            styleSheet.innerText = `
                @keyframes pulse {
                    0% { transform: translateX(40px) scale(1); }
                    50% { transform: translateX(40px) scale(1.05); }
                    100% { transform: translateX(40px) scale(1); }
                }
            `;
            document.head.appendChild(styleSheet);
        }

        function removeEmergencyStopButton() {
            const stopButton = document.getElementById('emergencyStopBtn');
            if (stopButton) {
                stopButton.remove();
            }
            const styleSheet = document.getElementById('emergencyBtnStyles');
            if (styleSheet) {
                styleSheet.remove();
            }
        }

        function createPauseResumeButton() {
            if (document.getElementById('pauseResumeBtn')) return;

            const pauseButton = document.createElement('button');
            pauseButton.id = 'pauseResumeBtn';
            pauseButton.innerHTML = '⏸️ 暫停';

            pauseButton.style.cssText = `
                position: fixed;
                bottom: 100px;
                left: 50%;
                transform: translateX(-220px);
                z-index: 9999;
                padding: 15px 30px;
                font-size: 18px;
                font-weight: bold;
                color: white;
                background-color: #f39c12;
                border: 2px solid #e67e22;
                border-radius: 25px;
                cursor: pointer;
                box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                transition: all 0.2s ease;
            `;

            pauseButton.onmouseover = () => { pauseButton.style.backgroundColor = '#e67e22'; };
            pauseButton.onmouseout = () => {
                if (currentMassageSession && currentMassageSession.isPaused) {
                    pauseButton.style.backgroundColor = '#27ae60';
                } else {
                    pauseButton.style.backgroundColor = '#f39c12';
                }
            };

            pauseButton.addEventListener('click', async () => {
                if (currentMassageSession) {
                    if (currentMassageSession.isPaused) {
                        await currentMassageSession.resume();
                    } else {
                        await currentMassageSession.pause();
                    }
                }
            });

            document.body.appendChild(pauseButton);
        }

        function removePauseResumeButton() {
            const pauseButton = document.getElementById('pauseResumeBtn');
            if (pauseButton) {
                pauseButton.remove();
            }
        }

        function updatePauseResumeButton(isPaused) {
            const pauseButton = document.getElementById('pauseResumeBtn');
            if (!pauseButton) return;

            if (isPaused) {
                pauseButton.innerHTML = '▶️ 繼續';
                pauseButton.style.backgroundColor = '#27ae60';
                pauseButton.style.borderColor = '#229954';
            } else {
                pauseButton.innerHTML = '⏸️ 暫停';
                pauseButton.style.backgroundColor = '#f39c12';
                pauseButton.style.borderColor = '#e67e22';
            }
        }

        // ===== 按摩指令解析器 (增強版) =====
        class MassageCommandParser {
            constructor() {
                // 部位關鍵詞（含同義詞）
                this.bodyParts = {
                    '肩膀': ['肩膀', '膊頭', '肩部', '肩胛', '膊', '肩'],
                    '背部': ['背', '背部', '後背', '脊椎', '背脊', '上背', '下背'],
                    '腰部': ['腰', '腰部', '腰椎', '腰骨', '腰間'],
                    '腿部': ['腿', '腿部', '大腿', '小腿', '腳', '足'],
                    '頸部': ['頸', '頸部', '脖子', '頸椎', '頸肩'],
                    '手臂': ['手臂', '手', '前臂', '上臂', '臂', '手肘']
                };
                
                // 動作關鍵詞
                this.actions = {
                    '揉捏': ['揉', '揉捏', '按揉', '捏'],
                    '敲打': ['敲', '敲打', '拍打', '拍'],
                    '推拿': ['推', '推拿', '推按', '推壓'],
                    '指壓': ['壓', '指壓', '按壓', '點壓', '按'],
                    '推油': ['推油', '精油', '油壓', '潤滑']
                };
                
                // 力度關鍵詞
                this.intensity = {
                    '輕柔': ['輕', '輕柔', '輕輕', '溫柔', '軟', '慢'],
                    '適中': ['適中', '正常', '中等', '普通'],
                    '強力': ['強', '大力', '用力', '重', '深層', '深', '硬']
                };
                
                // 症狀關鍵詞（用於推薦）
                this.symptoms = {
                    '痛': { parts: ['肩膀', '腰部', '背部'], action: '指壓', intensity: '適中' },
                    '酸': { parts: ['肩膀', '腰部', '腿部'], action: '揉捏', intensity: '輕柔' },
                    '緊': { parts: ['肩膀', '背部', '頸部'], action: '推拿', intensity: '適中' },
                    '累': { parts: ['腿部', '手臂'], action: '敲打', intensity: '輕柔' },
                    '僵硬': { parts: ['肩膀', '頸部', '背部'], action: '推拿', intensity: '強力' }
                };
                
                // 時間關鍵詞
                this.timePattern = /(\d+)\s*(分鐘|分|min|mins|minute|minutes)/i;
            }
            
            parse(text) {
                const command = {
                    bodyPart: null,
                    action: null,
                    intensity: null,
                    duration: null,
                    symptoms: [],
                    rawText: text,
                    confidence: 0
                };
                
                let confidenceScore = 0;
                
                // 1. 解析部位
                for (const [key, keywords] of Object.entries(this.bodyParts)) {
                    for (const kw of keywords) {
                        if (text.includes(kw)) {
                            command.bodyPart = key;
                            confidenceScore += 25;
                            break;
                        }
                    }
                    if (command.bodyPart) break;
                }
                
                // 2. 解析動作
                for (const [key, keywords] of Object.entries(this.actions)) {
                    for (const kw of keywords) {
                        if (text.includes(kw)) {
                            command.action = key;
                            confidenceScore += 25;
                            break;
                        }
                    }
                    if (command.action) break;
                }
                
                // 3. 解析力度
                for (const [key, keywords] of Object.entries(this.intensity)) {
                    for (const kw of keywords) {
                        if (text.includes(kw)) {
                            command.intensity = key;
                            confidenceScore += 20;
                            break;
                        }
                    }
                    if (command.intensity) break;
                }
                
                // 4. 解析時間
                const timeMatch = text.match(this.timePattern);
                if (timeMatch) {
                    command.duration = parseInt(timeMatch[1]);
                    confidenceScore += 15;
                }
                
                // 5. 解析症狀
                for (const [symptom, recommendation] of Object.entries(this.symptoms)) {
                    if (text.includes(symptom)) {
                        command.symptoms.push(symptom);
                        // 如果沒有明確部位，使用推薦
                        if (!command.bodyPart && recommendation.parts.length > 0) {
                            command.bodyPart = recommendation.parts[0];
                            confidenceScore += 10;
                        }
                        // 如果沒有明確動作，使用推薦
                        if (!command.action) {
                            command.action = recommendation.action;
                            confidenceScore += 10;
                        }
                        // 如果沒有明確力度，使用推薦
                        if (!command.intensity) {
                            command.intensity = recommendation.intensity;
                            confidenceScore += 10;
                        }
                    }
                }
                
                // 6. 檢查緊急停止
                if (text.includes('停止') || text.includes('停') || 
                    text.includes('暫停') || text.includes('唔要') || 
                    text.includes('不要') || text.includes('痛')) {
                    command.emergency = true;
                    confidenceScore = 100;
                }
                
                command.confidence = Math.min(confidenceScore, 100);
                
                return command;
            }
            
            isValid(command) {
                // 緊急停止指令總是有效
                if (command.emergency) return true;
                
                // 至少需要部位，且信心度 >= 40%
                return command.bodyPart !== null && command.confidence >= 40;
            }
            
            formatCommand(command) {
                // 填充缺失的參數
                if (command.bodyPart && !command.action) {
                    command.action = this.getDefaultAction(command.bodyPart);
                }
                if (!command.intensity) {
                    command.intensity = '適中';
                }
                if (!command.duration) {
                    command.duration = 5;  // 默認5分鐘
                }
                
                return command;
            }
            
            getDefaultAction(bodyPart) {
                const defaults = {
                    '肩膀': '揉捏',
                    '背部': '推拿',
                    '腰部': '指壓',
                    '腿部': '敲打',
                    '頸部': '推拿',
                    '手臂': '揉捏'
                };
                return defaults[bodyPart] || '揉捏';
            }
            
            getSuggestions(command) {
                // 根據部位和症狀提供建議
                const suggestions = [];
                
                if (command.symptoms.includes('痛')) {
                    suggestions.push('建議先使用輕柔力度，如果可以接受再逐漸增強');
                }
                
                if (command.bodyPart === '腰部') {
                    suggestions.push('腰部按摩時請保持舒適姿勢，避免過度用力');
                }
                
                if (command.duration > 8) {
                    suggestions.push('單次按摩建議不超過8分鐘，以免造成肌肉疲勞');
                }
                
                return suggestions;
            }
        }

        // 初始化解析器
        const commandParser = new MassageCommandParser();

        // ===== 安全檢查系統 =====
        class SafetyChecker {
            constructor() {
                this.maxForce = 30;  // 最大力度 (N)
                this.maxDuration = 10;  // 最大單次時長 (分鐘)
                this.cooldownTime = 3;  // 冷卻時間 (分鐘)
                this.lastOperationTime = null;
                this.operationHistory = [];
                this.consecutiveOperations = 0;
                this.maxConsecutiveOps = 3;  // 連續操作上限
                this.dailyLimit = 6;  // 每日操作上限
                
                // 載入今日歷史
                this.loadTodayHistory();
            }
            
            loadTodayHistory() {
                const today = new Date().toDateString();
                const stored = localStorage.getItem('massageHistory');
                
                if (stored) {
                    const history = JSON.parse(stored);
                    this.operationHistory = history.filter(op => {
                        const opDate = new Date(op.timestamp).toDateString();
                        return opDate === today;
                    });
                }
            }
            
            checkCommand(command) {
                const errors = [];
                const warnings = [];
                
                // 1. 檢查力度
                const intensityMap = { '輕柔': 10, '適中': 20, '強力': 30 };
                const force = intensityMap[command.intensity] || 20;
                if (force > this.maxForce) {
                    errors.push('力度超過安全限制');
                }
                
                // 2. 檢查時長
                if (command.duration > this.maxDuration) {
                    errors.push(`單次時長不可超過${this.maxDuration}分鐘`);
                } else if (command.duration > 8) {
                    warnings.push('建議單次按摩時間控制在8分鐘以內');
                }
                
                // 3. 檢查冷卻時間 (已禁用 - 允許立即開始新的按摩)
                /*
                if (this.lastOperationTime) {
                    const timeSince = (Date.now() - this.lastOperationTime) / 60000;
                    if (timeSince < this.cooldownTime) {
                        const remaining = Math.ceil(this.cooldownTime - timeSince);
                        errors.push(`請等待${remaining}分鐘後再進行下次按摩`);
                    }
                }
                */
                
                // 4. 檢查連續操作次數 (已禁用 - 允許連續操作)
                /*
                if (this.consecutiveOperations >= this.maxConsecutiveOps) {
                    errors.push('已連續操作3次，請休息15分鐘後再繼續');
                }
                */
                
                // 5. 檢查每日限制 (已禁用)
                /*
                if (this.operationHistory.length >= this.dailyLimit) {
                    errors.push(`今日已達到${this.dailyLimit}次按摩上限，請明天再來`);
                }
                */
                
                // 6. 特殊部位檢查
                if (command.bodyPart === '頸部' && command.intensity === '強力') {
                    errors.push('頸部不建議使用強力按摩，請改用適中或輕柔力度');
                }
                
                // 7. 時長與力度組合檢查
                if (command.duration >= 8 && command.intensity === '強力') {
                    warnings.push('長時間強力按摩可能造成肌肉疲勞，建議調整參數');
                }
                
                return {
                    safe: errors.length === 0,
                    errors: errors,
                    warnings: warnings,
                    canProceed: errors.length === 0
                };
            }
            
            recordOperation(command) {
                const operation = {
                    timestamp: Date.now(),
                    bodyPart: command.bodyPart,
                    action: command.action,
                    intensity: command.intensity,
                    duration: command.duration
                };
                
                this.lastOperationTime = Date.now();
                this.operationHistory.push(operation);
                this.consecutiveOperations++;
                
                // 保存到 localStorage
                localStorage.setItem('massageHistory', JSON.stringify(this.operationHistory));
                
                // 15分鐘後重置連續操作計數
                setTimeout(() => {
                    this.consecutiveOperations = Math.max(0, this.consecutiveOperations - 1);
                }, 15 * 60 * 1000);
            }
            
            getStatistics() {
                const stats = {
                    todayCount: this.operationHistory.length,
                    remainingToday: Math.max(0, this.dailyLimit - this.operationHistory.length),
                    consecutiveOps: this.consecutiveOperations,
                    lastOperation: this.lastOperationTime,
                    favoriteBodyPart: this.getMostFrequentBodyPart()
                };
                
                return stats;
            }
            
            getMostFrequentBodyPart() {
                if (this.operationHistory.length === 0) return '無記錄';
                
                const counts = {};
                this.operationHistory.forEach(op => {
                    counts[op.bodyPart] = (counts[op.bodyPart] || 0) + 1;
                });
                
                return Object.keys(counts).reduce((a, b) => 
                    counts[a] > counts[b] ? a : b
                );
            }
            
            reset() {
                this.consecutiveOperations = 0;
                this.lastOperationTime = null;
            }
        }

        // 初始化安全檢查器
        const safetyChecker = new SafetyChecker();

        // 更新統計顯示
        function updateStatistics() {
            const stats = safetyChecker.getStatistics();
            
            const statToday = document.getElementById('statTodayCount');
            if (statToday) statToday.textContent = stats.todayCount;
            const statTodayPanel = document.getElementById('statTodayCountPanel');
            if (statTodayPanel) statTodayPanel.textContent = stats.todayCount;

            const statRemain = document.getElementById('statRemaining');
            if (statRemain) statRemain.textContent = stats.remainingToday;
            const statRemainPanel = document.getElementById('statRemainingPanel');
            if (statRemainPanel) statRemainPanel.textContent = stats.remainingToday;

            const statFavorite = document.getElementById('statFavoritePart');
            if (statFavorite) statFavorite.textContent = stats.favoriteBodyPart;
            const statFavoritePanel = document.getElementById('statFavoritePartPanel');
            if (statFavoritePanel) statFavoritePanel.textContent = stats.favoriteBodyPart;

            const statConsecutiveElem = document.getElementById('statConsecutive');
            if (statConsecutiveElem) statConsecutiveElem.textContent = stats.consecutiveOps;
            const statConsecutivePanel = document.getElementById('statConsecutivePanel');
            if (statConsecutivePanel) statConsecutivePanel.textContent = stats.consecutiveOps;
        }



        // ===== 語音提示音效 =====
        class SoundEffects {
            constructor() {
                this.audioContext = null;
            }
            
            init() {
                if (!this.audioContext) {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
            }
            
            playBeep(frequency = 440, duration = 200, volume = 0.3) {
                this.init();
                
                const oscillator = this.audioContext.createOscillator();
                const gainNode = this.audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(this.audioContext.destination);
                
                oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
                oscillator.type = 'sine';
                
                gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration / 1000);
                
                oscillator.start(this.audioContext.currentTime);
                oscillator.stop(this.audioContext.currentTime + duration / 1000);
            }
            
            // 按摩開始音效
            playStartSound() {
                this.playBeep(523.25, 100); // C5
                setTimeout(() => this.playBeep(659.25, 100), 120); // E5
                setTimeout(() => this.playBeep(783.99, 150), 240); // G5
            }
            
            // 按摩完成音效
            playCompleteSound() {
                this.playBeep(783.99, 100); // G5
                setTimeout(() => this.playBeep(659.25, 100), 120); // E5
                setTimeout(() => this.playBeep(523.25, 200), 240); // C5
            }
            
            // 錯誤音效
            playErrorSound() {
                this.playBeep(200, 300, 0.2);
            }
            
            // 確認音效
            playConfirmSound() {
                this.playBeep(800, 100);
                setTimeout(() => this.playBeep(1000, 100), 100);
            }
        }

        // 初始化音效系統
        const soundEffects = new SoundEffects();





        function formatDuration(ms) {
            const totalSeconds = Math.max(0, Math.round(ms / 1000));
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            if (minutes === 0) {
                return `${seconds} 秒`;
            }
            return `${minutes} 分 ${seconds.toString().padStart(2, '0')} 秒`;
        }

        // ===== 測試腳本 =====
        const testScenarios = [
            {
                name: '基本肩膀按摩',
                input: '幫我按摩肩膀',
                expected: {
                    bodyPart: '肩膀',
                    hasStructuredResponse: true
                }
            },
            {
                name: '詳細指令',
                input: '幫我輕柔地按摩背部5分鐘',
                expected: {
                    bodyPart: '背部',
                    intensity: '輕柔',
                    duration: 5
                }
            },
            {
                name: '症狀描述',
                input: '我肩膀好痛',
                expected: {
                    bodyPart: '肩膀',
                    hasRecommendation: true
                }
            },
            {
                name: '緊急停止',
                input: '停止',
                expected: {
                    emergency: true
                }
            },
            {
                name: '模糊請求',
                input: '幫我按一下',
                expected: {
                    needsClarification: true
                }
            }
        ];

        async function runTests() {
            console.log('🧪 開始測試護理 AI...\n');
            
            for (const scenario of testScenarios) {
                console.log(`📝 測試: ${scenario.name}`);
                console.log(`   輸入: "${scenario.input}"`);
                
                const command = commandParser.parse(scenario.input);
                console.log('   解析結果:', command);
                
                // 驗證預期結果
                let passed = true;
                if (scenario.expected.bodyPart && command.bodyPart !== scenario.expected.bodyPart) {
                    console.log(`   ❌ 部位不匹配: 期望 ${scenario.expected.bodyPart}, 得到 ${command.bodyPart}`);
                    passed = false;
                }
                if (scenario.expected.emergency && !command.emergency) {
                    console.log(`   ❌ 未識別為緊急停止`);
                    passed = false;
                }
                
                if (passed) {
                    console.log('   ✅ 測試通過\n');
                } else {
                    console.log('   ❌ 測試失敗\n');
                }
            }
            
            console.log('🎉 測試完成');
        }

        // ===== 調試系統 =====
        let debugMode = false;

        function debugLog(category, message, data = null) {
            if (!debugMode) return;
            
            const timestamp = new Date().toLocaleTimeString();
            const style = {
                'parse': 'color: #4A90E2; font-weight: bold;',
                'safety': 'color: #E74C3C; font-weight: bold;',
                'ai': 'color: #52C89F; font-weight: bold;',
                'command': 'color: #F39C12; font-weight: bold;',
                'info': 'color: #5D6D7E;'
            };
            
            console.log(`%c[${timestamp}] [${category.toUpperCase()}]`, style[category] || style.info, message);
            if (data) {
                console.log('  📊 數據:', data);
            }
        }

        // 添加動畫樣式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideInFromRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);

        async function sendRobotCommand(endpoint, payload = {}) {
            // Since the backend API for robot control is not implemented,
            // we will immediately return false to enter simulation mode.
            console.warn(`⚠️ Massage API /massage/${endpoint} is not implemented. Entering simulation mode.`);
            return false;
        }

        // 模擬按摩執行（用於測試，實際部署時替換為真實的機械臂控制）
        async function simulateMassageExecution(command) {
            debugLog('command', '開始模擬按摩執行', command);
            
            // 這裡將來會替換為真實的機械臂通訊代碼
            // await sendToRobot(command);
            
            console.log('🤖 [模擬] 按摩執行中...', {
                bodyPart: command.bodyPart,
                action: command.action,
                intensity: command.intensity,
                duration: command.duration
            });
            
            return new Promise(resolve => {
                setTimeout(resolve, 1000); // 模擬延遲
            });
        }

        // 成就檢查系統
        function checkAndUnlockAchievements(command) {
            const history = safetyChecker.operationHistory;
            
            // 按摩達人：完成 5 次按摩
            if (history.length >= 5) {
                unlockBadge('massageExpert', '⭐', 10);
            }
            
            // 放鬆大師：使用過所有動作類型
            const usedActions = new Set(history.map(op => op.action));
            if (usedActions.size >= 4) {
                unlockBadge('relaxationMaster', '🧘', 10);
            }
            
            // 健康守護者：連續 3 天使用
            const uniqueDays = new Set(
                history.map(op => new Date(op.timestamp).toDateString())
            );
            if (uniqueDays.size >= 3) {
                unlockBadge('wellnessGuardian', '❤️', 10);
            }
            
            // 夜間護理：晚上 8 點後使用
            const hour = new Date().getHours();
            if (hour >= 20 || hour <= 6) {
                unlockBadge('nightCare', '🌙', 10);
            }
        }

        // ===== 手機抽屜與響應式支援 =====
        let paramsDrawer = null;
        let drawerOverlay = null;
        let mobileParamsBtn = null;
        let closeDrawerButton = null;

        function openDrawer() {
            if (!paramsDrawer) return;
            paramsDrawer.classList.add('open');
            if (drawerOverlay) {
                drawerOverlay.classList.add('show');
            }
            document.body.style.overflow = 'hidden';
        }

        function closeDrawerFunc() {
            if (paramsDrawer) {
                paramsDrawer.classList.remove('open');
            }
            if (drawerOverlay) {
                drawerOverlay.classList.remove('show');
            }
            document.body.style.overflow = '';
        }

        function syncParameters() {
            if (!paramsDrawer) return;

            const drawerSelects = paramsDrawer.querySelectorAll('select[data-sync]');
            drawerSelects.forEach(select => {
                const targetId = select.getAttribute('data-sync');
                const targetSelect = document.getElementById(targetId);
                if (!targetSelect) return;

                // 初始化值
                select.value = targetSelect.value;

                select.addEventListener('change', (event) => {
                    targetSelect.value = event.target.value;
                    targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
                });

                targetSelect.addEventListener('change', (event) => {
                    select.value = event.target.value;
                });
            });
        }

        function initializeDrawerSystem() {
            paramsDrawer = document.getElementById('paramsDrawer');
            drawerOverlay = document.getElementById('drawerOverlay');
            mobileParamsBtn = document.getElementById('mobileParamsBtn');
            closeDrawerButton = document.getElementById('closeDrawer');

            if (!paramsDrawer) {
                return false;
            }

            if (mobileParamsBtn) {
                mobileParamsBtn.addEventListener('click', openDrawer);
            }

            if (closeDrawerButton) {
                closeDrawerButton.addEventListener('click', closeDrawerFunc);
            }

            if (drawerOverlay) {
                drawerOverlay.addEventListener('click', closeDrawerFunc);
            }

            syncParameters();

            const drawerQuickPresetBtn = document.getElementById('drawerQuickPresetBtn');
            if (drawerQuickPresetBtn) {
                drawerQuickPresetBtn.addEventListener('click', () => {
                    showQuickPresets();
                    closeDrawerFunc();
                });
            }

            const drawerExecuteBtn = document.getElementById('drawerExecuteBtn');
            if (drawerExecuteBtn) {
                drawerExecuteBtn.addEventListener('click', () => {
                    executeManualMassage();
                    closeDrawerFunc();
                });
            }

            window.addEventListener('resize', checkResponsive);
            checkResponsive();
            return true;
        }

        function checkResponsive() {
            if (!paramsDrawer) return;
            if (window.innerWidth >= 1024) {
                closeDrawerFunc();
            }
        }

        function showMobileParamsOnboarding() {
            const storageKey = 'hasSeenMobileParamsOnboarding';
            try {
                if (localStorage.getItem(storageKey) || window.innerWidth >= 1024) {
                    return;
                }
            } catch (error) {
                console.warn('Onboarding storage unavailable:', error);
                if (window.innerWidth >= 1024) {
                    return;
                }
            }

            setTimeout(() => {
                const tip = document.createElement('div');
                tip.textContent = '👆 點擊「🎛️」可調整按摩設置';
                tip.style.cssText = `
                    position: fixed;
                    bottom: 110px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: var(--primary-color);
                    color: #fff;
                    padding: 12px 20px;
                    border-radius: 20px;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                    z-index: 4000;
                    opacity: 0;
                    transition: opacity 0.4s ease;
                `;

                document.body.appendChild(tip);

                requestAnimationFrame(() => {
                    tip.style.opacity = '1';
                });

                setTimeout(() => {
                    tip.style.opacity = '0';
                    setTimeout(() => tip.remove(), 400);
                }, 3000);

                try {
                    localStorage.setItem(storageKey, 'true');
                } catch (error) {
                    console.warn('Onboarding storage save failed:', error);
                }
            }, 2000);
        }

        document.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
                event.preventDefault();
                if (window.innerWidth < 1024) {
                    openDrawer();
                } else {
                    const details = document.querySelector('.quick-params-collapsible');
                    if (details) {
                        details.open = !details.open;
                    }
                }
            }

            if (event.key === 'Escape') {
                closeDrawerFunc();
                closeSettingsPanel();
                const knowledgePanel = document.getElementById('knowledgePanel');
                if (knowledgePanel?.classList.contains('open')) {
                    knowledgePanel.classList.remove('open');
                    if (!document.getElementById('settingsPanel')?.classList.contains('open')) {
                        document.getElementById('overlay')?.classList.remove('show');
                    }
                }
            }
        });

        // ========= boot =========
        document.addEventListener('DOMContentLoaded', async () => {
            try {
                await detectAvailablePort();
            } catch(e) {
                console.warn('detectAvailablePort 失敗，使用預設 API_URL：', e);
            }
            await loadWeather();
        });

        // ============================================================
        // 🛡️ GLOBAL ERROR BOUNDARY - Prevents UI Crashes
        // Catches unhandled errors and provides recovery options
        // ============================================================
        window.onerror = function(message, source, lineno, colno, error) {
            console.error('[Global Error Handler]', { message, source, lineno, colno, error });

            // Prevent TTS/audio errors from crashing the UI
            if (message && (
                message.includes('TTS') ||
                message.includes('audio') ||
                message.includes('speech') ||
                message.includes('AudioContext')
            )) {
                console.warn('🛡️ Audio/TTS error caught - UI remains stable');
                return true; // Prevent default error handling
            }

            // If massage session is corrupted, reset it
            if (isMassageSessionActive && !currentMassageSession) {
                console.warn('🛡️ Fixing corrupted session state');
                isMassageSessionActive = false;
            }

            return false; // Let other errors propagate normally
        };

        window.addEventListener('unhandledrejection', function(event) {
            console.error('[Unhandled Promise Rejection]', event.reason);

            // Prevent TTS promise rejections from crashing the app
            if (event.reason && (
                String(event.reason).includes('TTS') ||
                String(event.reason).includes('AbortError') ||
                String(event.reason).includes('audio') ||
                String(event.reason).includes('fetch')
            )) {
                console.warn('🛡️ TTS/Network promise rejection caught - UI remains stable');
                event.preventDefault();
            }
        });

        // ============================================================
        // 🔧 TTS STATUS INDICATOR - Shows TTS health in console
        // ============================================================
        window.getTTSStatus = function() {
            if (window.robustTTS) {
                const status = window.robustTTS.getStatus();
                console.log('=== TTS Status Report ===');
                console.log('Speech Lane:', status.speechLane);
                console.log('Providers:', status.providers);
                console.log('Telemetry:', status.telemetry);
                return status;
            } else {
                console.log('RobustTTS not initialized, using legacy TTS');
                return { legacy: true, isTTSPlaying, hasCurrentAudio: !!currentTTSAudio };
            }
        };

        // ============================================================
        // 🔄 RECOVERY FUNCTIONS - Manual recovery options
        // ============================================================
        window.resetTTSSystem = function() {
            console.log('🔄 Resetting TTS system...');

            // Stop all TTS
            stopCurrentTTS();

            // Reset robust TTS if available
            if (window.robustTTS) {
                window.robustTTS.stop(true);
                window.robustTTS.providerManager.resetAllCircuits();
            }

            // Reset flags
            isTTSPlaying = false;
            currentTTSAudio = null;

            console.log('✅ TTS system reset complete');
        };

        window.resetMassageSession = function() {
            console.log('🔄 Resetting massage session...');

            // Emergency stop if session exists
            if (currentMassageSession) {
                try {
                    currentMassageSession.emergencyStop();
                } catch (e) {
                    console.warn('Error during emergency stop:', e);
                }
            }

            // Force reset all state
            isMassageSessionActive = false;
            currentMassageSession = null;
            stopContinuousMassageListening();
            stopCurrentTTS();

            // Clean up UI
            const progressDiv = document.getElementById('massageProgress');
            if (progressDiv) progressDiv.remove();

            removeEmergencyStopButton();
            removePauseResumeButton();
            hideQuickResponseButtons();

            const liveControls = document.querySelector('.live-controls');
            if (liveControls) liveControls.style.display = 'none';

            console.log('✅ Massage session reset complete');
        };

        console.log('🛡️ Global error boundaries installed');
        console.log('💡 Debug commands: getTTSStatus(), resetTTSSystem(), resetMassageSession()');
