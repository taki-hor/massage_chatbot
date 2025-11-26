# TTS Service Implementation Summary (`server_qwen.py`)

This document provides a detailed summary of the Text-to-Speech (TTS) service implemented within `server_qwen.py`. The service is designed for high performance, low latency, and resilience, incorporating multiple TTS providers, connection pooling, intelligent caching, and a robust fallback mechanism.

## 1. Core Architecture

The TTS service is built around a primary provider (`Edge-TTS`) and a series of fallbacks (`Azure Cognitive Services`, `gTTS`). The architecture is designed to handle requests asynchronously and efficiently, with a strong focus on real-time streaming performance.

The main components are:
- **FastAPI Endpoint**: A single API endpoint (`/api/tts/stream`) serves all TTS requests.
- **TTS Provider Hierarchy**: A clear priority order for synthesis: Edge-TTS -> Azure TTS -> gTTS.
- **Connection Pooling**: Manages and reuses connections to the primary TTS provider to minimize handshake latency.
- **Intelligent Caching**: Caches successfully generated audio to provide near-instantaneous responses for repeated requests.
- **Text Preprocessing**: A multi-stage pipeline that cleans and optimizes text for better Cantonese pronunciation.
- **Performance Monitoring**: Tracks key metrics like latency and error rates.

---

## 2. TTS Providers and Fallback Logic

The system employs a three-tiered fallback strategy to ensure high availability.

### a. Primary: Microsoft Edge TTS (`edge-tts`)
- **Library**: `edge-tts`
- **Role**: The default and primary provider, chosen for its high-quality voices and streaming capabilities.
- **Integration**: Managed via the `TTSConnectionPool` for optimal performance.

### b. Secondary (Fallback 1): Azure Cognitive Services TTS
- **Library**: `azure.cognitiveservices.speech`
- **Role**: The first fallback, used specifically for Cantonese voices if Edge-TTS fails.
- **Trigger**: Activated when an exception occurs during the Edge-TTS synthesis process.
- **Configuration**: Requires `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in the `.env` file.

### c. Tertiary (Fallback 2): Google Translate TTS (`gTTS`)
- **Library**: `gtts`
- **Role**: The final fallback provider if both Edge and Azure TTS fail.
- **Integration**: Synthesizes the full audio into an in-memory buffer (`io.BytesIO`) and then streams it to the client. It's not a true streaming synthesis, but serves as a robust last resort.
- **Language**: Uses Mandarin (`zh-TW`) as the closest available language for Cantonese requests.

---

## 3. Key Features and Implementation

### a. High-Performance API Endpoint: `POST /api/tts/stream`

This is the main entry point for all TTS requests.

- **Request Body**:
  ```json
  {
    "text": "你好，我想測試一下語音合成。",
    "voice": "zh-HK-HiuGaaiNeural",
    "rate": 160,
    "pitch": 100
  }
  ```
- **Response**: A `StreamingResponse` that streams `audio/mpeg` content chunk by chunk, allowing the client to start playback before the full audio is generated.

### b. TTS Connection Pool (`TTSConnectionPool`)

This class significantly reduces latency for the primary `edge-tts` provider.

- **Purpose**: To maintain a pool of ready-to-use, "warmed-up" connections to the Edge-TTS service. This avoids the overhead of establishing a new WebSocket connection for every request.
- **Mechanism**:
    - Manages a dictionary of connection lists, keyed by voice name.
    - Limits the number of connections per voice (`MAX_CONNECTIONS_PER_VOICE`).
    - Connections are `acquired` before use and `released` after.
    - A background task periodically cleans up idle connections that exceed a timeout (`CONNECTION_IDLE_TIMEOUT`).

### c. Intelligent Caching (`IntelligentTTSCache`)

This class implements a smart caching layer to avoid re-synthesizing the same text.

- **Mechanism**:
    - Generates a unique MD5 hash key from the text, voice, rate, and pitch.
    - Stores the resulting audio `bytes` in an in-memory dictionary.
    - **Validation**: Crucially, it refuses to cache empty audio data and validates that cached data is not empty upon retrieval, preventing the spread of faulty responses.
    - **Eviction Policy**: Uses a combination of Time-to-Live (TTL) and a Least Recently Used (LRU) strategy when the cache reaches its maximum size (`CACHE_MAX_SIZE`).

### d. Text Preprocessing Pipeline

Before synthesis, text goes through a multi-stage optimization process, especially for Cantonese.

1.  **HTML Stripping (`strip_html_tags`)**: Removes any HTML tags from the input text.
2.  **General Optimization (`optimize_text_for_cantonese_tts`)**:
    - Replaces common acronyms with pronounceable Cantonese equivalents (e.g., `AI` -> `誒愛`, `OK` -> `okay`).
    - Adds spaces between certain common phrases to improve cadence (e.g., `唔係` -> `唔 係`).
3.  **Cantonese Number/Unit Processing (`preprocess_for_cantonese_tts`)**:
    - This is a key function for natural-sounding Cantonese. It converts decimal numbers and units into the correct spoken format.
    - `32.5°C` -> `攝氏32點5度`
    - `1.2km` -> `1點2公里`
    - `88.5%` -> `88點5巴仙`

---

## 4. Request Workflow

The end-to-end workflow for a TTS request is as follows:

1.  A `POST` request hits the `/api/tts/stream` endpoint.
2.  The **Intelligent Cache** is checked. If a valid, non-empty audio is found, it's streamed back to the client immediately.
3.  If not in cache, the input text is passed through the **Text Preprocessing Pipeline**.
4.  The system attempts to synthesize the processed text using the **Primary (Edge-TTS)** provider:
    a. A connection is acquired from the `TTSConnectionPool`.
    b. The `_synthesize_and_stream` function is called, which initiates the streaming synthesis.
    c. The connection is released back to the pool.
5.  If Edge-TTS fails for any reason (e.g., network error, service issue), the exception is caught.
6.  The system automatically triggers the **Secondary (Azure TTS)** provider via `_synthesize_with_azure`.
7.  If Azure TTS also fails, the exception is caught.
8.  The system makes a final attempt with the **Tertiary (gTTS)** provider via `_synthesize_with_gtts`.
9.  If all three providers fail, a `500 Internal Server Error` is returned to the client.
10. If any provider succeeds, the generated audio data is **stored in the cache** before the response stream is finalized.
