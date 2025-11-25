# ===== LLM-CONTEXT-START: IMPORTS AND CONFIG =====
# @LLM-CONTEXT: 基礎配置和導入 - LLM 需要了解的依賴和配置
from fastapi import FastAPI, Request, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import httpx
import os
import json
from dotenv import load_dotenv
import time
import edge_tts
from gtts import gTTS  # Google TTS as fallback
import asyncio
import io
from pydantic import BaseModel

# Azure Cognitive Services TTS (for Cantonese)
try:
    import azure.cognitiveservices.speech as speechsdk
    AZURE_TTS_AVAILABLE = True
except ImportError:
    AZURE_TTS_AVAILABLE = False
    logger.warning("Azure Speech SDK not installed - Azure TTS unavailable")
import hashlib
import ssl
import hmac
import base64
from datetime import datetime
from urllib.parse import urlencode
from typing import Optional, Dict, List, Any
import logging
import re
from collections import defaultdict
import weakref
from dataclasses import dataclass
import aiofiles
from concurrent.futures import ThreadPoolExecutor
import threading
from contextlib import asynccontextmanager
import uuid
import random
from aiohttp import ClientError

# 新增导入
from knowledge_base import KnowledgeBase
from weather_service import WeatherService

# ===== SSL FIX - TEMPORARY =====
# Note: ssl and os are already imported above
os.environ['PYTHONHTTPSVERIFY'] = '0'

_original_create_default_context = ssl.create_default_context

def _create_unverified_context(*args, **kwargs):
    context = _original_create_default_context(*args, **kwargs)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    return context

ssl.create_default_context = _create_unverified_context
ssl._create_default_https_context = _create_unverified_context
# ===== END SSL FIX =====

# 配置日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 載入環境變量
load_dotenv()

# API Keys
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
TOGETHER_API_KEY = os.getenv('TOGETHER_API_KEY')
QWEN_API_KEY = os.getenv('QWEN_API_KEY')
XUNFEI_APP_ID = os.getenv('XUNFEI_APP_ID')
XUNFEI_API_KEY = os.getenv('XUNFEI_API_KEY')
XUNFEI_API_SECRET = os.getenv('XUNFEI_API_SECRET')
DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY')

# Azure Cognitive Services (for Cantonese TTS)
AZURE_SPEECH_KEY = os.getenv('AZURE_SPEECH_KEY')
AZURE_SPEECH_REGION = os.getenv('AZURE_SPEECH_REGION')

# ===== LLM-CONTEXT-END: IMPORTS AND CONFIG =====

# ===== LLM-CONTEXT-START: API ENDPOINTS =====
# @LLM-CONTEXT: API 端點定義
QWEN_API_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
# ===== LLM-CONTEXT-END: API ENDPOINTS =====

# 調試日誌
logger.debug(f"GEMINI_API_KEY: {'*' * len(GEMINI_API_KEY) if GEMINI_API_KEY else 'Not set'}")
logger.debug(f"TOGETHER_API_KEY: {'*' * len(TOGETHER_API_KEY) if TOGETHER_API_KEY else 'Not set'}")
logger.debug(f"QWEN_API_KEY: {'*' * len(QWEN_API_KEY) if QWEN_API_KEY else 'Not set'}")
logger.debug(f"XUNFEI_APP_ID: {XUNFEI_APP_ID if XUNFEI_APP_ID else 'Not set'}")
logger.debug(f"DEEPSEEK_API_KEY: {'*' * len(DEEPSEEK_API_KEY) if DEEPSEEK_API_KEY else 'Not set'}")

# HTML 文件配置
HTML_FILE = os.getenv('HTML_FILE', 'index.html')
print(f"DEBUG: HTML_FILE = {HTML_FILE}")

# ===== LLM-CONTEXT-START: SYSTEM CONFIG =====
# @LLM-CONTEXT: 系統配置
PERFORMANCE_CONFIG = {
    "MAX_CONNECTIONS_PER_VOICE": 3,
    "CONNECTION_IDLE_TIMEOUT": 480,  # 8分鐘
    "CACHE_MAX_SIZE": 500,
    "CACHE_TTL": 3600,  # 1小時
    "PRELOAD_ENABLED": True,
    "CHUNK_SIZE": 2048,
    "FIRST_CHUNK_SIZE": 512,
    "MONITORING_ENABLED": True
}
# ===== LLM-CONTEXT-END: SYSTEM CONFIG =====


# ===== LLM-CONTEXT-START: MODEL CONFIG =====
# ===== Model Aliases ===== - unchanged
MODEL_ALIASES = {
    # Gemini: Frontend names -> Correct API names
    "gemini-2.5-flash": "gemini-1.5-flash-001",
    "gemini-2.0-flash": "gemini-1.5-flash-001",
    "gemini-1.5-flash": "gemini-1.5-flash-001",
    "gemini-pro": "gemini-1.5-pro-latest",
    "gemini-1.5-pro": "gemini-1.5-pro-latest",

    # TogetherAI: Frontend names -> 完整的模型 ID
    "together-deepseek": "deepseek-ai/DeepSeek-V3",
    "together-deepseek-coder": "deepseek-ai/deepseek-coder-33b-instruct",
    "together-llama-3.1-405b": "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
    "together-llama-3.1-70b": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    "together-llama-70b": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",  # 簡短別名
    "together-mixtral-8x7b": "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "together-mixtral": "mistralai/Mixtral-8x7B-Instruct-v0.1",  # 簡短別名
    "together-qwen-72b": "Qwen/Qwen2.5-72B-Instruct-Turbo",
    "together-qwen": "Qwen/Qwen2.5-72B-Instruct-Turbo",  # 簡短別名
    
}

# Model Configurations - Updated with Qwen models
AVAILABLE_MODELS = {
    "qwen-turbo": {
        "name": "通義千問 Turbo",
        "provider": "qwen",
        "model_id": "qwen-turbo-latest",
        "description": "快速響應，適合一般對話"
    },
    "qwen-plus": {
        "name": "通義千問 Plus",
        "provider": "qwen", 
        "model_id": "qwen-plus-latest",
        "description": "更強大的推理能力"
    },
    # Together AI 模型
    "together-deepseek": {
        "name": "DeepSeek (Together)",
        "provider": "together",
        "model_id": "deepseek-ai/DeepSeek-V3",
        "description": "通過 Together API 使用 DeepSeek"
    },
    "together-llama-70b": {
        "name": "Llama 3.1 70B (Together)",
        "provider": "together",
        "model_id": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
        "description": "Meta Llama 3.1 70B 模型"
    },
    "together-qwen": {
        "name": "Qwen 2.5 72B (Together)",
        "provider": "together",
        "model_id": "Qwen/Qwen2.5-72B-Instruct-Turbo",
        "description": "通義千問 2.5 72B 模型"
    },
    "together-mixtral": {
        "name": "Mixtral 8x7B (Together)",
        "provider": "together",
        "model_id": "mistralai/Mixtral-8x7B-Instruct-v0.1",
        "description": "Mistral AI Mixtral 模型（粵語支援有限）"
    }
}

# Edge TTS Voice Configurations - unchanged
EDGE_TTS_VOICES = {
    "zh-HK-HiuGaaiNeural": {
        "name": "曉佳",
        "gender": "女",
        "description": "香港粵語女聲，聲音清晰自然"
    },
    "zh-HK-WanLungNeural": {
        "name": "雲龍", 
        "gender": "男",
        "description": "香港粵語男聲，聲音沉穩"
    },
    "zh-HK-HiuMaanNeural": {
        "name": "曉曼",
        "gender": "女", 
        "description": "香港粵語女聲，聲音溫柔"
    }
}
# ===== LLM-CONTEXT-END: MODEL CONFIG =====

# ===== LLM-SKIP-START: KNOWLEDGE BASE =====
# @LLM-SKIP: 知識庫管理 - 穩定功能
# ===== 知識庫管理 =====
# 已移除本地 KnowledgeBase 類，請使用 knowledge_base.py 中的版本
# ===== LLM-SKIP-END: KNOWLEDGE BASE =====

# 全局服务实例
knowledge_base = KnowledgeBase()  # SQLite版本
weather_service = WeatherService()  # 天气服务

# ===== TTS連接池管理 ===== - unchanged
@dataclass
class TTSConnection:
    voice: str
    status: str  # IDLE, ACTIVE, DEAD
    last_used: float
    connection_id: str
    communicate: Optional[edge_tts.Communicate] = None
    lock: Optional[asyncio.Lock] = None
    
    def __post_init__(self):
        if not self.lock:
            self.lock = asyncio.Lock()

