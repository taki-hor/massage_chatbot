"""
中文同義詞配置文件
用於知識庫智能匹配
"""

# 同義詞組配置
SYNONYM_GROUPS = {
    # 創建/建立相關
    frozenset(['創辦', '成立', '建立', '創校', '建校', '開辦', '創建', '設立', '興建']),
    
    # 時間相關
    frozenset(['時間', '年份', '日期', '哪一年', '什麼時候', '幾時', '何時', '幾點', '年代', '期間']),
    
    # 學校相關
    frozenset(['學校', '校園', '學院', '學府', '校舍', '母校', '學堂']),
    
    # 天氣相關
    frozenset(['天氣', '氣候', '天氣情況', '氣象', '天色']),
    
    # 上課相關
    frozenset(['上課', '開課', '授課', '教學', '課堂', '講課', '教書']),
    
    # 午餐相關
    frozenset(['午餐', '午飯', '中餐', '中飯', '午膳', '中午飯']),
    
    # 菜單相關
    frozenset(['菜單', '餐單', '食物', '菜色', '餐點', '菜式', '飯菜']),
    
    # 位置相關
    frozenset(['位置', '地點', '地方', '地址', '在哪', '哪裡', '何處']),
    
    # 費用相關
    frozenset(['費用', '收費', '價錢', '價格', '學費', '金錢', '多少錢']),
    
    # 老師相關
    frozenset(['老師', '教師', '導師', '先生', '教授', '講師']),
    
    # 學生相關
    frozenset(['學生', '同學', '學童', '小朋友', '學員']),
    
    # 考試相關
    frozenset(['考試', '測驗', '評核', '考核', '測試']),
    
    # 假期相關
    frozenset(['假期', '放假', '休假', '假日', '節日']),
    
    # 活動相關
    frozenset(['活動', '節目', '比賽', '表演', '慶典', '儀式']),
}

def get_word_synonyms(word):
    """
    獲取指定詞語的所有同義詞
    
    Args:
        word (str): 要查找同義詞的詞語
        
    Returns:
        set: 包含該詞及其同義詞的集合
    """
    for group in SYNONYM_GROUPS:
        if word in group:
            return group
    return {word}

def add_synonym_group(words):
    """
    動態添加新的同義詞組
    
    Args:
        words (list): 同義詞列表
    """
    global SYNONYM_GROUPS
    SYNONYM_GROUPS.add(frozenset(words))
    
def remove_synonym_group(sample_word):
    """
    移除包含指定詞語的同義詞組
    
    Args:
        sample_word (str): 同義詞組中的任一詞語
    """
    global SYNONYM_GROUPS
    group_to_remove = None
    for group in SYNONYM_GROUPS:
        if sample_word in group:
            group_to_remove = group
            break
    
    if group_to_remove:
        SYNONYM_GROUPS.remove(group_to_remove)

# 可選：載入外部配置檔案的功能
def load_synonyms_from_file(file_path):
    """
    從 JSON 檔案載入同義詞配置
    
    Args:
        file_path (str): JSON 檔案路徑
    """
    import json
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            global SYNONYM_GROUPS
            SYNONYM_GROUPS = {frozenset(group) for group in data.get('synonym_groups', [])}
    except FileNotFoundError:
        print(f"同義詞配置檔案 {file_path} 不存在")
    except Exception as e:
        print(f"載入同義詞配置失敗: {e}")