---
name: add-tts-to-study
overview: 在背诵页集成微信内置 SpeechSynthesizer，默认先播放语音隐藏单词，语音播完后再展示单词文字和选项，用户也可手动点「显示单词」跳过等待。
todos:
  - id: update-study-js
    content: 修改 pages/study/index.js：新增 SpeechSynthesizer 初始化、播放/停止逻辑、wordVisible 状态控制、重播方法、卸载销毁
    status: completed
  - id: update-study-wxml
    content: 修改 pages/study/index.wxml：单词文字条件渲染、新增语音播放按钮、听音提示占位、选项区域条件显示
    status: completed
    dependencies:
      - update-study-js
  - id: update-study-wxss
    content: 修改 pages/study/index.wxss：新增播放按钮样式、听音状态动画、单词淡入效果
    status: completed
    dependencies:
      - update-study-wxml
---

## 用户需求

在背诵页加入微信内置语音合成功能，实现"先听音再拼词"的交互流程：

- 进入单词时默认**不展示**单词文字
- 自动调用 SpeechSynthesizer 播放英语读音
- 语音播放完毕后才显示单词文字和4个选项
- 支持手动点击重播按钮再次播放语音

## 核心功能

- 语音自动播放：加载单词后自动 TTS 朗读（lang: en-US）
- 单词延迟展示：wordVisible 状态控制文字和选项的显示时机
- 重播按钮：播放中/播放后均可点击重播按钮再次听音
- 淡入动画：单词和选项显示时带渐变效果

## 技术方案

### 技术选型

- **语音合成**：`wx.createSpeechSynthesizer()`，微信基础库 2.20.1 原生支持，免费
- **语言参数**：`lang: 'en-US'` 确保英语发音质量

### 实现策略

**修改 `_loadCurrentWord()` 流程**：

```
当前流程：加载单词 → setData(word + options) → 等待用户选择
新流程：加载单词 → setData(wordVisible:false, word + options) → 自动 playWord() → onComplete → setData(wordVisible:true)
```

**SpeechSynthesizer 生命周期**：

- `onReady` 中创建实例（全局复用），`onUnload` 中销毁
- 每次 `_loadCurrentWord` 调用时，先 `stop()` 上一次播放，再 `speak()` 新单词
- `speak()` 的 `success`/`complete` 回调中设置 `wordVisible: true`

**状态管理**（新增 data 字段）：

- `wordVisible: false` — 单词文字与选项是否可见
- `voicePlaying: false` — 语音是否正在播放中
- `wordCardHidden: true` — 卡片是否处于隐藏（纯听音）状态

### 关键边界处理

- **换题时**：下一题加载前自动 stop 上一题尚未播完的语音
- **页面卸载时**：`onUnload` 中调用 `synth.destroy()` 释放资源
- **API 不可用时**：catch 错误，直接 fallback 显示单词（不阻断背单词流程）
- **单词不含字母时**：跳过语音，直接显示