# ===== LLM-SKIP-START: TTS ENGINE =====
# @LLM-SKIP: TTS 連接池和緩存 - 穩定功能，LLM 不需要看
class TTSConnectionPool:
    def __init__(self):
        self.pools = defaultdict(list)
        self.locks = defaultdict(asyncio.Lock)
        self.max_connections = PERFORMANCE_CONFIG["MAX_CONNECTIONS_PER_VOICE"]
        self.idle_timeout = PERFORMANCE_CONFIG["CONNECTION_IDLE_TIMEOUT"]
        self.cleanup_task = None
        self._initialized = False
    
    async def _ensure_initialized(self):
        """確保連接池已初始化"""
        if not self._initialized:
            await self._start_cleanup_task()
            self._initialized = True
    
    async def _start_cleanup_task(self):
        """啟動連接清理任務"""
        if self.cleanup_task is None:
            try:
                loop = asyncio.get_running_loop()
                self.cleanup_task = loop.create_task(self._periodic_cleanup())
            except RuntimeError:
                logger.warning("No running event loop, cleanup task will be started later")
    
    async def _periodic_cleanup(self):
        """定期清理閒置連接"""
        while True:
            try:
                await asyncio.sleep(60)  # 每分鐘清理一次
                await self._cleanup_all_idle_connections()
            except Exception as e:
                logger.error(f"Cleanup task error: {e}")
    
    async def acquire(self, voice: str) -> TTSConnection:
        """獲取TTS連接"""
        await self._ensure_initialized()
        
        async with self.locks[voice]:
            await self._clean_idle_connections(voice)
            
            for conn in self.pools[voice]:
                if conn.status == 'IDLE' and await self._probe_connection(conn):
                    conn.status = 'ACTIVE'
                    conn.last_used = time.time()
                    logger.debug(f"Reusing connection {conn.connection_id} for {voice}")
                    return conn
            
            if len(self.pools[voice]) < self.max_connections:
                new_conn = await self._create_connection(voice)
                self.pools[voice].append(new_conn)
                logger.info(f"Created new connection {new_conn.connection_id} for {voice}")
                return new_conn
            
            return await self._wait_for_connection(voice)
    
    async def release(self, connection: TTSConnection):
        """釋放連接"""
        async with self.locks[connection.voice]:
            if connection.status == 'ACTIVE':
                connection.status = 'IDLE'
                connection.last_used = time.time()
                logger.debug(f"Released connection {connection.connection_id}")
    
    async def _create_connection(self, voice: str) -> TTSConnection:
        """創建新的TTS連接"""
        connection_id = f"{voice}_{int(time.time() * 1000)}"
        conn = TTSConnection(
            voice=voice,
            status='ACTIVE',
            last_used=time.time(),
            connection_id=connection_id
        )
        
        await self._warmup_connection(conn)
        return conn
    
    async def _warmup_connection(self, conn: TTSConnection):
        """預熱連接"""
        try:
            test_communicate = edge_tts.Communicate("測試", conn.voice)
            conn.communicate = test_communicate
            logger.debug(f"Warmed up connection {conn.connection_id}")
        except Exception as e:
            logger.error(f"Failed to warmup connection {conn.connection_id}: {e}")
            conn.status = 'DEAD'
    
    async def _probe_connection(self, conn: TTSConnection) -> bool:
        """探測連接健康狀態"""
        try:
            if conn.status == 'DEAD':
                return False
            
            if time.time() - conn.last_used > self.idle_timeout:
                conn.status = 'DEAD'
                return False
            
            return True
        except Exception as e:
            logger.warning(f"Connection probe failed for {conn.connection_id}: {e}")
            conn.status = 'DEAD'
            return False
    
    async def _clean_idle_connections(self, voice: str):
        """清理閒置連接"""
        now = time.time()
        active_connections = []
        
        for conn in self.pools[voice]:
            if (conn.status == 'ACTIVE' or 
                (conn.status == 'IDLE' and now - conn.last_used < self.idle_timeout)):
                active_connections.append(conn)
            else:
                logger.info(f"Removing idle connection {conn.connection_id}")
        
        self.pools[voice] = active_connections
    
    async def _cleanup_all_idle_connections(self):
        """清理所有語音的閒置連接"""
        for voice in list(self.pools.keys()):
            async with self.locks[voice]:
                await self._clean_idle_connections(voice)
    
    async def _wait_for_connection(self, voice: str, timeout: int = 30) -> TTSConnection:
        """等待連接可用"""
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            for conn in self.pools[voice]:
                if conn.status == 'IDLE' and await self._probe_connection(conn):
                    conn.status = 'ACTIVE'
                    conn.last_used = time.time()
                    return conn
            
            await asyncio.sleep(0.1)
        
        raise TimeoutError(f"No available connections for voice {voice}")

# ===== 智能緩存系統 ===== - unchanged
class IntelligentTTSCache:
    def __init__(self):
        self.cache = {}
        self.access_counts = defaultdict(int)
        self.last_access = {}
        self.cache_sizes = {}
        self.max_size = PERFORMANCE_CONFIG["CACHE_MAX_SIZE"]
        self.ttl = PERFORMANCE_CONFIG["CACHE_TTL"]
        self.lock = asyncio.Lock()
    
    def _generate_cache_key(self, text: str, voice: str, rate: int, pitch: int) -> str:
        """生成緩存鍵"""
        content = f"{text}|{voice}|{rate}|{pitch}"
        return hashlib.md5(content.encode()).hexdigest()
    
    async def get(self, text: str, voice: str, rate: int, pitch: int) -> Optional[bytes]:
        """獲取緩存"""
        cache_key = self._generate_cache_key(text, voice, rate, pitch)

        async with self.lock:
            if cache_key in self.cache:
                if time.time() - self.last_access[cache_key] > self.ttl:
                    await self._remove(cache_key)
                    return None

                # ✅ Validate cached audio is not empty
                cached_data = self.cache[cache_key]
                if not cached_data or len(cached_data) == 0:
                    logger.warning(f"Found empty cached audio, removing: {cache_key[:8]}")
                    await self._remove(cache_key)
                    return None

                self.access_counts[cache_key] += 1
                self.last_access[cache_key] = time.time()

                logger.debug(f"Cache hit: {cache_key[:8]}...")
                return cached_data

        return None
    
    async def put(self, text: str, voice: str, rate: int, pitch: int, audio_data: bytes):
        """存入緩存"""
        # ✅ Validate audio data is not empty before caching
        if not audio_data or len(audio_data) == 0:
            logger.warning(f"Refusing to cache empty audio for text: {text[:50]}")
            return

        cache_key = self._generate_cache_key(text, voice, rate, pitch)

        async with self.lock:
            if len(self.cache) >= self.max_size:
                await self._evict_lru()

            self.cache[cache_key] = audio_data
            self.cache_sizes[cache_key] = len(audio_data)
            self.access_counts[cache_key] = 1
            self.last_access[cache_key] = time.time()

            logger.debug(f"Cache put: {cache_key[:8]}... ({len(audio_data)} bytes)")
    
    async def _evict_lru(self):
        """淘汰最少使用的緩存項"""
        if not self.cache:
            return
        
        lru_key = min(self.last_access.keys(), key=lambda k: self.last_access[k])
        await self._remove(lru_key)
        logger.debug(f"Evicted LRU cache: {lru_key[:8]}...")
    
    async def _remove(self, cache_key: str):
        """移除緩存項"""
        self.cache.pop(cache_key, None)
        self.access_counts.pop(cache_key, None)
        self.last_access.pop(cache_key, None)
        self.cache_sizes.pop(cache_key, None)
    
    def get_stats(self) -> dict:
        """獲取緩存統計"""
        total_size = sum(self.cache_sizes.values())
        return {
            "entries": len(self.cache),
            "total_size_mb": round(total_size / 1024 / 1024, 2),
            "hit_rate": sum(self.access_counts.values()) / max(len(self.cache), 1)
        }

