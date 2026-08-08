---
name: manual-nav-no-auto-advance
overview: 移除答题自动跳转，改为上一词/下一词手动导航，答错后停留在当前页面。
todos:
  - id: remove-auto-advance
    content: index.js：删除 onSelectOption 中的 setTimeout 自动跳转，引入 _poolIdx + _answerMap 机制，添加幂等统计判断
    status: completed
  - id: rewrite-load-word
    content: index.js：改写 _loadCurrentWord 支持已答单词状态恢复，新增 goToPrevWord / goToNextWord 方法
    status: completed
    dependencies:
      - remove-auto-advance
  - id: add-nav-ui
    content: index.wxml 新增导航栏，index.wxss 新增导航按钮样式
    status: completed
    dependencies:
      - rewrite-load-word
---

## 用户需求

答题后（无论对错）停留在当前页面不自动跳转。新增底部"上一个/下一个"导航按钮，由用户完全手动控制单词切换。回退到已答单词时恢复答题状态（单词可见、选项保持选中高亮）。

## 核心功能

- 移除答题后 800ms 自动跳转逻辑
- 新增底部导航栏：上一个按钮 + 下一个按钮
- 首个单词时"上一个"不可用；最后一个单词已答时"下一个"变为"完成"
- 回退到已答单词：直接展示结果状态（单词文字可见、选项正确/错误高亮），不重播音频
- 已答单词回退时不再重复累计统计数据
- 未答题时"下一个"按钮不可用

## 技术方案

### 改动范围

3 个文件：`pages/study/index.js`、`pages/study/index.wxml`、`pages/study/index.wxss`

### 核心逻辑变更

**索引追踪重构**：引入 `this._poolIdx`（0-based）替代 `data.currentIndex` 的隐式用法。`data.currentIndex` 仅作展示（值 = `_poolIdx + 1`）。

**答题状态持久化**：新增 `this._answerMap = {}` （key 为 wordId，value 为 `{ selectedOptionId, isCorrect }`）。用于：

1. 回退到已答单词时恢复状态
2. 重复统计拦截：`_answerMap` 中已存在的 wordId 跳过 `_stats` 累加和进度更新

### index.js 改动明细

| 位置 | 操作 |
| --- | --- |
| `onLoad` | 新增 `this._poolIdx = 0`、`this._answerMap = {}` |
| `_loadCurrentWord` | 优先检查 `_answerMap[wordId]`：若存在则跳过音频播放，直接恢复 `answered/selectedOptionId/isCorrect/wordVisible` 状态；`data.currentIndex` 设置为 `this._poolIdx + 1` |
| `onSelectOption` | 删除 `setTimeout` 自动跳转块；答题成功后写入 `_answerMap`；统计更新加幂等判断（`_answerMap` 不存在时才累加） |
| 新增 `goToPrevWord` | `_poolIdx--` → `_loadCurrentWord()` |
| 新增 `goToNextWord` | `_poolIdx++` → 若 `_poolIdx >= pool.length` 则调 `_onComplete()`，否则 `_loadCurrentWord()` |


### index.wxml 改动

在 `options-grid` 下方新增导航栏，`wx:if="{{wordVisible}}"` 控制显隐：

- "上一个"按钮：`disabled="{{poolIdx <= 0}}"`（`poolIdx` 需传入 data）
- "下一个"按钮：文案绑定 `{{isLastWord && answered ? '完成' : '下一个'}}`，`disabled="{{!answered}}"`

### index.wxss 改动

新增 `.nav-bar`（flex 布局左右均分）、`.nav-btn`（禁用/启用态样式，延续紫色渐变主题）。

### 数据流

```
用户答题 → 写入 _answerMap → 按钮启用 → 用户点"下一个" → _poolIdx++ → _loadCurrentWord → 新词播放音频 / 旧词恢复状态
用户回退 → 点"上一个" → _poolIdx-- → _loadCurrentWord → 命中 _answerMap → 直接展示结果
```