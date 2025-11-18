import httpx
import os
from typing import Dict, Optional, Tuple
from datetime import datetime, timedelta
import json
import logging
import asyncio
from functools import lru_cache
import time

logger = logging.getLogger(__name__)

class WeatherService:
    def __init__(self):
        # 使用免費的 Open-Meteo API
        self.base_url = "https://api.open-meteo.com/v1/forecast"
        
        # 預設位置（香港）
        self.default_location = {
            "latitude": 22.3193,
            "longitude": 114.1694,
            "timezone": "Asia/Hong_Kong"
        }
        
        # 記憶體緩存
        self._cache = {}
        self._cache_ttl = 1800  # 30分鐘
        
        # 重試設定
        self._max_retries = 3
        self._retry_delay = 1  # 初始延遲（秒）
        
        # 天氣狀況對應的中文描述
        self.weather_codes = {
            0: "晴朗",
            1: "大致晴朗", 
            2: "部分多雲",
            3: "多雲",
            45: "有霧",
            48: "霧凇",
            51: "輕微毛毛雨",
            53: "中度毛毛雨",
            55: "密集毛毛雨",
            61: "輕微雨",
            63: "中雨",
            65: "大雨",
            71: "輕微雪",
            73: "中雪",
            75: "大雪",
            77: "雪粒",
            80: "輕微陣雨",
            81: "中度陣雨",
            82: "強烈陣雨",
            95: "雷暴",
            96: "輕微冰雹雷暴",
            99: "強烈冰雹雷暴"
        }
    
    def _get_cache_key(self, date: str) -> str:
        """生成緩存鍵"""
        return f"weather_{date}_{self.default_location['latitude']}_{self.default_location['longitude']}"
    
    def _is_cache_valid(self, cache_entry: Dict) -> bool:
        """檢查緩存是否有效"""
        if not cache_entry:
            return False
        
        cache_time = cache_entry.get('time', 0)
        return (time.time() - cache_time) < self._cache_ttl
    
    async def get_weather(self, date: str = "today") -> Optional[Dict]:
        """獲取天氣資訊（帶緩存和重試）"""
        cache_key = self._get_cache_key(date)
        
        # 檢查緩存
        cached = self._cache.get(cache_key)
        if cached and self._is_cache_valid(cached):
            logger.debug(f"Weather cache hit for {date}")
            return cached['data']
        
        # 從API獲取
        for retry in range(self._max_retries):
            try:
                result = await self._fetch_weather_from_api(date)
                if result:
                    # 更新緩存
                    self._cache[cache_key] = {
                        'data': result,
                        'time': time.time()
                    }
                    return result
                    
            except Exception as e:
                logger.warning(f"Weather API attempt {retry + 1} failed: {e}")
                
                if retry < self._max_retries - 1:
                    # 指數退避
                    delay = self._retry_delay * (2 ** retry)
                    logger.info(f"Retrying in {delay} seconds...")
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"All weather API attempts failed")
                    
                    # 嘗試返回過期緩存
                    if cached:
                        logger.info("Returning expired cache as fallback")
                        return cached['data']
        
        return None
    
    async def _fetch_weather_from_api(self, date: str) -> Optional[Dict]:
        """從API獲取天氣數據"""
        # 計算日期
        now = datetime.now()
        if date == "tomorrow":
            target_date = now + timedelta(days=1)
        else:
            target_date = now
        
        # 建構請求參數
        params = {
            "latitude": self.default_location["latitude"],
            "longitude": self.default_location["longitude"],
            "timezone": self.default_location["timezone"],
            "current": "temperature_2m,relative_humidity_2m,weather_code",
            "daily": "temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum",
            "forecast_days": 2
        }
        
        # 發送請求
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(self.base_url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                return self._parse_weather_data(data, date)
            else:
                logger.error(f"Weather API error: {response.status_code} - {response.text}")
                raise Exception(f"API returned status {response.status_code}")
    
    def _parse_weather_data(self, data: Dict, date: str) -> Dict:
        """解析天氣數據"""
        try:
            if date == "today":
                # 今天的天氣使用當前數據
                current = data.get("current", {})
                daily = data.get("daily", {})
                
                weather_code = current.get("weather_code", 0)
                weather_desc = self.weather_codes.get(weather_code, "未知")
                
                return {
                    "date": "今日",
                    "temperature": current.get("temperature_2m", 0),
                    "temperature_max": daily["temperature_2m_max"][0] if daily.get("temperature_2m_max") else None,
                    "temperature_min": daily["temperature_2m_min"][0] if daily.get("temperature_2m_min") else None,
                    "humidity": current.get("relative_humidity_2m", 0),
                    "weather_code": weather_code,
                    "weather_description": weather_desc,
                    "precipitation": daily["precipitation_sum"][0] if daily.get("precipitation_sum") else 0
                }
            else:
                # 明天的天氣使用預報數據
                daily = data.get("daily", {})
                
                weather_code = daily["weather_code"][1] if len(daily.get("weather_code", [])) > 1 else 0
                weather_desc = self.weather_codes.get(weather_code, "未知")
                
                return {
                    "date": "明日",
                    "temperature": None,
                    "temperature_max": daily["temperature_2m_max"][1] if len(daily.get("temperature_2m_max", [])) > 1 else None,
                    "temperature_min": daily["temperature_2m_min"][1] if len(daily.get("temperature_2m_min", [])) > 1 else None,
                    "humidity": None,
                    "weather_code": weather_code,
                    "weather_description": weather_desc,
                    "precipitation": daily["precipitation_sum"][1] if len(daily.get("precipitation_sum", [])) > 1 else 0
                }
                
        except Exception as e:
            logger.error(f"Failed to parse weather data: {e}")
            raise
    
    def format_weather_response(self, weather_data: Dict) -> str:
        """格式化天氣回應"""
        if not weather_data:
            return "抱歉，我現在無法獲取天氣資訊。請稍後再試。"
        
        date = weather_data["date"]
        desc = weather_data["weather_description"]
        
        if weather_data["date"] == "今日":
            # 今天的天氣
            temp = weather_data["temperature"]
            temp_max = weather_data["temperature_max"]
            temp_min = weather_data["temperature_min"]
            humidity = weather_data["humidity"]
            precipitation = weather_data["precipitation"]
            
            response = f"{date}嘅天氣係{desc}。"
            response += f"而家溫度係 {temp:.1f}°C。"
            
            if temp_max and temp_min:
                response += f"最高溫度 {temp_max:.1f}°C，最低溫度 {temp_min:.1f}°C。"
            
            if humidity:
                response += f"濕度係 {humidity}%。"
            
            if precipitation > 0:
                response += f"預計有 {precipitation:.1f}mm 降雨。"
            
            # 新增建議
            if weather_data["weather_code"] >= 51:
                response += "記得帶遮啊！☔"
            elif temp > 30:
                response += "天氣好熱，記得多飲水！🌞"
            elif temp < 15:
                response += "天氣有啲涼，記得著多件衫！🧥"
                
        else:
            # 明天的天氣
            temp_max = weather_data["temperature_max"]
            temp_min = weather_data["temperature_min"]
            precipitation = weather_data["precipitation"]
            
            response = f"{date}嘅天氣預報係{desc}。"
            
            if temp_max and temp_min:
                response += f"預計最高溫度 {temp_max:.1f}°C，最低溫度 {temp_min:.1f}°C。"
            
            if precipitation > 0:
                response += f"可能有 {precipitation:.1f}mm 降雨。"
            
            # 新增建議
            if weather_data["weather_code"] >= 51:
                response += "聽日記得帶遮！☔"
            elif temp_max and temp_max > 30:
                response += "聽日會好熱，做好防曬準備！🌞"
            elif temp_min and temp_min < 15:
                response += "聽日會涼，記得著暖啲！🧥"
        
        return response
    
    @lru_cache(maxsize=32)
    def extract_weather_intent(self, question: str) -> Optional[Dict]:
        """從問題中提取天氣查詢意圖（帶緩存）"""
        question_lower = question.lower()
        
        # 檢測是否是天氣相關問題
        weather_keywords = ["天氣", "溫度", "幾度", "熱唔熱", "凍唔凍", "落雨", "下雨", "晴天", "陰天"]
        is_weather_query = any(keyword in question for keyword in weather_keywords)
        
        if not is_weather_query:
            return None
        
        # 檢測時間
        if any(word in question for word in ["明天", "聽日", "明日"]):
            return {"type": "weather", "date": "tomorrow"}
        elif any(word in question for word in ["今天", "今日", "而家", "現在"]):
            return {"type": "weather", "date": "today"}
        else:
            # 預設查詢今天
            return {"type": "weather", "date": "today"}
    
    def get_cache_stats(self) -> Dict:
        """獲取緩存統計資訊"""
        valid_entries = sum(1 for entry in self._cache.values() if self._is_cache_valid(entry))
        
        return {
            'total_entries': len(self._cache),
            'valid_entries': valid_entries,
            'expired_entries': len(self._cache) - valid_entries,
            'cache_ttl_minutes': self._cache_ttl / 60,
            'intent_cache_info': self.extract_weather_intent.cache_info()._asdict()
        }
    
    def clear_cache(self):
        """清除所有緩存"""
        self._cache.clear()
        self.extract_weather_intent.cache_clear()
        logger.info("Weather cache cleared")