# ===== 性能監控系統 ===== - unchanged
class PerformanceMonitor:
    def __init__(self):
        self.metrics = {
            "first_chunk_latencies": [],
            "chunk_gaps": [],
            "error_counts": defaultdict(int),
            "request_counts": defaultdict(int),
            "cache_stats": {}
        }
        self.start_time = time.time()
    
    def record_first_chunk_latency(self, latency_ms: float):
        """記錄首幀延遲"""
        self.metrics["first_chunk_latencies"].append(latency_ms)
        
        if len(self.metrics["first_chunk_latencies"]) > 1000:
            self.metrics["first_chunk_latencies"] = self.metrics["first_chunk_latencies"][-1000:]
    
    def record_chunk_gap(self, gap_ms: float):
        """記錄句間間隔"""
        self.metrics["chunk_gaps"].append(gap_ms)
        
        if len(self.metrics["chunk_gaps"]) > 1000:
            self.metrics["chunk_gaps"] = self.metrics["chunk_gaps"][-1000:]
    
    def record_error(self, error_type: str):
        """記錄錯誤"""
        self.metrics["error_counts"][error_type] += 1
    
    def record_request(self, request_type: str):
        """記錄請求"""
        self.metrics["request_counts"][request_type] += 1
    
    def get_stats(self) -> dict:
        """獲取統計信息"""
        first_chunk_latencies = self.metrics["first_chunk_latencies"]
        chunk_gaps = self.metrics["chunk_gaps"]
        
        stats = {
            "uptime_seconds": int(time.time() - self.start_time),
            "total_requests": sum(self.metrics["request_counts"].values()),
            "total_errors": sum(self.metrics["error_counts"].values()),
            "error_rate": 0,
            "performance": {}
        }
        
        if stats["total_requests"] > 0:
            stats["error_rate"] = stats["total_errors"] / stats["total_requests"]
        
        if first_chunk_latencies:
            stats["performance"]["first_chunk"] = {
                "avg_ms": round(sum(first_chunk_latencies) / len(first_chunk_latencies), 2),
                "p95_ms": round(sorted(first_chunk_latencies)[int(len(first_chunk_latencies) * 0.95)], 2),
                "p99_ms": round(sorted(first_chunk_latencies)[int(len(first_chunk_latencies) * 0.99)], 2)
            }
        
        if chunk_gaps:
            stats["performance"]["chunk_gaps"] = {
                "avg_ms": round(sum(chunk_gaps) / len(chunk_gaps), 2),
                "p95_ms": round(sorted(chunk_gaps)[int(len(chunk_gaps) * 0.95)], 2)
            }
        
        return stats
# ===== LLM-SKIP-END: TTS ENGINE =====



# ===== 文本預處理優化 ===== - unchanged
def optimize_text_for_cantonese_tts(text: str) -> str:
    """優化文本以改善粵語發音和減少延遲"""
    
    emoji_pattern = re.compile("["
        "\U0001F600-\U0001F64F"
        "\U0001F300-\U0001F5FF"
        "\U0001F680-\U0001F6FF"
        "\U0001F1E0-\U0001F1FF"
        "\U00002702-\U000027B0"
        "\U000024C2-\U0001F251"
        "]+", flags=re.UNICODE)
    
    emojis = emoji_pattern.findall(text)
    
    for i, emoji in enumerate(emojis):
        text = text.replace(emoji, f"__EMOJI_{i}__")
    
    quick_replacements = {
        r'\bAI\b': '誒愛',
        r'\bOK\b': 'okay',
        r'\bWiFi\b': '歪fai',
        r'\bUSB\b': 'U S B',
        r'\b2024\b': '二零二四',
        r'\b2025\b': '二零二五',
        '唔係': '唔 係',
        '唔好': '唔 好',
        '唔知': '唔 知',
    }
    
    for pattern, replacement in quick_replacements.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    
    for i, emoji in enumerate(emojis):
        text = text.replace(f"__EMOJI_{i}__", emoji)
    
    return text

# ===== 全局實例 ===== - unchanged
connection_pool = TTSConnectionPool()
tts_cache = IntelligentTTSCache()
performance_monitor = PerformanceMonitor()

# ===== Lifespan Context Manager ===== - unchanged
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("正在初始化TTS連接池...")
    await connection_pool._ensure_initialized()
    logger.info("TTS連接池初始化完成")
    
    logger.info(f'{"="*70}')
    logger.info('🚀 小狐狸AI助手 - 極速TTS版服務器')
    logger.info(f'{"="*70}')
    logger.info(f'⚡ 性能優化功能:')
    logger.info(f'   🔗 TTS連接池: 最大{PERFORMANCE_CONFIG["MAX_CONNECTIONS_PER_VOICE"]}連接/語音')
    logger.info(f'   💾 智能緩存: 最大{PERFORMANCE_CONFIG["CACHE_MAX_SIZE"]}項')
    logger.info(f'   📊 性能監控: {"啟用" if PERFORMANCE_CONFIG["MONITORING_ENABLED"] else "禁用"}')
    logger.info(f'   🚀 預加載: {"啟用" if PERFORMANCE_CONFIG["PRELOAD_ENABLED"] else "禁用"}')
    logger.info(f'   📁 靜態文件: {"已配置" if os.path.exists("static") else "未配置"}')
    logger.info(f'   🏠 主頁面: {"可用" if os.path.exists(HTML_FILE) else "未找到"}')
    logger.info(f'{"="*70}')
    
    yield
    
    logger.info("正在清理TTS連接池...")
    if connection_pool.cleanup_task and not connection_pool.cleanup_task.done():
        connection_pool.cleanup_task.cancel()
        try:
            await connection_pool.cleanup_task
        except asyncio.CancelledError:
            pass
    logger.info("TTS連接池清理完成")

# ===== 創建 FastAPI 實例 ===== - unchanged
app = FastAPI(
    title="小狐狸AI助手 - 極速TTS版", 
    version="2.0.0",
    lifespan=lifespan
)

# CORS 配置 - unchanged
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== 靜態文件服務配置 ===== - unchanged
if not os.path.exists("static"):
    os.makedirs("static")
    logger.info("Created 'static' directory")

app.mount("/static", StaticFiles(directory="static"), name="static")

# ===== LLM-CONTEXT-START: MAIN API ROUTES =====
# @LLM-CONTEXT: 主要 API 路由
# 添加根路徑路由 - unchanged
@app.get("/")
async def root(request: Request):
    """根路徑 - 返回主頁面或API資訊"""
    port = request.url.port or int(os.getenv('PORT', 5000))
    static_path = f'static/{HTML_FILE}'
    
    html_content = ""
    if os.path.exists(static_path):
        with open(static_path, "r", encoding="utf-8") as f:
            html_content = f.read()
    elif os.path.exists(HTML_FILE):
        with open(HTML_FILE, "r", encoding="utf-8") as f:
            html_content = f.read()
    
    if html_content:
        # Inject actual host/port/protocol to frontend
        host = request.url.hostname or "127.0.0.1"
        protocol = request.url.scheme or "http"
        
        # Create server config injection
        server_config = {
            "port": port,
            "host": host, 
            "protocol": protocol,
            "api_url": f"{protocol}://{host}:{port}"
        }
        
        injection = f'''<script>
window.SERVER_CONFIG = {json.dumps(server_config)};
console.log('🔌 Server config injected:', window.SERVER_CONFIG);
</script>'''
        
        # Inject before </head>
        if "</head>" in html_content:
            html_content = html_content.replace("</head>", injection + "\n</head>")
        else:
            # Fallback: inject at beginning
            html_content = injection + "\n" + html_content
            
        return HTMLResponse(content=html_content)
    else:
        # If file not found, show detailed error
        return {
            "error": "HTML file not found",
            "searched_paths": [HTML_FILE, static_path],
            "current_dir": os.getcwd(),
            "files_in_current_dir": os.listdir('.'),
            "files_in_static": os.listdir('static') if os.path.exists('static') else []
        }

# ===== 請求模型 ===== - unchanged
class TTSRequest(BaseModel):
    text: str
    voice: str = 'zh-HK-HiuGaaiNeural'
    rate: int = 160
    pitch: int = 100
    skip_browser: bool = False  # When true, skip browser TTS and use server fallback directly

class ChatRequest(BaseModel):
    prompt: str
    model: str = 'gemini-1.5-flash-001'
    responseLength: str = 'brief'

class QAPairRequest(BaseModel):
    category: str
    questions: List[str]
    answer: str

# ===== Log function =====
def log(message):
    print(f"[{time.strftime('%H:%M:%S')}] {message}")

# ===== API 端點 ===== - unchanged except for qwen format check
@app.get("/health")
async def health_check():
    """健康檢查並返回性能統計"""
    cache_stats = tts_cache.get_stats()
    perf_stats = performance_monitor.get_stats()
    
    qwen_key_configured = bool(QWEN_API_KEY)
    qwen_key_valid_format = QWEN_API_KEY and QWEN_API_KEY.startswith('sk-') if QWEN_API_KEY else False
    
    return {
        "status": "healthy",
        "api_keys_configured": {
            "gemini": bool(GEMINI_API_KEY and GEMINI_API_KEY != 'your_gemini_api_key'),
            "together": bool(TOGETHER_API_KEY and TOGETHER_API_KEY != 'your_together_api_key'),  # 這裡修改
            "qwen": {
                "configured": qwen_key_configured,
                "valid_format": qwen_key_valid_format
            },
            "xunfei": bool(XUNFEI_APP_ID and XUNFEI_API_KEY and XUNFEI_API_SECRET),
            "deepseek": bool(DEEPSEEK_API_KEY)
        },
        "performance": perf_stats,
        "cache": cache_stats,
        "pool_status": {
            voice: len(connections) for voice, connections in connection_pool.pools.items()
        }
    }

