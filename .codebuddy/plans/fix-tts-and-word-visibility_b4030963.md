---
name: fix-tts-and-word-visibility
overview: 修复语音播报无声 bug（改用微信同声传译插件），并调整单词展示时机：播放完只展示选项，选择答案后才展示单词原文。
todos:
  - id: add-plugin-config
    content: 在 app.json 中添加 WechatSI 插件声明
    status: completed
  - id: replace-tts-logic
    content: 重写 index.js TTS 逻辑：用 plugin.textToSpeech + InnerAudioContext 替换 wx.createSpeechSynthesizer，调整 _playWord/replayWord/_loadCurrentWord/onUnload
    status: completed
    dependencies:
      - add-plugin-config
  - id: fix-word-display-timing
    content: 修改 index.wxml 单词文字展示条件：从随 wordVisible 显示改为随 answered 显示
    status: completed
    dependencies:
      - replace-tts-logic
---

## 问题描述

两个问题需要修复：

1. **TTS 无声 Bug**

- 现象：语音播放时听不到任何声音
- 根因：`wx.createSpeechSynthesizer()` 不是微信小程序原生 API，调用后静默失败，无任何音频输出

2. **单词展示时机不正确**

- 当前行为：语音播放完毕后立即展示单词文字 + 选项
- 期望行为：语音播放完毕后只展示 4 个选项（单词文字保持隐藏），用户选择答案后才展示单词原文

## 核心功能

- 使用微信同声传译插件 WechatSI 实现真实可听的 TTS 语音播放
- 听音阶段：喇叭动画 + "正在朗读单词..." + 重播按钮
- 答题阶段：仅显示 4 个中文释义选项，单词文字隐藏
- 作答后：显示单词原文（带淡入动画）、正确答案高亮、错误选项标红
- 0.8 秒后自动进入下一题，状态重置

## 技术栈

- **语音合成**：微信同声传译插件 WechatSI `textToSpeech` API（version 0.0.7）
- **音频播放**：`wx.createInnerAudioContext()` 播放插件生成的临时音频文件
- **语言参数**：`lang: 'en_US'`（英文美式发音）
- **限制**：单次合成上限 50 字符，英语单词均在限制内

## 实现方案

### 语音播放流程（修复 Bug）

```
加载单词 → plugin.textToSpeech({ lang: 'en_US', content: word })
→ success → 获取 res.filename
→ wx.createInnerAudioContext() 设置 src 并 play()
→ onEnded → wordVisible: true（显示选项）
→ fail/fallback → 直接 wordVisible: true（不阻断流程）
```

### 状态管理

新增 `_audioCtx` 实例属性管理音频上下文，替代原来的 `_synth`：

- `_loadCurrentWord()`：停止旧音频，重置所有状态（`answered: false, wordVisible: false, voicePlaying: false`），调用 `_playWord()`
- `_playWord()`：调 `plugin.textToSpeech()` 合成音频 → 成功后创建 `InnerAudioContext` 播放 → `onEnded` 回调设置 `wordVisible: true`（仅显示选项）
- `_showWord()` 语义不变：设置 `wordVisible: true, voicePlaying: false`
- `onSelectOption()`：保留 `if (!this.data.wordVisible) return;` 守卫，设置 `answered: true` 后 WXML 自动展示单词文字
- `replayWord()`：停止旧音频，重新合成 + 播放
- `onUnload()`：销毁 `InnerAudioContext`，释放资源

### WXML 条件调整

单词文字展示条件从 `wx:else`（随 `wordVisible` 显示）改为 `wx:if="{{answered}}"`：

```xml
<!-- 听音状态 -->
<view class="listening-area" wx:if="{{!wordVisible}}">...</view>

<!-- 选项区域：wordVisible 时展示 -->
<view class="options-grid" wx:if="{{wordVisible && options.length > 0}}">...</view>

<!-- 单词文字：answered 时展示 -->
<view class="word-text fade-in" wx:if="{{answered}}">{{currentWord.word}}</view>
<view class="phonetic-text fade-in" wx:if="{{answered && currentWord.phonetic}}">{{currentWord.phonetic}}</view>
<view class="replay-mini-btn" bindtap="replayWord" wx:if="{{!answered}}">🔊</view>
```

## 实现细节

### 插件配置

`app.json` 中新增：

```
"plugins": {
  "WechatSI": {
    "version": "0.0.7",
    "provider": "wx069ba97219f66d99"
  }
}
```

### 音频资源管理

- 每次 `_loadCurrentWord()` 调用前，先 `this._audioCtx.stop()` + `this._audioCtx.destroy()` 释放上一个实例
- `onUnload()` 中再次 `stop()` + `destroy()` 兜底
- 插件 `textToSpeech` 生成的临时文件由微信管理，不需手动清理

### 错误处理

- `requirePlugin('WechatSI')` 失败 → `plugin = null`，跳过语音直接显示选项
- `textToSpeech` fail → 直接显示选项，不阻断背单词流程
- 单词不含英文字母 → 跳过语音直接显示选项
- `InnerAudioContext.onError` → 忽略，正常显示选项

## 目录结构

```
miniprogram/
├── app.json                        # [MODIFY] 新增 plugins 配置段
└── pages/
    └── study/
        ├── index.js                # [MODIFY] 替换 TTS 实现，调整状态逻辑
        ├── index.wxml              # [MODIFY] 单词文字条件改为 answered
        └── index.wxss              # [MODIFY] 无需改动，现有样式满足需求
```

## 关键代码结构

### index.js 核心方法签名

```js
// 新增实例属性
_plugin: null,   // WechatSI 插件实例
_audioCtx: null, // InnerAudioContext 音频播放实例

// 新增/修改方法
_playWord()       // 调用 plugin.textToSpeech → InnerAudioContext.play
_replayWord()     // 停止旧音频 → 重新合成播放（替代原 replayWord）
_speakAudio(filename) // 创建/复用 InnerAudioContext 播放指定音频文件
_stopAudio()      // 停止并销毁当前音频实例

// 保持不变的方法
_loadCurrentWord() // 在 setData 回调中调用 _playWord
_showWord()       // 设置 wordVisible: true（仅显示选项）
onSelectOption()  // 保留 !wordVisible 守卫
```