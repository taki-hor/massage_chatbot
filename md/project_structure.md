# Project Structure Summary

This project is a FastAPI-based web application for an AI nurse chatbot.

### Core Components:

*   **Backend (`server_qwen.py`, `run.py`):**
    *   The main application logic is in `server_qwen.py`, which runs a FastAPI web server.
    *   It defines API endpoints for chat (`/api/chat`), Text-to-Speech (`/api/tts/stream`), and knowledge base management.
    *   It also serves the static frontend files.
    *   `run.py` is likely the primary entry point for starting the server.

*   **Frontend (`static/`):**
    *   The user interface is built with standard web technologies.
    *   `index.html`: The main HTML page for the chatbot UI.
    *   `app.js`: Handles all client-side logic, such as sending user messages to the backend, playing audio responses, and updating the UI.
    *   `styles.css`: Contains all the styling rules for the application's appearance.

*   **AI & Business Logic:**
    *   `knowledge_base.py`: Manages interactions with a local knowledge base.
    *   `weather_service.py`: A dedicated module to handle and respond to weather-related queries.
    *   `synonyms_config.py`: Likely contains configuration for mapping similar words or phrases to improve intent recognition.

*   **Data Storage:**
    *   `knowledge_base.db`: A SQLite database file that stores the question-and-answer pairs for the knowledge base.

*   **Configuration:**
    *   `.env`: Stores environment variables, including sensitive API keys for various AI models (Gemini, Qwen, etc.).
    *   `requirements.txt`: Lists all the Python dependencies required to run the project.
    *   `Makefile`: Provides convenient shell commands for common tasks like starting the server or running tests.

*   **Testing (`tests/`):**
    *   This directory contains automated tests (`test_*.py`) to verify the functionality of the API, core logic, and other components.

*   **Security (`certs/`):**
    *   The `certs/` directory holds SSL certificate files (`cert.pem`, `key.pem`), enabling the server to run securely over HTTPS.

*   **Documentation & Notes:**
    *   The project includes various markdown (`.md`) and text (`.txt`) files that contain documentation, remarks, and troubleshooting notes.
