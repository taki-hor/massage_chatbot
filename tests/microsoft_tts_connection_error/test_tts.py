import os
import asyncio
import edge_tts
import sys
import time

TEXT = "測試"
VOICE = "zh-HK-HiuGaaiNeural"
OUTFILE = "test_tts.mp3"

# 從環境變數讀取代理，例：export HTTPS_PROXY="http://user:pass@proxy:8080"
PROXY = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")

# 可調參數
CONNECT_TIMEOUT = 10  # 秒
MAX_RETRIES = 3
RETRY_BACKOFF = 2  # 指數退避基數（秒）

async def synth_once():
    # edge-tts 會自行建立 aiohttp session；可把 proxy 直接丟進來
    comm = edge_tts.Communicate(
        TEXT,
        VOICE,
        proxy=PROXY,   # 無代理就會是 None
    )
    # 使用 stream 取得音訊並寫入檔案
    data = b""
    start = time.time()
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            data += chunk["data"]
        elif chunk["type"] == "WordBoundary":
            # 可視需要處理斷詞事件
            pass
        elif chunk["type"] == "error":
            raise RuntimeError(f"edge-tts error: {chunk}")
        # 若需要逾時可自行檢查經過時間
        if time.time() - start > CONNECT_TIMEOUT + 30:
            raise TimeoutError("Synthesis took too long")

    if not data:
        raise RuntimeError("No audio data received")

    with open(OUTFILE, "wb") as f:
        f.write(data)
    return len(data)

async def main():
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            nbytes = await asyncio.wait_for(synth_once(), timeout=CONNECT_TIMEOUT + 60)
            print(f"✅ Success! wrote {nbytes} bytes to {OUTFILE}")
            return
        except Exception as e:
            last_err = e
            print(f"⚠️ Attempt {attempt}/{MAX_RETRIES} failed: {e}", file=sys.stderr)
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_BACKOFF ** attempt)

    # 全部重試失敗才輸出較完整的建議
    print("\n❌ 仍無法連線產生語音。請依下列方向排查：", file=sys.stderr)
    print("1) 檢查代理/防火牆/VPN：是否允許連到 api.msedgeservices.com:443", file=sys.stderr)
    print("2) 若 IPv6 失敗、IPv4 成功：暫時停用 IPv6 或透過代理強制走 IPv4", file=sys.stderr)
    print("3) 直接測試：curl -4 -I https://api.msedgeservices.com/ -m 5 -v", file=sys.stderr)
    print(f"\n最後例外：{last_err}", file=sys.stderr)

if __name__ == "__main__":
    asyncio.run(main())

