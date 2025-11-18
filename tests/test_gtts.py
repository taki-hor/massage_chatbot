#!/usr/bin/env python3
from gtts import gTTS, lang
import io

def test_gtts_langs():
    print("Available gTTS languages:\n")
    languages = lang.tts_langs()

    # Find Chinese-related languages
    chinese_langs = {k: v for k, v in languages.items() if 'chinese' in v.lower() or 'zh' in k}

    print("Chinese-related languages:")
    for code, name in chinese_langs.items():
        print(f"  {code}: {name}")

    print(f"\nTotal languages available: {len(languages)}")

def test_gtts():
    tests = [
        ("您好！需要咩護理服務嗎？", "zh-TW", "Taiwan Chinese"),  # Closest to Cantonese
        ("你好", "zh-CN", "Mandarin"),
        ("測試", "zh-TW", "Taiwan Chinese"),
    ]

    for text, lang_code, lang_name in tests:
        print(f"\nTesting gTTS: {lang_name} ({lang_code}) | {text}")
        try:
            tts = gTTS(text=text, lang=lang_code, slow=False)

            audio_fp = io.BytesIO()
            tts.write_to_fp(audio_fp)
            audio_size = audio_fp.tell()

            print(f"  ✅ Success! Size: {audio_size} bytes")

            # Save to file for testing
            filename = f"/tmp/gtts_test_{lang_code}_{text[:5]}.mp3"
            audio_fp.seek(0)
            with open(filename, "wb") as f:
                f.write(audio_fp.read())
            print(f"  💾 Saved to: {filename}")

        except Exception as e:
            print(f"  ❌ Error: {e}")

if __name__ == "__main__":
    test_gtts_langs()
    print("\n" + "="*60 + "\n")
    test_gtts()
