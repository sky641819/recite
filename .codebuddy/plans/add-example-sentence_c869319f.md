---
name: add-example-sentence
overview: 在背单词页面增加例句展示区域，通过有道词典 API 获取例句并缓存，点击可播放例句语音。
design:
  styleKeywords:
    - 现代简约
    - 渐变蓝紫
    - 圆角卡片
    - 微动效
    - 毛玻璃
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 48rpx
      weight: 700
    subheading:
      size: 32rpx
      weight: 500
    body:
      size: 28rpx
      weight: 400
  colorSystem:
    primary:
      - "#6C5CE7"
      - "#A29BFE"
      - "#4834D4"
    background:
      - "#F5F3FF"
      - "#FFFFFF"
      - "#EDE9FE"
    text:
      - "#2D2B3D"
      - "#6B6880"
      - "#A09DB5"
    functional:
      - "#00C48C"
      - "#FF6B6B"
      - "#FFA62E"
      - "#6C5CE7"
todos:
  - id: create-youdao-util
    content: 新建 utils/youdao.js，实现 fetchSentence 和 getCachedSentence（调用有道 JSON API 解析中英例句并缓存）
    status: completed
  - id: add-sentence-logic
    content: 修改 index.js：新增 sentence 相关 data 字段，实现 _loadSentence 异步加载和 playSentence 播放方法，在 _loadCurrentWord 中触发例句加载
    status: completed
    dependencies:
      - create-youdao-util
  - id: add-sentence-ui
    content: 修改 index.wxml：在单词卡片音标行下方增加例句展示区（播放按钮 + 英文例句 + 中文翻译，answered 时显示）
    status: completed
    dependencies:
      - add-sentence-logic
  - id: add-sentence-style
    content: 修改 index.wxss：新增例句区域样式，延续紫色渐变主题风格
    status: completed
    dependencies:
      - add-sentence-ui
---

## 用户需求

在 study（背单词）页面增加例句展示功能，用户答题后显示当前单词的中英双语例句，点击例句可播放英文例句音频。

## 核心功能

- **例句实时获取**：通过有道词典 API 查询当前单词的中英双语例句
- **例句展示**：答题后在单词卡片内展示例句（英文 + 中文翻译），与单词文字同时出现
- **例句播放**：点击例句区域的播放按钮，通过有道 TTS 朗读英文例句
- **本地缓存**：例句文本和例句音频均缓存到本地，避免重复请求，无网络时仍可展示已有数据
- **优雅降级**：当单词无例句返回时，不显示例句区域，不影响正常答题流程

## 技术方案

### 有道 API 接入

#### 例句查询

- **接口**：`https://dict.youdao.com/jsonapi?q={word}`
- **解析路径**：响应 JSON 中 `ec.exam_type[*].sentences[*]` 数组，取 `${sContent}`（英文）和 `${cCont}`（中文）
- **缓存策略**：以 `sentence_cache_{word}` 为 key 存入 `wx.Storage`，永久有效
- **请求方式**：`wx.request` GET，不阻塞单词加载流程

#### 例句音频

- **接口**：`https://dict.youdao.com/dictvoice?audio={encodeURIComponent(englishSentence)}&type=2`
- **缓存路径**：`{USER_DATA_PATH}/tts_cache/sent_{encodeURIComponent(word)}.mp3`（与单词 TTS 共享同一缓存目录，通过前缀区分）
- **播放方式**：复用现有 `_speakAudio(cachePath)` 方法，独立管理 `playingSentence` 状态

### 模块拆分

#### 新增 utils/youdao.js

- `fetchSentence(word)` - 调用有道 API 获取例句，解析并缓存
- `getCachedSentence(word)` - 读取本地缓存的例句

#### 修改 pages/study/index.js

- 新增 data 字段：`sentence`、`sentenceMeaning`、`playingSentence`
- 新增 `_loadSentence(word)` - 异步加载例句（缓存优先，API 兜底）
- 新增 `playSentence()` - 播放英文例句音频（复用现有 `_getCachePath` 前缀区分 + `_speakAudio`）
- 修改 `_stopAudio()` - 停止播放时同时重置 `playingSentence`
- 修改 `_loadCurrentWord()` - 在每次加载单词时触发 `_loadSentence`
- 修改 `onUnload()` - 确保例句音频停止

#### 修改 pages/study/index.wxml

- 在单词卡片内、音标行下方，新增例句展示区（`answered && sentence` 时显示）
- 例句区包含：播放按钮 + 英文学例句 + 中文翻译

#### 修改 pages/study/index.wxss

- 新增 `.sentence-area` / `.sentence-play-btn` / `.sentence-en` / `.sentence-cn` 样式
- 延续紫色渐变主题风格，与现有单词卡片设计一致

### 数据流

```
_loadCurrentWord()
  └─ setData({ wordVisible: false, sentence: null })  // 重置例句
  └─ _loadSentence(word)  // 异步不阻塞
       ├─ 缓存命中 → setData({ sentence, sentenceMeaning })
       └─ 缓存未命中 → wx.request → 解析 → 缓存 → setData

用户答题 → answered=true → 单词文字 + 例句同时 show（fade-in 动画）
用户点击播放 → playSentence() → TTS 下载/缓存 → _speakAudio(cachePath)
```

### 缓存隔离

| 类型 | 缓存路径 | Storage Key |
| --- | --- | --- |
| 单词 TTS | `tts_cache/{encodeURIComponent(word)}.mp3` | - |
| 例句 TTS | `tts_cache/sent_{encodeURIComponent(word)}.mp3` | - |
| 例句文本 | - | sentence_cache_{word} |