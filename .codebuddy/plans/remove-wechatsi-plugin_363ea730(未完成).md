---
name: remove-wechatsi-plugin
overview: 移除 WechatSI 插件配置，TTS 回退到原生 wx.createSpeechSynthesizer() API，恢复模拟器可用性。
todos:
  - id: remove-plugin-config
    content: 从 app.json 移除 WechatSI 插件声明
    status: pending
  - id: revert-tts-logic
    content: 将 index.js 中所有插件 TTS 逻辑回退为 wx.createSpeechSynthesizer 原生 API，移除 _speakAudio 和 _stopAudio 方法
    status: pending
    dependencies:
      - remove-plugin-config
---

## 用户需求

移除同声传译插件，回退到微信原生 `wx.createSpeechSynthesizer()` API 实现 TTS 语音播放。原因是同声传译插件仅支持正式发布版，模拟器无法使用，导致编译启动失败（"插件未授权使用"错误）。

## 核心改动

1. 从 `app.json` 中移除 WechatSI 插件声明
2. 将 `index.js` 中所有插件 TTS 逻辑回退为 `wx.createSpeechSynthesizer()` 原生 API
3. 移除不再需要的 `_speakAudio`、`_stopAudio` 辅助方法及相关实例变量
4. 保留已完成的单词展示时机修复（`answered` 控制）和样式修复（`position: relative`）

## 技术方案

### 改动范围

仅涉及 2 个文件：`app.json` 和 `pages/study/index.js`。`index.wxml` 和 `index.wxss` 无需变动。

### 实现策略

将插件双步调用（`plugin.textToSpeech` → `InnerAudioContext.play`）替换为原生单步调用（`wx.createSpeechSynthesizer().speak`），逻辑更简洁，无中间音频文件依赖。

### 关键设计点

**初始化（onLoad）**：用 try-catch 包裹 `wx.createSpeechSynthesizer()`，创建失败时 `this._synth = null`，后续所有 TTS 调用点自动降级为直接展示选项。

**播放（_playWord / replayWord）**：调用 `this._synth.speak({ text, lang: 'en-US' })`，在 `success`、`fail`、`complete` 三个回调中均兜底调用 `_showWord()`，确保无论 API 行为如何，选项最终都会展示。

**资源释放（onUnload）**：调用 `this._synth.stop()` + `this._synth.destroy()` 释放合成器资源。

**切换单词（_loadCurrentWord）**：加载新单词前调用 `this._synth?.stop()` 中断上一轮可能未结束的语音。

### 兜底链路

```
含英文字母 → synth 可用 → synth.speak() → 成功/失败/完成 → _showWord()
            → synth 不可用 → 直接 _showWord()
不含英文字母 → 直接 _showWord()
```