@app.get("/models")
async def get_models():
    return {"models": AVAILABLE_MODELS}

@app.get("/voices")
async def get_voices():
    return {"voices": EDGE_TTS_VOICES}

@app.post("/api/tts/stream")
async def tts_stream_optimized(req: TTSRequest):
    """優化版 TTS 流式合成：先做廣東話數字/單位『點』讀法預處理，再合成"""
    start_time = time.time()
    performance_monitor.record_request("tts_stream")

    try:
        # Validate input
        if not req.text or not req.text.strip():
            logger.warning("TTS request with empty text")
            raise HTTPException(status_code=400, detail="Text cannot be empty")

        # Log the request
        logger.info(f"TTS request: voice={req.voice}, rate={req.rate}, pitch={req.pitch}, text_length={len(req.text)}")

        # 1) 先查快取
        cached_audio = await tts_cache.get(req.text, req.voice, req.rate, req.pitch)
        if cached_audio:
            logger.info(f"TTS cache hit: {req.text[:30]}...")
            return await _stream_cached_audio(cached_audio, start_time)

        # 2) 文字清洗 + 廣東話預處理（關鍵：這裡會把 32.5°C 轉成『攝氏32點5度』）
        base_text = strip_html_tags(req.text)
        processed_text = preprocess_for_cantonese_tts(
            optimize_text_for_cantonese_tts(base_text)
        )

        # Validate processed text
        if not processed_text or not processed_text.strip():
            logger.warning(f"Processed text is empty after preprocessing. Original: {req.text[:50]}")
            raise HTTPException(status_code=400, detail="Processed text is empty")

        # 方便你在 console 直接看到是否已經包含「點」
        logger.info(f"[TTS preprocessed] {processed_text[:120]}")

        # 3) 嘗試 Edge TTS (優先)
        edge_tts_failed = False
        edge_error_msg = ""
        connection = None

        try:
            connection = await connection_pool.acquire(req.voice)
            # 4) 合成並以串流方式回傳
            return await _synthesize_and_stream(connection, processed_text, req, start_time)
        except Exception as edge_error:
            edge_tts_failed = True
            edge_error_msg = str(edge_error)
            performance_monitor.record_error("edge_tts_failure")
            logger.warning(f"⚠️ Edge TTS failed: {edge_error}")
        finally:
            # 5) 一定要釋放連線
            if connection:
                await connection_pool.release(connection)

        # 6) 如果 Edge TTS 失敗
        if edge_tts_failed:
            # If skip_browser=False, tell client to try browser TTS first (priority 2)
            if not req.skip_browser:
                logger.info("🌐 Edge TTS failed, instructing client to try Browser TTS (Danny)")
                raise HTTPException(
                    status_code=503,
                    detail="Edge TTS unavailable. Try browser TTS first.",
                    headers={"X-TTS-Fallback": "browser"}
                )

            # If skip_browser=True, try Azure TTS (priority 3)
            logger.info("🔄 Attempting fallback to Azure TTS (Cantonese)...")
            try:
                return await _synthesize_with_azure(processed_text, req, start_time)
            except Exception as azure_error:
                performance_monitor.record_error("azure_tts_failure")
                logger.warning(f"⚠️ Azure TTS also failed: {azure_error}")
                logger.info("🔄 Attempting fallback to gTTS (Mandarin)...")

                # 7) 如果 Azure 也失敗，嘗試 gTTS (Mandarin) (priority 4)
                try:
                    return await _synthesize_with_gtts(processed_text, req, start_time)
                except Exception as gtts_error:
                    performance_monitor.record_error("gtts_failure")
                    logger.error(f"❌ All TTS providers failed")
                    # All TTS providers failed
                    raise HTTPException(
                        status_code=500,
                        detail=f"All TTS providers failed. Edge: {edge_error_msg[:50]}, Azure: {str(azure_error)[:50]}, gTTS: {str(gtts_error)[:50]}"
                    )

    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        performance_monitor.record_error("tts_synthesis")
        logger.exception(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== LLM-CONTEXT-END: MAIN API ROUTES =====

# ===== WebSocket Endpoint =====
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket client connected")
    try:
        while True:
            # Keep the connection alive and wait for client to disconnect
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")


async def _stream_cached_audio(cached_audio: bytes, start_time: float):
    """流式返回緩存音頻 - Fixed with proper headers"""
    # ✅ Validate cached audio is not empty
    if not cached_audio or len(cached_audio) == 0:
        logger.error("Cannot stream empty cached audio!")
        raise HTTPException(status_code=500, detail="Cached audio is empty")

    first_chunk_size = PERFORMANCE_CONFIG["FIRST_CHUNK_SIZE"]
    chunk_size = PERFORMANCE_CONFIG["CHUNK_SIZE"]

    async def audio_generator():
        try:
            # Send first chunk
            yield cached_audio[:first_chunk_size]

            first_chunk_latency = (time.time() - start_time) * 1000
            performance_monitor.record_first_chunk_latency(first_chunk_latency)

            # Stream remaining chunks
            for i in range(first_chunk_size, len(cached_audio), chunk_size):
                yield cached_audio[i:i + chunk_size]
                await asyncio.sleep(0.001)
        except Exception as e:
            logger.error(f"Error streaming cached audio: {e}")
            # Don't raise, just complete the stream

    # Proper headers for chunked encoding
    headers = {
        "Cache-Control": "public, max-age=3600",
        "Connection": "keep-alive",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": str(len(cached_audio))
    }

    return StreamingResponse(
        audio_generator(),
        media_type="audio/mpeg",
        headers=headers
    )


async def _synthesize_with_gtts(text: str, req: TTSRequest, start_time: float):
    """Synthesize using Google TTS (gTTS) as fallback"""
    logger.info(f"🔄 Attempting gTTS synthesis: text_len={len(text)}, text='{text[:80]}...'")

    try:
        # Map voice to language (gTTS doesn't support voice selection)
        # Use zh-TW (Taiwan/Mandarin) as closest to Cantonese
        lang = 'zh-TW' if 'HK' in req.voice else 'zh-CN'

        # Create gTTS object
        tts = gTTS(text=text, lang=lang, slow=False)

        # Generate audio to BytesIO
        audio_fp = io.BytesIO()
        # Use run_in_executor for Python 3.8 compatibility (to_thread added in 3.9)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, tts.write_to_fp, audio_fp)
        audio_fp.seek(0)

        audio_data = audio_fp.read()

        if not audio_data or len(audio_data) == 0:
            raise Exception("gTTS returned empty audio")

        logger.info(f"✅ gTTS synthesis success: {len(audio_data)} bytes")

        # Cache the audio
        try:
            await tts_cache.put(req.text, req.voice, req.rate, req.pitch, audio_data)
        except Exception as cache_error:
            logger.warning(f"Failed to cache gTTS audio: {cache_error}")

        # Stream the audio
        async def audio_generator():
            chunk_size = PERFORMANCE_CONFIG["CHUNK_SIZE"]
            for i in range(0, len(audio_data), chunk_size):
                yield audio_data[i:i + chunk_size]
                await asyncio.sleep(0.001)

        headers = {
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Content-Type-Options": "nosniff"
        }

        return StreamingResponse(
            audio_generator(),
            media_type="audio/mpeg",
            headers=headers
        )

    except Exception as e:
        logger.error(f"❌ gTTS synthesis failed: {e}", exc_info=True)
        raise


async def _synthesize_with_azure(text: str, req: TTSRequest, start_time: float):
    """Synthesize using Azure Cognitive Services TTS (Cantonese)"""
    if not AZURE_TTS_AVAILABLE:
        raise Exception("Azure Speech SDK not installed")

    if not AZURE_SPEECH_KEY or not AZURE_SPEECH_REGION:
        raise Exception("Azure credentials not configured in .env")

    logger.info(f"🔄 Attempting Azure TTS synthesis: text_len={len(text)}, text='{text[:80]}...'")

    try:
        # Configure speech service
        speech_config = speechsdk.SpeechConfig(
            subscription=AZURE_SPEECH_KEY,
            region=AZURE_SPEECH_REGION
        )

        # Set voice based on requested voice
        if "HiuGaai" in req.voice or "hiugaai" in req.voice.lower():
            voice_name = "zh-HK-HiuGaaiNeural"  # Female Cantonese
        elif "HiuMaan" in req.voice or "hiumaan" in req.voice.lower():
            voice_name = "zh-HK-HiuMaanNeural"  # Female Cantonese
        elif "WanLung" in req.voice or "wanlung" in req.voice.lower():
            voice_name = "zh-HK-WanLungNeural"  # Male Cantonese
        else:
            voice_name = "zh-HK-HiuGaaiNeural"  # Default to HiuGaai

        speech_config.speech_synthesis_voice_name = voice_name

        # Build SSML with rate and pitch control
        # Convert rate (default 160 = 160%) to SSML format
        # Convert pitch (default 100 = 100% = no change) to relative percentage
        rate_percent = req.rate  # Already a percentage (e.g., 160 = 160%)
        pitch_offset = req.pitch - 100  # 100 is baseline, so pitch=120 -> +20%

        # Escape XML special characters in text
        import html
        escaped_text = html.escape(text)

        ssml = f'''<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-HK">
    <voice name="{voice_name}">
        <prosody rate="{rate_percent}%" pitch="{pitch_offset:+d}%">
            {escaped_text}
        </prosody>
    </voice>
</speak>'''

        logger.debug(f"🔊 Azure TTS SSML: rate={rate_percent}%, pitch={pitch_offset:+d}%")

        # Configure to synthesize to default output (internal buffer)
        # We'll extract audio_data from the result
        synthesizer = speechsdk.SpeechSynthesizer(
            speech_config=speech_config,
            audio_config=None  # None = synthesize to internal buffer
        )

        # Synthesize using SSML (run in thread pool to not block event loop)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: synthesizer.speak_ssml_async(ssml).get()
        )

        # Check result
        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            audio_data = result.audio_data

            if not audio_data or len(audio_data) == 0:
                raise Exception("Azure TTS returned empty audio")

            logger.info(f"✅ Azure TTS synthesis success: {len(audio_data)} bytes, voice={voice_name}")

            # Cache the audio
            try:
                await tts_cache.put(req.text, req.voice, req.rate, req.pitch, audio_data)
            except Exception as cache_error:
                logger.warning(f"Failed to cache Azure TTS audio: {cache_error}")

            # Stream the audio
            async def audio_generator():
                chunk_size = PERFORMANCE_CONFIG["CHUNK_SIZE"]
                for i in range(0, len(audio_data), chunk_size):
                    yield audio_data[i:i + chunk_size]
                    await asyncio.sleep(0.001)

            headers = {
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Content-Type-Options": "nosniff"
            }

            return StreamingResponse(
                audio_generator(),
                media_type="audio/mpeg",
                headers=headers
            )

        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation = result.cancellation_details
            error_msg = f"Azure TTS canceled: {cancellation.reason}"
            if cancellation.reason == speechsdk.CancellationReason.Error:
                error_msg += f" - {cancellation.error_details}"
            logger.error(error_msg)
            raise Exception(error_msg)

        else:
            raise Exception(f"Azure TTS unexpected result: {result.reason}")

    except Exception as e:
        logger.error(f"❌ Azure TTS synthesis failed: {e}", exc_info=True)
        raise


