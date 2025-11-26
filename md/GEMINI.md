# GEMINI.md - AI Nurse Chatbot

## Project Overview

This project is a sophisticated AI nurse chatbot designed for interactive patient care, featuring a web-based interface and advanced voice capabilities. The backend is built with Python using the FastAPI framework, and the frontend is a single-page application using vanilla JavaScript, HTML, and CSS.

The chatbot is engineered to be highly responsive and performant, with a focus on real-time voice interaction. It integrates multiple large language models (LLMs) and a high-performance text-to-speech (TTS) engine to provide a natural and seamless user experience.

### Core Technologies

*   **Backend:**
    *   **Framework:** FastAPI
    *   **Web Server:** Uvicorn
    *   **Primary Language:** Python
*   **Frontend:**
    *   **Languages:** JavaScript (ES6+), HTML5, CSS3
    *   **APIs:** Web Speech API (for recognition), Web Audio API (for playback)
*   **AI & Voice:**
    *   **LLM Providers:** Qwen, Gemini, Together, DeepSeek (configurable via `.env`)
    *   **Text-to-Speech (TTS):** Microsoft Edge TTS (via `edge-tts`)
    *   **Voice Recognition:** Browser-based continuous listening and wake-word detection.
*   **Data:**
    *   **Knowledge Base:** SQLite (`knowledge_base.db`)

### Architecture

The application follows a client-server architecture:

1.  **FastAPI Backend (`server_qwen.py`):**
    *   Serves the static frontend application (`index.html`, `app.js`, `styles.css`).
    *   Provides a set of RESTful APIs for core functions:
        *   `/api/chat`: Handles chat requests, routing them to the appropriate LLM, knowledge base, or weather service.
        *   `/api/tts/stream`: A highly optimized endpoint for streaming TTS audio with low latency. It features a connection pool and an intelligent caching system.
        *   `/api/knowledge/*`: Endpoints for managing the SQLite knowledge base.
    *   Manages API keys and model configurations from the `.env` file.

2.  **JavaScript Frontend (`static/app.js`):**
    *   Manages the entire user interface and state.
    *   Handles user input (text and voice).
    *   Implements a sophisticated voice interaction system, including:
        *   **Wake-word detection.**
        *   **Continuous listening** during specific tasks (e.g., massage sessions).
        *   An "ultra-fast" TTS player that uses the Web Audio API for seamless, low-latency audio playback.
    *   Communicates with the backend via `fetch` requests to the API endpoints.

## Building and Running

### Dependencies

Python dependencies are listed in `requirements.txt`. Install them using pip:

```bash
pip install -r requirements.txt
```

### Running the Server

The application can be started directly using Uvicorn. The server is configured to run with SSL if certificates are present.

**To run the server:**

```bash
python server_qwen.py
```

The server will start on port 5000 by default (or the port specified in the `.env` file).

*   **Web Interface:** `https://127.0.0.1:5000/`
*   **API Docs:** `https://127.0.0.1:5000/docs`

### Testing

The project includes a `Makefile` with a command for running core API tests.

**To run tests:**

```bash
make test-core
```

This command executes the tests in `tests/test_core_api.py`.

## Development Conventions

*   **Configuration:** All sensitive information (API keys) and environment-specific settings are managed in the `.env` file.
*   **Modularity:** The backend logic is organized into separate modules for clarity (e.g., `knowledge_base.py`, `weather_service.py`).
*   **Performance:** The backend places a strong emphasis on performance, especially for TTS. `server_qwen.py` includes a connection pool, a caching layer, and an asynchronous architecture to handle requests efficiently.
*   **Frontend State Management:** The frontend uses plain JavaScript variables and DOM manipulation to manage state. Key components like the `UltraFastTTSPlayer` and `InteractiveMassageSession` are implemented as classes.
*   **Voice Interaction:** The frontend implements complex logic to manage the state of voice recognition (idle, wake-word, recording, continuous listening) to ensure a smooth user experience.
