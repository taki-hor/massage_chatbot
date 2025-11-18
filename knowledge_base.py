import sqlite3
import json
from typing import List, Dict, Any, Optional

class KnowledgeBase:
    def __init__(self, db_path: str = 'knowledge_base.db'):
        self.db_path = db_path
        self._create_table()

    def _get_conn(self):
        return sqlite3.connect(self.db_path)

    def _create_table(self):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS qa_pairs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    question TEXT NOT NULL UNIQUE,
                    answer TEXT NOT NULL,
                    enabled BOOLEAN NOT NULL DEFAULT TRUE
                )
            ''')
            conn.commit()

    def add_qa_pair(self, question: str, answer: str) -> Dict[str, Any]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('INSERT INTO qa_pairs (question, answer) VALUES (?, ?)', (question, answer))
                conn.commit()
                return {"id": cursor.lastrowid, "question": question, "answer": answer, "enabled": True}
            except sqlite3.IntegrityError:
                raise ValueError(f"Question '{question}' already exists.")

    def get_all_qa_pairs(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT id, question, answer, enabled FROM qa_pairs')
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def find_answer(self, question: str) -> Optional[str]:
        """中文語義智能匹配"""
        import re
        from synonyms_config import get_word_synonyms  # 導入同義詞配置
        
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT question, answer FROM qa_pairs WHERE enabled = TRUE')
            all_pairs = cursor.fetchall()
            
            if not all_pairs:
                return None
            
            # 標準化問題
            def normalize_question(q):
                # 移除標點和語氣詞
                q = re.sub(r'[？?！!。.,，、；;：:()（）\s]', '', q)
                q = re.sub(r'(在|的|是|了|嗎|咩|呢|啊|呀|吧|咯|有|沒有)', '', q)
                return q.lower()
            
            # 提取語義關鍵詞
            def extract_semantic_keywords(text):
                # 提取2-4字的中文詞
                words = re.findall(r'[\u4e00-\u9fff]{2,4}', text)
                semantic_words = set()
                
                for word in words:
                    # 使用配置檔案中的同義詞
                    synonyms = get_word_synonyms(word)
                    semantic_words.update(synonyms)
                
                return semantic_words
            
            # 計算語義相似度
            def semantic_similarity(q1, q2):
                kw1 = extract_semantic_keywords(q1)
                kw2 = extract_semantic_keywords(q2)
                
                if not kw1 or not kw2:
                    return 0
                
                # 計算交集比例
                intersection = len(kw1 & kw2)
                union = len(kw1 | kw2)
                
                return intersection / union if union > 0 else 0
            
            user_q_norm = normalize_question(question)
            best_match = None
            best_score = 0
            
            for stored_question, answer in all_pairs:
                stored_q_norm = normalize_question(stored_question)
                score = semantic_similarity(user_q_norm, stored_q_norm)
                
                if score > best_score:
                    best_score = score
                    best_match = answer
            
            # 40% 相似度即匹配
            return best_match if best_score >= 0.4 else None

    def delete_qa_pair(self, qa_id: int) -> bool:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM qa_pairs WHERE id = ?', (qa_id,))
            conn.commit()
            return cursor.rowcount > 0

    def toggle_qa_pair(self, qa_id: int) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT enabled FROM qa_pairs WHERE id = ?', (qa_id,))
            row = cursor.fetchone()
            if not row:
                return None
            
            new_enabled_status = not row['enabled']
            cursor.execute('UPDATE qa_pairs SET enabled = ? WHERE id = ?', (new_enabled_status, qa_id))
            conn.commit()

            cursor.execute('SELECT id, question, answer, enabled FROM qa_pairs WHERE id = ?', (qa_id,))
            updated_row = cursor.fetchone()
            return dict(updated_row) if updated_row else None

    def update_qa_pair(self, qa_id: int, question: str, answer: str) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            try:
                cursor.execute('UPDATE qa_pairs SET question = ?, answer = ? WHERE id = ?', (question, answer, qa_id))
                conn.commit()
                if cursor.rowcount == 0:
                    return None
                cursor.execute('SELECT id, question, answer, enabled FROM qa_pairs WHERE id = ?', (qa_id,))
                updated_row = cursor.fetchone()
                return dict(updated_row)
            except sqlite3.IntegrityError:
                raise ValueError(f"Question '{question}' already exists.")