async def _synthesize_and_stream(connection: TTSConnection, text: str, req: TTSRequest, start_time: float):
    """合成並流式返回音頻 - Fixed with proper error handling and stream completion"""
    # ✅ Validate text is not empty before synthesis
    if not text or not text.strip():
        logger.error(f"Cannot synthesize empty text! Original request text: {req.text[:100]}")
        raise HTTPException(status_code=400, detail="Text for synthesis is empty")

    rate_str = f"{req.rate - 100:+d}%"
    pitch_str = f"{req.pitch - 100:+d}Hz"

    logger.info(f"TTS synthesis starting: voice={req.voice}, rate={rate_str}, pitch={pitch_str}, text_len={len(text)}, text='{text[:80]}...'")

    # ⚠️ Test Edge TTS first before streaming - if it fails immediately, raise exception for fallback
    communicate = edge_tts.Communicate(text, req.voice, rate=rate_str, pitch=pitch_str)

    # Try to get the first chunk to verify Edge TTS is working
    try:
        stream_iterator = communicate.stream()
        first_chunk = await stream_iterator.__anext__()
        # If we got here, Edge TTS is working, proceed with normal streaming
    except Exception as test_error:
        logger.error(f"Edge TTS failed on first chunk: {test_error}")
        raise  # Raise exception to trigger gTTS fallback

    async def audio_generator():
        audio_buffer = io.BytesIO()
        first_chunk_sent = False
        chunk_count = 0
        has_audio = False  # Track if any audio was generated

        try:
            # Process the first chunk we already fetched
            if first_chunk and first_chunk["type"] == "audio":
                audio_data = first_chunk["data"]
                audio_buffer.write(audio_data)
                has_audio = True
                first_chunk_sent = True
                first_chunk_size = min(PERFORMANCE_CONFIG["FIRST_CHUNK_SIZE"], len(audio_data))
                logger.debug(f"Sending first chunk: {first_chunk_size} bytes")
                yield audio_data[:first_chunk_size]
                first_chunk_latency = (time.time() - start_time) * 1000
                performance_monitor.record_first_chunk_latency(first_chunk_latency)
                if len(audio_data) > first_chunk_size:
                    yield audio_data[first_chunk_size:]
                chunk_count += 1

            # Continue with remaining chunks
            async for chunk in stream_iterator:
                if chunk["type"] == "audio":
                    audio_data = chunk["data"]
                    audio_buffer.write(audio_data)
                    has_audio = True

                    # Just yield the data directly since first chunk already handled
                    yield audio_data
                    chunk_count += 1

                    if chunk_count % 5 == 0:
                        await asyncio.sleep(0.001)

            # Log completion status
            logger.info(f"TTS synthesis completed: {chunk_count} chunks, {len(audio_buffer.getvalue())} bytes, has_audio={has_audio}")

        except (ClientError, OSError) as exc:
            performance_monitor.record_error("tts_network_unreachable")
            logger.error(f"Edge TTS network error for text '{text[:100]}...': {exc}")
            # Cannot raise HTTPException here - response already started streaming
            # Client will receive empty/partial audio and handle with fallback

        except Exception as exc:
            performance_monitor.record_error("tts_stream_failure")
            logger.error(f"Edge TTS streaming error for text '{text[:100]}...': {exc}", exc_info=True)
            # Cannot raise HTTPException here - response already started streaming
            # Client will receive empty/partial audio and handle with fallback
        finally:
            # Always try to cache the audio we did generate
            complete_audio = audio_buffer.getvalue()
            if len(complete_audio) > 0:
                try:
                    await tts_cache.put(req.text, req.voice, req.rate, req.pitch, complete_audio)
                    logger.debug(f"Cached TTS audio: {req.text[:30]}... ({len(complete_audio)} bytes)")
                except Exception as cache_error:
                    logger.warning(f"Failed to cache TTS audio: {cache_error}")
            else:
                # ✅ Enhanced logging when no audio generated
                logger.error(f"⚠️ TTS synthesis generated NO audio data! Text: '{text}' | Original: '{req.text}' | Voice: {req.voice} | Rate: {rate_str} | Pitch: {pitch_str}")

    # Proper headers for chunked encoding
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Content-Type-Options": "nosniff"
    }

    return StreamingResponse(
        audio_generator(),
        media_type="audio/mpeg",
        headers=headers
    )

@app.post("/api/tts")
async def tts_alias(req: TTSRequest):
    """TTS別名端點（向後兼容）- unchanged"""
    return await tts_stream_optimized(req)

@app.post("/api/telemetry")
async def record_telemetry(request: Request):
    """記錄遙測數據 - unchanged"""
    try:
        data = await request.json()
        telemetry_type = data.get("type")
        
        if telemetry_type == "first_chunk":
            latency = data.get("data", 0)
            performance_monitor.record_first_chunk_latency(latency)
        elif telemetry_type == "chunk_gap":
            gaps = data.get("data", [])
            for gap in gaps[-5:]:
                performance_monitor.record_chunk_gap(gap)
        elif telemetry_type == "error":
            performance_monitor.record_error("client_error")
        
        return {"status": "recorded"}
    except Exception as e:
        logger.error(f"Telemetry error: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/performance")
