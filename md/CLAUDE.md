# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **FastAPI-based AI chatbot** designed for Hong Kong primary school students, featuring:
- Multi-provider LLM support (Qwen, Gemini, Together AI, DeepSeek)
- Cantonese TTS (Text-to-Speech) using Edge TTS
- Knowledge base with semantic matching
- Weather service integration
- Optimized connection pooling and caching for TTS

## Development Commands

### Running the Application
```bash
# Start the server (automatically uses HTTPS if certs exist)
python server_qwen.py

# Server runs on port 5000 by default
# HTTPS: https://127.0.0.1:5000
# HTTP: http://127.0.0.1:5000
```

### Testing
```bash
# Run core API tests
make test-core
# Or: python -m pytest tests/test_core_api.py -v

# Run all tests
python -m pytest tests/ -v

# Run specific test file
python -m pytest tests/test_apis.py -v
```

### LLM Context Generation
```bash
# Generate context for LLM analysis (creates llm_context.md)
make ctx
# Or: python scripts/ctx_pack.py
```

### Code Safety Check
```bash
# Show LLM-modifiable sections
make show-safe
```

## Architecture

### Core Request Flow

**Chat Request Processing Order:**
1. **Weather Intent Detection** (`weather_service.extract_weather_intent()`)
   - Detects weather queries using keywords (天氣, 溫度, 幾度, etc.)
   - Routes to Weather API if matched

2. **Knowledge Base Lookup** (`knowledge_base.find_answer()`)
   - Semantic matching using synonym configuration
   - 40% similarity threshold for matches
   - Uses `synonyms_config.py` for intelligent matching

3. **LLM Routing** (if no KB/weather match)
   - Routes to appropriate provider based on model config
   - Providers: `qwen`, `together`, `deepseek`, `gemini`
   - All responses are streaming (Server-Sent Events)

### TTS Architecture

**Connection Pool System:**
- `TTSConnectionPool`: Manages persistent Edge TTS connections per voice
- Max 3 connections per voice by default (configured in `PERFORMANCE_CONFIG`)
- 8-minute idle timeout with periodic cleanup
- Connection states: IDLE, ACTIVE, DEAD

**Caching System:**
- `IntelligentTTSCache`: LRU cache for synthesized audio
- Max 500 entries, 1-hour TTL
- Cache key: MD5 of `text|voice|rate|pitch`

**Performance Monitoring:**
- Tracks first-chunk latency, chunk gaps, error rates
- Metrics available at `/api/performance` endpoint

### Text Preprocessing Pipeline (Critical for Cantonese TTS)

**Location:** `preprocess_for_cantonese_tts()` in server_qwen.py:1594

**Key Transformations:**
1. **Temperature conversion**: `32.5°C` → `攝氏32點5度`
2. **Decimal numbers**: `3.14` → `3點14`
3. **Percentages**: `50.5%` → `50點5巴仙`
4. **Units with decimals**: `12.5mm` → `12點5毫米`
5. **Colloquialization**: 什麼→咩, 怎麼→點樣, 這個→呢個

**Important:** Always apply this preprocessing before TTS synthesis to ensure proper Cantonese pronunciation.

### Model Configuration

**Model Aliases:** Defined in `MODEL_ALIASES` (server_qwen.py:108)
- Frontend names map to actual API model IDs
- Example: `together-deepseek` → `deepseek-ai/DeepSeek-V3`

**Available Models:** `AVAILABLE_MODELS` dict contains provider info and descriptions

**Response Length Configs:**
- `very_brief`: 50 tokens, 1 sentence
- `brief`: 100 tokens, 2-3 sentences
- `normal`: 200 tokens, 4-5 sentences
- `detailed`: 350 tokens, with examples

## Code Modification Guidelines

### LLM-SAFE vs LLM-SKIP Markers

**DO NOT MODIFY sections marked with:**
- `# ===== LLM-SKIP-START =====` ... `# ===== LLM-SKIP-END =====`
- These include: TTS connection pool, cache system, core AI handlers

**SAFE TO MODIFY:**
- New API endpoints
- Configuration parameters (`PERFORMANCE_CONFIG`, model configs)
- Logging and monitoring additions
- Knowledge base entries
- Synonym configurations

