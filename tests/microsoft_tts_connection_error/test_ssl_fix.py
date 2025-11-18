import asyncio
import edge_tts
import ssl
import os

# Disable SSL verification globally
os.environ['PYTHONHTTPSVERIFY'] = '0'

_original = ssl.create_default_context

def _no_verify(*args, **kwargs):
    ctx = _original(*args, **kwargs)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx

ssl.create_default_context = _no_verify
ssl._create_default_https_context = _no_verify

async def main():
    print("Testing with SSL disabled...")
    communicate = edge_tts.Communicate("測試", "zh-HK-HiuGaaiNeural")
    await communicate.save("test.mp3")
    print("✅ SUCCESS! File created: test.mp3")

asyncio.run(main())