async def get_performance_metrics():
    """獲取性能指標 - unchanged"""
    return {
        "performance": performance_monitor.get_stats(),
        "cache": tts_cache.get_stats(),
        "pool_status": {
            voice: {
                "total": len(connections),
                "active": sum(1 for c in connections if c.status == 'ACTIVE'),
                "idle": sum(1 for c in connections if c.status == 'IDLE')
            }
            for voice, connections in connection_pool.pools.items()
        },
        "config": PERFORMANCE_CONFIG
    }

@app.get("/api/test-qwen")
async def test_qwen_api():
    """測試 Qwen API 連接 - unchanged"""
    if not QWEN_API_KEY:
        return {"status": "error", "message": "QWEN_API_KEY is not configured"}


# @LLM-CONTEXT: API 端點定義    
    QWEN_API_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation"


    request_body = {
        "model": "qwen-plus",
        "input": {
            "messages": [
                {"role": "user", "content": "你好"}
            ]
        },
        "parameters": {
            "stream": False,
            "temperature": 0.7,
            "max_tokens": 50
        }
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {QWEN_API_KEY}"
        }
        
        try:
            response = await client.post(QWEN_API_URL, json=request_body, headers=headers)
            response_data = response.json()
            
            if response.status_code == 200:
                return {
                    "status": "success",
                    "message": "Qwen API connection successful",
                    "response": response_data
                }
            else:
                return {
                    "status": "error",
                    "message": f"Qwen API returned status code {response.status_code}",
                    "response": response_data
                }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Failed to connect to Qwen API: {str(e)}"
            }

# ===== 知識庫 API =====
@app.get("/api/knowledge/qa-pairs")
async def get_qa_pairs():
    """獲取所有問答對"""
    try:
        qa_pairs = knowledge_base.get_all_qa_pairs()
        return {
            "status": "success",
            "data": qa_pairs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/knowledge/qa-pairs")
async def add_qa_pair_endpoint(req: QAPairRequest):
    """添加新的問答對"""
    try:
        qa_pair = knowledge_base.add_qa_pair(req.questions[0], req.answer)  # Simplified for now
        return {
            "status": "success",
            "data": qa_pair
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/knowledge/qa-pairs/{qa_id}/toggle")
async def toggle_qa_pair(qa_id: int):
    """啟用/停用問答對"""
    try:
        result = knowledge_base.toggle_qa_pair(qa_id)
        if result:
            return {"status": "success", "data": result}
        else:
            raise HTTPException(status_code=404, detail="QA pair not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/knowledge/qa-pairs/{qa_id}")
async def delete_qa_pair(qa_id: int):
    """刪除問答對"""
    try:
        success = knowledge_base.delete_qa_pair(qa_id)
        if success:
            return {"status": "success"}
        else:
            raise HTTPException(status_code=404, detail="QA pair not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/knowledge/qa-pairs/{qa_id}")
async def update_qa_pair(qa_id: int, req: QAPairRequest):
    """更新問答對"""
    try:
        result = knowledge_base.update_qa_pair(qa_id, req.questions[0], req.answer)
        if result:
            return {"status": "success", "data": result}
        else:
            raise HTTPException(status_code=404, detail="QA pair not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===== LLM-CONTEXT-START: CHAT ROUTE =====
# @LLM-CONTEXT: 核心聊天路由邏輯
# ===== Chat API =====
@app.post("/api/chat")
async def chat(req: ChatRequest):
    """聊天API（添加性能監控）"""
    performance_monitor.record_request("chat")
    
    # 先检查是否是天气查询
    weather_intent = weather_service.extract_weather_intent(req.prompt)
    if weather_intent:
        logger.info(f"Weather query detected: {req.prompt[:30]}...")
        weather_data = await weather_service.get_weather(weather_intent['date'])
        if weather_data:
            response = weather_service.format_weather_response(weather_data)
            
            # 返回天气响应
            async def weather_event_generator():
                response_data = {
                    'choices': [{
                        'delta': {'content': response},
                        'finish_reason': None
                    }]
                }
                yield f"data: {json.dumps(response_data, ensure_ascii=False)}\n\n"
                yield f"data: [DONE]\n\n"
            
            return StreamingResponse(weather_event_generator(), media_type="text/event-stream")
    
    # 再检查知识库
    kb_answer = knowledge_base.find_answer(req.prompt)
    if kb_answer:
        logger.info(f"Knowledge base hit: {req.prompt[:30]}...")
        
        # 返回知识库答案的流式响应
        async def kb_event_generator():
            response = {
                'choices': [{
                    'delta': {'content': kb_answer},
                    'finish_reason': None
                }]
            }
            yield f"data: {json.dumps(response, ensure_ascii=False)}\n\n"
            yield f"data: [DONE]\n\n"
        
        return StreamingResponse(kb_event_generator(), media_type="text/event-stream")
    
    # 如果都没有匹配，使用 AI 模型处理
    model_config = AVAILABLE_MODELS.get(req.model)
    
    if model_config:
        provider = model_config.get('provider')
        
        if provider == 'together':
            return await handle_together_request(req.prompt, model_config, req.responseLength)
        elif provider == 'qwen':
            return await chat_with_qwen(req)
        elif provider == 'deepseek':
            return await chat_with_deepseek(req)
        else:
            raise HTTPException(status_code=501, detail=f"Provider {provider} is not implemented")
    
    # 如果没找到，尝试使用别名
    model_name = MODEL_ALIASES.get(req.model, req.model)
    
    try:
        if model_name.startswith('deepseek'):
            return await chat_with_deepseek(req)
        elif req.model.startswith('together'):
            # 对于 together 模型，尝试从别名获取完整的 model_id
            full_model_id = MODEL_ALIASES.get(req.model)
            if not full_model_id:
                raise HTTPException(status_code=400, detail=f"Unknown Together model: {req.model}")
            
            model_config = {
                "provider": "together",
                "model_id": full_model_id,
                "name": req.model
            }
            return await handle_together_request(req.prompt, model_config, req.responseLength)
        elif model_name.startswith('qwen'):
            return await chat_with_qwen(req)
        elif model_name.startswith('xunfei'):
            return await chat_with_xunfei(req)
        else:
            req.model = model_name
            return await chat_with_gemini(req)
            
    except Exception as e:
        performance_monitor.record_error("chat_general")
        raise HTTPException(status_code=500, detail=str(e))
# ===== LLM-CONTEXT-END: CHAT ROUTE =====


# ===== LLM-REF-START: CHAT HANDLERS =====
# @LLM-REF: 聊天處理函數 - 已穩定運行
async def chat_with_deepseek(req: ChatRequest):
    """使用 DeepSeek API 進行聊天 - unchanged"""
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY is not configured")
    
    DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
    
    if req.responseLength == 'brief':
        system_prompt = "你係一個專為香港小學生設計嘅AI助手。請用地道廣東話回答。用2-3句話簡潔回答，不超過50個字。可以適當使用表情符號令對話更生動有趣。😊"
    else:
        system_prompt = "你係一個專為香港小學生設計嘅AI助手。請用地道廣東話回答。詳細解釋，用例子說明，令小朋友容易明白。可以適當使用表情符號。"
    
    request_body = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.prompt}
        ],
        "stream": True,
        "temperature": 0.7,
        "max_tokens": 200 if req.responseLength == 'detailed' else 100
    }
    
    async def event_generator():
        async with httpx.AsyncClient(timeout=60.0) as client:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
            }
            
            try:
                async with client.stream("POST", DEEPSEEK_API_URL, json=request_body, headers=headers) as response:
                    if response.status_code != 200:
                        performance_monitor.record_error("deepseek_api")
                        error_body = await response.aread()
                        error_text = error_body.decode('utf-8')
                        
                        error_response = {
                            'choices': [{
                                'delta': {'content': f'DeepSeek API 錯誤 ({response.status_code}): {error_text[:200]}'},
                                'finish_reason': 'error'
                            }]
                        }
                        yield f"data: {json.dumps(error_response, ensure_ascii=False)}\n\n"
                        yield f"data: [DONE]\n\n"
                        return
                    
                    buffer = ""
                    async for chunk in response.aiter_text():
                        buffer += chunk
                        lines = buffer.split('\n')
                        buffer = lines[-1]
                        
                        for line in lines[:-1]:
                            line = line.strip()
                            if not line:
                                continue
                            
                            if line.startswith("data: "):
                                data_str = line[6:]
                                
                                if data_str == "[DONE]":
                                    yield f"data: [DONE]\n\n"
                                else:
                                    try:
                                        yield f"{line}\n\n"
                                    except Exception:
                                        continue
                                        
            except Exception as e:
                performance_monitor.record_error("deepseek_stream")
                error_response = {'choices': [{'delta': {'content': f'DeepSeek 服務錯誤: {str(e)}'}, 'finish_reason': 'error'}]}
                yield f"data: {json.dumps(error_response, ensure_ascii=False)}\n\n"
                yield f"data: [DONE]\n\n"
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

