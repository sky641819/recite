---
name: switch-to-youdao-tts-with-cache
overview: 移除 WechatSI 插件，改用有道词典发音 API 实现单词朗读，并加入本地缓存避免高频调用被封禁。
todos:
  - id: remove-plugin-config
    content: 从 app.json 移除 WechatSI 插件声明
    status: completed
  - id: rewrite-tts-cache
    content: 改写 index.js：移除插件初始化，用有道 API + 本地文件缓存实现 _playWord / replayWord，保留 _speakAudio / _stopAudio
    status: completed
    dependencies:
      - remove-plugin-config
---

## 用户需求

个人主体微信小程序不支持添加同声传译插件，需替换为有道词典发音 API 方案，并加入本地文件缓存，避免频繁请求被服务端封禁。

## 产品概述

背单词小程序学习中，每个单词加载时自动播放真人发音，用户可重播。发音源从同声传译插件切换为有道词典发音 API，首次下载后缓存到本地，后续同单词直接使用缓存音频。

## 核心功能

- 单词加载时自动播放美式发音
- 发音播放完成后再展示选项，避免用户提前看到单词
- 支持重播按钮随时重复播放
- 音频文件本地缓存：首次下载保存到用户缓存目录，后续命中直接播放，减少 API 请求
- 缓存容错：网络失败/下载失败时静默降级，直接展示选项不阻塞学习流程

## 技术栈

- 小程序框架：微信原生（Components + Page）
- 音频播放：`wx.createInnerAudioContext()`
- 文件下载：`wx.downloadFile()`
- 文件管理：`wx.getFileSystemManager()`
- 发音 API：`https://dict.youdao.com/dictvoice?audio=${word}&type=2`

## 实现方案

### 整体策略

将原有「插件 TTS → 临时音频文件播放」的双步流程，替换为「本地缓存检查 → 命中直接播放 / 未命中 → 下载 → 缓存 → 播放」的新流程。`_speakAudio` 和 `_stopAudio` 方法保留复用，仅改写播放入口。

### 缓存机制设计

**缓存目录**：`${wx.env.USER_DATA_PATH}/tts_cache/`，首次使用时通过 `FileSystemManager.mkdir()` 创建。

**缓存键**：`${encodeURIComponent(word)}.mp3`，同一单词不同发音类型可独立缓存。

**缓存流程**：

```
播放请求 → fs.access(cachePath)
  ├─ 命中 → 直接播放 cachePath
  └─ 未命中 → wx.downloadFile(apiUrl)
       ├─ 成功 → fs.saveFile(tempPath, cachePath) → 播放
       └─ 失败 → 静默降级，直接展示选项
```

**缓存周期**：不做主动清理。单文件 ~5KB，5000 词最多 ~25MB，在用户缓存目录容量内。

### 接口调用频率控制

- 每个单词仅在首次遇到时触发一次 API 下载，之后全部命中缓存
- 用户一天学习 30 个新词 + 若干复习词，单日新下载量约 10-30 次
- 复习词 100% 命中缓存，不产生额外请求

### 降级链路

```
含英文字母 → cache 命中 → 播放 → (结束/失败) → _showWord()
          → cache 未命中 → download → 成功 → save → 播放 → (结束/失败) → _showWord()
                         → download 失败 → 静默 → _showWord()
不含英文字母 → 直接 _showWord()
```

所有路径最终都保证 `_showWord()` 被调用，单词和选项最终一定可见。

## 实现说明

### 改动范围

仅 2 个文件，wxml/wxss 无变动：

```
miniprogram/
├── app.json                       # [MODIFY] 移除 WechatSI 插件声明（第 34-39 行）
└── pages/study/index.js           # [MODIFY] 替换 TTS 逻辑，加入缓存
```

### 关键实现要点

**`app.json` 改动**：删除 `"plugins"` 整个字段块。

**`index.js` 改动**：

1. `onLoad`：移除 `_plugin` 初始化代码，新增 `_initCache()` 确保缓存目录存在
2. `_playWord`：按缓存优先流程重写，不再依赖 `_plugin`
3. `replayWord`：改为直接传入缓存路径的轻量播放（无需重复下载）
4. `_speakAudio`：**保留**，仍用 `InnerAudioContext` 播放，接收 `src` 路径
5. `_stopAudio`：**保留**，无变化
6. `onUnload`：移除 `this._plugin = null`，保留 `_stopAudio()`

**性能**：缓存命中时无网络 IO，直接本地文件播放，延迟在 50ms 以内。

**日志**：下载失败时用 `console.warn` 记录单词和错误信息，不打印全量 payload。