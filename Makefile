# 生成 LLM 上下文
ctx:
	python scripts/ctx_pack.py

# 快速檢查核心功能是否正常
test-core:
	python -m pytest tests/test_core_api.py -v

# 顯示可修改的區域
show-safe:
	grep -n "LLM-SAFE" server_qwen.py || echo "請先添加 LLM-SAFE 標記"

.PHONY: ctx test-core show-safe