def clean_together_output(text: str, model_id: str) -> str:
    """清理 Together API 模型的輸出"""
    
    # 移除 "Note:" 之後的所有內容
    if "Note:" in text:
        text = text.split("Note:")[0].strip()
    
    # 移除常見的系統註釋模式
    patterns_to_remove = [
        r'\[.*?\]',  # 移除方括號內的內容
        r'\(Note:.*?\)',  # 移除括號內的 Note
        r'<.*?>',  # 移除 HTML 標籤
        r'Note:.*$',  # 移除 Note: 到結尾的內容
        r'PS:.*$',  # 移除 PS: 到結尾的內容
        r'P\.S\..*$',  # 移除 P.S. 到結尾的內容
    ]
    
    for pattern in patterns_to_remove:
        text = re.sub(pattern, '', text, flags=re.MULTILINE | re.DOTALL)
    
    # 清理亂碼和特殊字符
    text = text.encode('utf-8', 'ignore').decode('utf-8', 'ignore')
    
    # 移除多餘的空白
    text = ' '.join(text.split())
    
    return text.strip()

async def handle_together_request(prompt: str, model_config: dict, response_length: str):
    log(f"Calling Together API - Model: {model_config['model_id']}, Length: {response_length}")
    
    if not TOGETHER_API_KEY or TOGETHER_API_KEY == 'your_together_api_key':
        raise HTTPException(status_code=500, detail="TOGETHER_API_KEY is not configured")
    
    TOGETHER_API_URL = "https://api.together.xyz/v1/chat/completions"
    
    length_configs = {
        'very_brief': {'max_tokens': 50, 'extra_prompt': '用1句話回答，不超過20個字。'},
        'brief': {'max_tokens': 100, 'extra_prompt': '用2-3句話簡潔回答，不超過50個字。'},
        'normal': {'max_tokens': 200, 'extra_prompt': '用4-5句話回答，不超過100個字。'},
        'detailed': {'max_tokens': 350, 'extra_prompt': '詳細解釋，可以包含例子。'}
    }
    config = length_configs.get(response_length, length_configs['normal'])
    
    # 為 Mixtral 模型使用更明確的指令
    if "mixtral" in model_config['model_id'].lower():
        system_prompt = f"""You are an AI assistant designed for Hong Kong primary school students. 
IMPORTANT RULES:
1. Reply ONLY in Cantonese (廣東話)
2. {config['extra_prompt']}
3. Do NOT use emojis or special characters
4. Do NOT add any notes, explanations, or meta-commentary about your response
5. Be friendly and use simple language
6. Give direct answers without any system messages

Example good response: 你好！我係你嘅AI助手，可以幫你解答問題。
Example bad response: 你好！😊 [Note: Using friendly tone] I'm here to help."""
    else:
        system_prompt = f"""你係一個專為香港小學生設計嘅AI助手。請遵循以下規則：
1. 必須用地道廣東話口語回答
2. {config['extra_prompt']}
3. 避免使用表情符號
4. 語氣要親切友好
5. 多用生活化嘅例子同比喻嚟解釋概念
6. 唔好加任何系統訊息或者註釋"""

    request_body = {
        'model': model_config['model_id'],
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': prompt}
        ],
        'stream': True,
        'max_tokens': config['max_tokens'],
        'temperature': 0.7,
        'top_p': 0.9
    }

    async def event_generator():
        async with httpx.AsyncClient(timeout=60.0) as client:
            headers = {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {TOGETHER_API_KEY}'
            }
            
            try:
                async with client.stream("POST", TOGETHER_API_URL, json=request_body, headers=headers) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        error_response = {'choices': [{'delta': {'content': 'Together API 錯誤'}, 'finish_reason': 'error'}]}
                        yield f"data: {json.dumps(error_response, ensure_ascii=False)}\n\n"
                        yield f"data: [DONE]\n\n"
                        return

                    # 為需要清理的模型收集完整響應
                    if "mixtral" in model_config['model_id'].lower():
                        full_response = ""
                        
                        async for chunk in response.aiter_bytes():
                            chunk_str = chunk.decode('utf-8', 'ignore')
                            
                            # 解析 SSE 格式
                            for line in chunk_str.split('\n'):
                                if line.startswith('data: '):
                                    data_str = line[6:].strip()
                                    if data_str and data_str != '[DONE]':
                                        try:
                                            data = json.loads(data_str)
                                            if 'choices' in data:
                                                for choice in data['choices']:
                                                    if 'delta' in choice and 'content' in choice['delta']:
                                                        content = choice['delta']['content']
                                                        full_response += content
                                        except:
                                            pass
                        
                        # 清理完整響應
                        cleaned_response = clean_together_output(full_response, model_config['model_id'])
                        
                        # 發送清理後的響應
                        response_data = {
                            'choices': [{
                                'delta': {'content': cleaned_response},
                                'finish_reason': None
                            }]
                        }
                        yield f"data: {json.dumps(response_data, ensure_ascii=False)}\n\n"
                        yield f"data: [DONE]\n\n"
                    else:
                        # 其他模型直接轉發
                        async for chunk in response.aiter_bytes():
                            yield chunk

            except Exception as e:
                error_response = {'choices': [{'delta': {'content': f'Together 服務錯誤: {e}'}, 'finish_reason': 'error'}]}
                yield f"data: {json.dumps(error_response, ensure_ascii=False)}\n\n"
                yield f"data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# Updated Qwen handler from server_gemini.py
async def chat_with_qwen(req: ChatRequest):
    """使用 Qwen API 進行聊天 - Updated from server_gemini.py"""
    log(f"Calling Qwen API (stream) - Model: {req.model}, Length: {req.responseLength}")
    
    if not QWEN_API_KEY:
        raise HTTPException(status_code=500, detail="QWEN_API_KEY is not configured.")
    
    # Get model config
    model_config = AVAILABLE_MODELS.get(req.model, {})
    model_id = model_config.get('model_id', 'qwen-turbo-latest')
    
    length_configs = {
        'very_brief': {'max_tokens': 50, 'extra_prompt': '用1句話回答，不超過20個字。'},
        'brief': {'max_tokens': 100, 'extra_prompt': '用2-3句話簡潔回答，不超過50個字。'},
        'normal': {'max_tokens': 200, 'extra_prompt': '用4-5句話回答，不超過100個字。'},
        'detailed': {'max_tokens': 350, 'extra_prompt': '詳細解釋，可以包含例子。'}
    }
    config = length_configs.get(req.responseLength, length_configs['normal'])
    system_prompt = f"""你係一個專為香港小學生設計嘅AI助手。請遵循以下規則：
1. 必須用地道廣東話口語回答
2. 避免書面語，要好似同小朋友傾偈咁自然
3. {config['extra_prompt']}
4. 語氣要親切友好
5. 多用生活化嘅例子同比喻嚟解釋概念"""

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {QWEN_API_KEY}'
    }
    
    request_body = {
        'model': model_id,
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': req.prompt}
        ],
        'stream': True,
        'max_tokens': config['max_tokens']
    }

    async def event_generator():
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                async with client.stream("POST", QWEN_API_URL, json=request_body, headers=headers) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        log(f"Qwen API Error: {response.status_code} - {error_text.decode()}")
                        error_response = {'choices': [{'delta': {'content': 'Qwen API 錯誤'}, 'finish_reason': 'error'}]}
                        yield f"data: {json.dumps(error_response, ensure_ascii=False)}\n\n"
                        yield f"data: [DONE]\n\n"
                        return

                    async for chunk in response.aiter_bytes():
                        yield chunk

            except Exception as e:
                log(f"Qwen stream error: {e}")
                error_response = {'choices': [{'delta': {'content': f'Qwen 服務錯誤: {e}'}, 'finish_reason': 'error'}]}
                yield f"data: {json.dumps(error_response, ensure_ascii=False)}\n\n"
                yield f"data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

async def chat_with_xunfei(req: ChatRequest):
    """使用訊飛星火 API 進行聊天 - unchanged"""
    if not (XUNFEI_APP_ID and XUNFEI_API_KEY and XUNFEI_API_SECRET):
        raise HTTPException(status_code=500, detail="XUNFEI credentials are not fully configured")
    
    async def event_generator():
        error_response = {
            'choices': [{
                'delta': {'content': '訊飛 API 暫時不支持流式輸出，請選擇其他模型。'},
                'finish_reason': 'error'
            }]
        }
        yield f"data: {json.dumps(error_response, ensure_ascii=False)}\n\n"
        yield f"data: [DONE]\n\n"
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")