**From `.llm/instructions.md`:**
- Never modify core AI handling functions (`handle_gemini_request`, `handle_together_request`)
- Never modify TTS connection pool and caching system
- Safe to add new endpoints, extensions, logging

### Testing After Changes

Always run core API tests after modifications:
```bash
python -m pytest tests/test_core_api.py -v
```

## Environment Variables

Required API keys in `.env`:
- `GEMINI_API_KEY` - Google Gemini API
- `TOGETHER_API_KEY` - Together AI API
- `QWEN_API_KEY` - Alibaba Qwen API (must start with 'sk-')
- `DEEPSEEK_API_KEY` - DeepSeek API
- `XUNFEI_APP_ID`, `XUNFEI_API_KEY`, `XUNFEI_API_SECRET` - Xunfei Spark API

Optional:
- `PORT` - Server port (default: 5000)
- `HTML_FILE` - HTML filename (default: index.html)

## Key Files & Modules

### Backend Core
- **server_qwen.py** - Main FastAPI application, all endpoints and handlers
- **knowledge_base.py** - SQLite-based Q&A storage with semantic matching
- **weather_service.py** - Weather API integration (Open-Meteo) with caching
- **synonyms_config.py** - Synonym groups for semantic matching

### Frontend
- **static/index.html** - Main UI
- **static/app.js** - Client logic (message handling, TTS playback, port detection)
- **static/styles.css** - All styling

### Data
- **knowledge_base.db** - SQLite database for Q&A pairs
- **certs/** - SSL certificates (cert.pem, key.pem) for HTTPS

### Testing
- **tests/test_core_api.py** - Core API endpoint tests
- **tests/test_apis.py** - Extended API tests
- **tests/microsoft_tts_connection_error/** - TTS troubleshooting tests

## SSL Certificate Configuration

The server automatically uses HTTPS if certificate files exist:
```
certs/cert.pem
certs/key.pem
```

If certificates are missing, the server falls back to HTTP.

## Performance Targets

As defined in server startup logs:
- **First-chunk latency:** <300ms
- **Chunk gaps:** <200ms
- **Error rate:** <1%

Monitor at: `/api/performance`

## API Endpoints Reference

### Core Endpoints
- `GET /` - Main web interface (serves HTML)
- `POST /api/chat` - Chat with AI (streaming response)
- `POST /api/tts/stream` - Text-to-speech synthesis (streaming audio)
- `GET /health` - Health check with API key status and performance metrics

### Knowledge Base
- `GET /api/knowledge/qa-pairs` - List all Q&A pairs
- `POST /api/knowledge/qa-pairs` - Add new Q&A pair
- `PUT /api/knowledge/qa-pairs/{id}` - Update Q&A pair
- `DELETE /api/knowledge/qa-pairs/{id}` - Delete Q&A pair
- `POST /api/knowledge/qa-pairs/{id}/toggle` - Enable/disable Q&A pair

### Monitoring
- `GET /api/performance` - Performance metrics (TTS pool status, cache stats)
- `POST /api/telemetry` - Record client-side telemetry

### Configuration
- `GET /models` - List available AI models
- `GET /voices` - List available TTS voices

## Common Debugging Tips

1. **TTS Connection Issues**: Check `tests/microsoft_tts_connection_error/` for documented solutions
2. **SSL Certificate Errors**: The code includes a temporary SSL verification bypass (lines 40-56 in server_qwen.py)
3. **Port Detection**: Frontend automatically tries ports in order: configured → 5000 → 5001 → 5002
4. **Empty TTS Audio**: Ensure text preprocessing is applied (check logs for `[TTS preprocessed]`)

## Special Considerations

### Cantonese Language Handling
- All prompts use Cantonese (廣東話) system instructions
- Avoid emojis in model responses unless specified
- Use colloquial Cantonese phrases (咩, 點樣, 呢個, 嗰個)

### Weather Service Caching
- 30-minute cache TTL
- Automatic retry with exponential backoff (3 attempts)
- Falls back to expired cache if API unavailable

### Knowledge Base Semantic Matching
- Normalizes questions (removes punctuation, filler words)
- Extracts 2-4 character keywords
- Uses synonym expansion from `synonyms_config.py`
- Jaccard similarity with 40% threshold
