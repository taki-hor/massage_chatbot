# Tailwind CSS 快速開始指南

## 🚀 立即使用（3 步驟）

### 1. 更新 HTML 引用

在 `static/index.html` 中:

```html
<!-- 原始 -->
<link rel="stylesheet" href="/static/styles.css">

<!-- 改為 -->
<link rel="stylesheet" href="/static/styles_compiled.css">
```

### 2. 刷新瀏覽器

按 `Ctrl+F5` 或 `Cmd+Shift+R` 強制刷新。

### 3. 完成！

所有樣式應該正常顯示，與原始版本完全一致。

---

## 🛠️ 開發工作流程

### 自動監聽模式（推薦）

```bash
cd /home/europa/ai_nurse_chatbot/chatbot_2210
npm run watch:css
```

現在修改 `styles_tailwind.css` 檔案後會自動重新編譯！

### 一次性建置

```bash
npm run build:css
```

---

## 📝 如何修改樣式

### 方法 1: 修改現有組件類（保持現有結構）

編輯 `static/styles_tailwind.css`，找到對應的組件類：

```css
@layer components {
  .message-bubble {
    @apply max-w-[85%] px-5 py-4 rounded-[24px];
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    animation: bubbleAppear 0.5s ease forwards;
  }
}
```

修改後儲存，如果開啟了 `npm run watch:css`，會自動重新編譯。

### 方法 2: 直接在 HTML 中使用 Tailwind 工具類

```html
<!-- 原始方式 -->
<div class="message-bubble user-bubble">訊息內容</div>

<!-- Tailwind 工具類方式 -->
<div class="max-w-[85%] px-5 py-4 rounded-3xl bg-gradient-to-br from-[#FFF7ED] to-[#FFE4C4] border-2 border-[#4A90E2] self-end">
  訊息內容
</div>

<!-- 混合方式（推薦） -->
<div class="message-bubble user-bubble hover:scale-105">
  訊息內容
</div>
```

### 方法 3: 修改 CSS 變量（全局主題更改）

在 `styles_tailwind.css` 的 `:root` 中:

```css
:root {
  --primary-color: #4A90E2;      /* 主色調 */
  --secondary-color: #7ED9C3;    /* 次要色調 */
  --accent-color: #87CEEB;       /* 強調色 */
  /* ... 修改任何變量 ... */
}
```

---

## 🎨 常用 Tailwind 工具類速查

### 間距
```html
<div class="p-4">padding: 1rem (16px)</div>
<div class="px-6">padding-left/right: 1.5rem (24px)</div>
<div class="mt-2">margin-top: 0.5rem (8px)</div>
<div class="gap-3">gap: 0.75rem (12px)</div>
```

### 顏色
```html
<div class="bg-white">白色背景</div>
<div class="text-primary">使用自訂主色</div>
<div class="bg-[#4A90E2]">任意顏色</div>
```

### 圓角
```html
<div class="rounded">border-radius: 0.25rem</div>
<div class="rounded-lg">border-radius: 0.5rem</div>
<div class="rounded-full">border-radius: 9999px (圓形)</div>
<div class="rounded-[20px]">自訂圓角</div>
```

### Flexbox
```html
<div class="flex items-center justify-between">
  <!-- 水平排列，垂直居中，兩端對齊 -->
</div>
```

### Grid
```html
<div class="grid grid-cols-2 gap-4">
  <!-- 2 欄網格，間距 1rem -->
</div>
```

### 響應式
```html
<div class="text-sm md:text-base lg:text-lg">
  <!-- 手機: 14px, 平板: 16px, 桌面: 18px -->
</div>
```

---

## 🔧 常見問題

### Q: 樣式沒有更新？

**A:** 清除快取並重新建置

```bash
rm static/styles_compiled.css
npm run build:css
```

然後在瀏覽器按 `Ctrl+F5` 強制刷新。

### Q: 可以混用自訂類和 Tailwind 工具類嗎？

**A:** 可以！這是推薦的做法：

```html
<!-- ✅ 推薦 -->
<div class="message-bubble hover:shadow-lg transition-all">
  混合使用自訂類和 Tailwind 工具類
</div>
```

### Q: 如何添加新的自訂組件？

**A:** 在 `styles_tailwind.css` 的 `@layer components` 中添加：

```css
@layer components {
  .my-custom-button {
    @apply px-4 py-2 rounded-lg bg-primary text-white;
    transition: all 0.3s ease;
  }

  .my-custom-button:hover {
    @apply shadow-lg scale-105;
  }
}
```

### Q: 檔案大小會不會很大？

**A:** 不會！Tailwind 的 PurgeCSS 會自動移除未使用的樣式。

- 開發版: ~3MB (包含所有 Tailwind 類)
- 生產版: ~29KB (只包含你使用的類)

### Q: 如何回到原始 CSS？

**A:** 在 HTML 中改回引用原始檔案：

```html
<link rel="stylesheet" href="/static/styles.css">
```

原始檔案完全保留，隨時可以切換回去。

---

## 📚 學習資源

### Tailwind 官方文檔
- [英文版](https://tailwindcss.com/docs)
- [中文版](https://www.tailwindcss.cn/)

### 快速查詢
- [Tailwind Cheat Sheet](https://nerdcave.com/tailwind-cheat-sheet)
- [Tailwind Play (線上編輯器)](https://play.tailwindcss.com/)

### 組件庫
- [Tailwind UI](https://tailwindui.com/) (官方付費)
- [DaisyUI](https://daisyui.com/) (免費組件庫)
- [Flowbite](https://flowbite.com/) (免費組件)

---

## ⚡ 效能提示

### 開發環境

```bash
# 使用監聽模式，自動重新編譯
npm run watch:css
```

### 生產環境

```bash
# 建置壓縮版本
npm run build:css

# 這會:
# 1. 移除所有未使用的 CSS 類
# 2. 壓縮 CSS 檔案
# 3. 優化載入速度
```

---

## 🎯 最佳實踐

### 1. 保持組件類的使用
```html
<!-- ✅ 好 - 語義化，易於維護 -->
<div class="message-bubble user-bubble">

<!-- ❌ 避免 - 太長，難以閱讀 -->
<div class="max-w-[85%] px-5 py-4 rounded-[24px] bg-gradient-to-br from-[#FFF7ED] to-[#FFE4C4] border-2 border-[#4A90E2] self-end">
```

### 2. 使用 Tailwind 工具類增強
```html
<!-- ✅ 完美 - 組合使用 -->
<div class="message-bubble user-bubble hover:scale-105 transition-transform">
```

### 3. 使用 CSS 變量保持主題一致
```css
/* ✅ 好 - 使用變量 */
.custom-component {
  color: var(--primary-color);
}

/* ❌ 避免 - 硬編碼顏色 */
.custom-component {
  color: #4A90E2;
}
```

---

## 📊 當前狀態檢查

### 檢查檔案是否存在

```bash
ls -lh static/*.css
```

應該看到:
```
styles.css            (原始檔案)
styles_tailwind.css   (Tailwind 源文件)
styles_compiled.css   (編譯後的檔案) ← 使用這個
```

### 檢查編譯是否成功

```bash
grep -c "\.message-bubble" static/styles_compiled.css
```

如果返回數字 > 0，表示編譯成功！

---

**需要幫助？** 查看 `TAILWIND_FIX_SUMMARY.md` 了解完整技術細節。