async def chat_with_gemini(req: ChatRequest):
    """使用 Gemini API 進行聊天 - unchanged"""
    if not GEMINI_API_KEY or GEMINI_API_KEY == 'your_gemini_api_key':
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")

    model_id = req.model
    GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:streamGenerateContent"
    
    if req.responseLength == 'brief':
        system_prompt = "你係一個專為香港小學生設計嘅AI助手。請用地道廣東話回答。用2-3句話簡潔回答，不超過50個字。可以適當使用表情符號令對話更生動有趣。😊"
    else:
        system_prompt = "你係一個專為香港小學生設計嘅AI助手。請用地道廣東話回答。詳細解釋，用例子說明，令小朋友容易明白。可以適當使用表情符號。"
    
    request_body = {
        "contents": [{"parts": [{"text": req.prompt}]}],
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "generationConfig": {
            "temperature": 0.7,
            "topK": 40,
            "topP": 0.8,
            "maxOutputTokens": 200 if req.responseLength == 'detailed' else 100,
            "responseMimeType": "text/plain"
        }
    }

    async def event_generator():
        async with httpx.AsyncClient(timeout=60.0) as client:
            url = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}&alt=sse"
            
            try:
                async with client.stream("POST", url, json=request_body, headers={"Content-Type": "application/json"}) as response:
                    if response.status_code != 200:
                        performance_monitor.record_error("gemini_api")
                        error_body = await response.aread()
                        error_text = error_body.decode('utf-8')
                        
                        error_response = {
                            'choices': [{
                                'delta': {'content': f'Gemini API 錯誤 ({response.status_code}): {error_text[:200]}'},
                                'finish_reason': 'error'
                            }]
                        }
                        yield f"data: {json.dumps(error_response, ensure_ascii=False)}\n\n"
                        yield f"data: [DONE]\n\n"
                        return

                    buffer = ""
                    async for chunk in response.aiter_text():
                        buffer += chunk
                        lines = buffer.split('\n')
                        buffer = lines[-1]
                        
                        for line in lines[:-1]:
                            line = line.strip()
                            if not line:
                                continue
                                
                            if line.startswith("data: "):
                                data_str = line[6:]
                                
                                if data_str == "[DONE]":
                                    yield f"data: [DONE]\n\n"
                                else:
                                    try:
                                        gemini_data = json.loads(data_str)
                                        
                                        if 'candidates' in gemini_data:
                                            for candidate in gemini_data['candidates']:
                                                content = candidate.get('content', {})
                                                parts = content.get('parts', [])
                                                for part in parts:
                                                    if 'text' in part:
                                                        text = part['text']
                                                        
                                                        openai_format = {
                                                            'choices': [{
                                                                'delta': {'content': text},
                                                                'finish_reason': None
                                                            }]
                                                        }
                                                        yield f"data: {json.dumps(openai_format, ensure_ascii=False)}\n\n"
                                                        
                                    except json.JSONDecodeError:
                                        continue

            except Exception as e:
                performance_monitor.record_error("gemini_stream")
                error_response = {'choices': [{'delta': {'content': f'Gemini 服務錯誤: {str(e)}'}, 'finish_reason': 'error'}]}
                yield f"data: {json.dumps(error_response, ensure_ascii=False)}\n\n"
                yield f"data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
# ===== LLM-REF-END: CHAT HANDLERS =====


# ===== 啟動配置 =====
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv('PORT', 5000))
    print(f"DEBUG: Starting server with HTML_FILE={HTML_FILE}, PORT={port}")

    # SSL configuration
    ssl_keyfile = "certs/key.pem"
    ssl_certfile = "certs/cert.pem"
    
    protocol = "https" if os.path.exists(ssl_keyfile) and os.path.exists(ssl_certfile) else "http"
    
    print(f'\n{"="*70}')
    print(f'🚀 小狐狸AI助手 - 極速TTS版服務器')
    print(f'{"="*70}')
    print(f'📍 服務器地址: {protocol}://127.0.0.1:{port}')
    print(f'🏠 網頁界面: {protocol}://127.0.0.1:{port}/')
    print(f'📊 性能監控: {protocol}://127.0.0.1:{port}/api/performance')
    print(f'📚 API文檔: {protocol}://127.0.0.1:{port}/docs')
    print(f'📁 靜態文件: {protocol}://127.0.0.1:{port}/static/')
    print(f'{"="*70}')
    print(f'🔑 API Keys狀態:')
    print(f'   Gemini : {"✅ 已配置" if GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key" else "❌ 未配置"}')
    print(f'   Together: {"✅ 已配置" if TOGETHER_API_KEY and TOGETHER_API_KEY != "your_together_api_key" else "❌ 未配置"}')
    print(f'   Qwen    : {"✅ 已配置" if QWEN_API_KEY and QWEN_API_KEY != "your_qwen_api_key" else "❌ 未配置"}')
    print(f'   Xunfei  : {"✅ 已配置" if XUNFEI_APP_ID else "❌ 未配置"}')
    print(f'   DeepSeek: {"✅ 已配置" if DEEPSEEK_API_KEY else "❌ 未配置"}')
    print(f'{"="*70}')
    print(f'⚡ 性能優化功能:')
    print(f'   🔗 TTS連接池: 最大{PERFORMANCE_CONFIG["MAX_CONNECTIONS_PER_VOICE"]}連接/語音')
    print(f'   💾 智能緩存: 最大{PERFORMANCE_CONFIG["CACHE_MAX_SIZE"]}項')
    print(f'   📊 性能監控: {"啟用" if PERFORMANCE_CONFIG["MONITORING_ENABLED"] else "禁用"}')
    print(f'   🚀 預加載: {"啟用" if PERFORMANCE_CONFIG["PRELOAD_ENABLED"] else "禁用"}')
    print(f'{"="*70}')
    print(f'🎯 性能目標:')
    print(f'   首幀延遲: <300ms')
    print(f'   句間間隔: <200ms')
    print(f'   錯誤率: <1%')
    print(f'{"="*70}')
    print('🛑 按 Ctrl+C 停止服務器\n')
    
    run_options = {
        "host": "0.0.0.0",
        "port": port,
        "reload": False,
        "access_log": False,
        "log_level": "info"
    }

    if protocol == "https":
        run_options["ssl_keyfile"] = ssl_keyfile
        run_options["ssl_certfile"] = ssl_certfile
        print("🔒 SSL is enabled")

    uvicorn.run("server_qwen:app", **run_options)


def preprocess_for_cantonese_tts(text: str) -> str:
    if not text:
        return text
    import re
    t = text.replace('℃', '°C')

    def _temp_repl(m):
        num = m.group(1)
        if '.' in num:
            i, d = num.split('.', 1)
            return f"攝氏{i}點{d}度"
        return f"攝氏{num}度"

    # 攝氏溫度
    t = re.sub(r'(-?\d+(?:\.\d+)?)\s*°\s*C', _temp_repl, t, flags=re.IGNORECASE)

    # 百分比
    t = re.sub(r'(\d+)\.(\d+)\s*%', r'\1點\2巴仙', t)

    # 單位（mm/cm/km/m…）
    unit_map = {
        'mm': '毫米', '公厘': '毫米', '毫米': '毫米',
        'cm': '厘米', '厘米': '厘米', '公分': '厘米',
        'km': '公里', '公里': '公里', '千米': '公里',
        'm': '米', '米': '米'
    }
    def _unit_repl(m):
        a, b, u = m.group(1), m.group(2), m.group(3)
        key = u.lower() if hasattr(u, 'lower') else u
        unit = unit_map.get(key, unit_map.get(u, u))
        return f"{a}點{b}{unit}"
    t = re.sub(r'(\d+)\.(\d+)\s*(mm|公厘|毫米|cm|厘米|公分|km|公里|千米|m|米)',
               _unit_repl, t, flags=re.IGNORECASE)

    # 其他小數
    t = re.sub(r'(\d+)\.(\d+)', r'\1點\2', t)

    # 口語化（可選）
    t = (t.replace('什麼', '咩')
           .replace('怎麼', '點樣')
           .replace('這個', '呢個')
           .replace('那個', '嗰個'))
    return t

def strip_html_tags(s: str) -> str:
    import re
    return re.sub(r'<[^>]+>', '', s)
