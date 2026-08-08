// pages/study/index.js
const storage = require('../../utils/storage');
const algorithm = require('../../utils/algorithm');

Page({
  data: {
    currentWord: null,          // 当前单词
    options: [],                // 选项列表
    currentIndex: 0,            // 当前第几题（从1开始）
    totalCount: 0,              // 总题数
    progressPercent: 0,         // 进度百分比
    selectedOptionId: null,     // 用户选中的选项
    answered: false,            // 是否已答题
    isCorrect: false,           // 是否答对
    showCompleteModal: false,   // 完成弹窗
    wordVisible: false,         // 单词和选项是否可见
    voicePlaying: false,        // 语音是否正在播放
    poolIdx: 0,                 // 当前在池中的位置（0-based）
    isLastWord: false,          // 是否为最后一个单词
    stats: {                    // 完成统计
      correct: 0,
      wrong: 0,
      newWords: 0,
      reviewWords: 0
    }
  },

  onLoad() {
    const settings = storage.getSettings();
    const pool = algorithm.buildDailyWordPool(
      settings.dailyWordCount,
      settings.newWordRatio
    );

    if (pool.length === 0) {
      wx.showModal({
        title: '提示',
        content: '今日没有需要学习的单词，请确认设置或明天再来~',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }

    this._pool = pool;
    this._poolIdx = 0;
    this._answerMap = {};
    this._stats = { correct: 0, wrong: 0, newWords: 0, reviewWords: 0 };

    this._audioCtx = null;
    this._initCacheDir();

    this.setData({ totalCount: pool.length });
    this._loadCurrentWord();
  },

  onUnload() {
    // 停止并销毁音频播放器
    this._stopAudio();
  },

  /** 加载当前单词 */
  _loadCurrentWord() {
    const pool = this._pool;
    const idx = this._poolIdx;

    if (idx >= pool.length) {
      this._onComplete();
      return;
    }

    // 停止上一次可能还在播放的语音
    this._stopAudio();

    const wordId = pool[idx];
    const word = storage.getWordById(wordId);
    if (!word) {
      this._poolIdx++;
      this._loadCurrentWord();
      return;
    }

    // 检查是否已答过
    const prevAnswer = this._answerMap[wordId];

    // 生成选项
    const options = algorithm.generateOptions(wordId, [], 3);

    const isLast = idx >= pool.length - 1;

    if (prevAnswer) {
      // 已答过的单词：直接恢复状态，不播放音频
      this.setData({
        currentWord: word,
        options: options,
        currentIndex: idx + 1,
        poolIdx: idx,
        isLastWord: isLast,
        progressPercent: Math.floor((idx / pool.length) * 100),
        selectedOptionId: prevAnswer.selectedOptionId,
        answered: true,
        isCorrect: prevAnswer.isCorrect,
        wordVisible: true,
        voicePlaying: false
      });
    } else {
      this.setData({
        currentWord: word,
        options: options,
        currentIndex: idx + 1,
        poolIdx: idx,
        isLastWord: isLast,
        progressPercent: Math.floor((idx / pool.length) * 100),
        selectedOptionId: null,
        answered: false,
        isCorrect: false,
        wordVisible: false,
        voicePlaying: false
      }, () => {
        this._playWord();
      });
    }
  },

  /** 播放当前单词语音（有道词典发音 + 本地缓存） */
  _playWord() {
    const word = this.data.currentWord;
    if (!word || !word.word) {
      this._showWord();
      return;
    }

    // 单词不含英文字母时跳过语音
    if (!/[a-zA-Z]/.test(word.word)) {
      this._showWord();
      return;
    }

    this.setData({ voicePlaying: true });

    const fs = wx.getFileSystemManager();
    const cachePath = this._getCachePath(word.word);

    // 优先检查本地缓存
    try {
      fs.accessSync(cachePath);
      this._speakAudio(cachePath);
      return;
    } catch (_) {
      // 缓存未命中，走下载流程
    }

    const apiUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word.word)}&type=2`;

    wx.downloadFile({
      url: apiUrl,
      success: (res) => {
        if (res.statusCode === 200) {
          try {
            fs.saveFileSync(res.tempFilePath, cachePath);
            this._speakAudio(cachePath);
          } catch (err) {
            console.warn('TTS 缓存失败', word.word, err);
            this._speakAudio(res.tempFilePath);
          }
        } else {
          console.warn('TTS 下载异常', word.word, res.statusCode);
          this._onAudioSkip();
        }
      },
      fail: (err) => {
        console.warn('TTS 下载失败', word.word, err);
        this._onAudioSkip();
      }
    });
  },

  /** 播放音频文件 */
  _speakAudio(filename) {
    this._stopAudio();

    const audioCtx = wx.createInnerAudioContext();
    audioCtx.src = filename;
    this._audioCtx = audioCtx;

    audioCtx.onEnded(() => {
      if (!this.data.wordVisible) {
        this._showWord();
      }
      this.setData({ voicePlaying: false });
    });

    audioCtx.onError((err) => {
      console.warn('音频播放失败', err);
      if (!this.data.wordVisible) {
        this._showWord();
      }
      this.setData({ voicePlaying: false });
    });

    audioCtx.play();
  },

  /** 停止并销毁当前音频实例 */
  _stopAudio() {
    if (this._audioCtx) {
      try {
        this._audioCtx.stop();
        this._audioCtx.destroy();
      } catch (e) {
        // ignore
      }
      this._audioCtx = null;
    }
  },

  /** 初始化 TTS 缓存目录 */
  _initCacheDir() {
    const fs = wx.getFileSystemManager();
    const cacheDir = `${wx.env.USER_DATA_PATH}/tts_cache`;
    try {
      fs.accessSync(cacheDir);
    } catch (_) {
      try {
        fs.mkdirSync(cacheDir, true);
      } catch (err) {
        console.warn('TTS 缓存目录创建失败', err);
      }
    }
  },

  /** 获取单词的缓存文件路径 */
  _getCachePath(word) {
    return `${wx.env.USER_DATA_PATH}/tts_cache/${encodeURIComponent(word)}.mp3`;
  },

  /** 音频跳过（下载失败时）静默展示单词 */
  _onAudioSkip() {
    if (!this.data.wordVisible) {
      this._showWord();
    }
    this.setData({ voicePlaying: false });
  },

  /** 展示单词和选项 */
  _showWord() {
    this.setData({
      wordVisible: true,
      voicePlaying: false
    });
  },

  /** 重播语音（优先使用缓存） */
  replayWord() {
    if (!this.data.currentWord || !this.data.currentWord.word) return;
    if (!/[a-zA-Z]/.test(this.data.currentWord.word)) return;

    this._stopAudio();
    this.setData({ voicePlaying: true });

    const fs = wx.getFileSystemManager();
    const cachePath = this._getCachePath(this.data.currentWord.word);

    try {
      fs.accessSync(cachePath);
      this._speakAudio(cachePath);
    } catch (_) {
      // 缓存意外缺失，重新下载
      const apiUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(this.data.currentWord.word)}&type=2`;

      wx.downloadFile({
        url: apiUrl,
        success: (res) => {
          if (res.statusCode === 200) {
            try {
              fs.saveFileSync(res.tempFilePath, cachePath);
              this._speakAudio(cachePath);
            } catch (err) {
              console.warn('TTS 重播缓存失败', err);
              this._speakAudio(res.tempFilePath);
            }
          } else {
            this.setData({ voicePlaying: false });
          }
        },
        fail: (err) => {
          console.warn('TTS 重播下载失败', err);
          this.setData({ voicePlaying: false });
        }
      });
    }
  },

  /** 用户选择答案 */
  onSelectOption(e) {
    if (this.data.answered) return;
    if (!this.data.wordVisible) return;

    const option = e.currentTarget.dataset.option;
    const isCorrect = option.isCorrect;

    const wordId = this.data.currentWord.id;

    // 保存答题记录，用于回退时恢复状态
    this._answerMap[wordId] = {
      selectedOptionId: option.wordId,
      isCorrect: isCorrect
    };

    this.setData({
      selectedOptionId: option.wordId,
      answered: true,
      isCorrect: isCorrect
    });

    // 更新统计和进度
    if (isCorrect) {
      this._stats.correct++;
    } else {
      this._stats.wrong++;
    }

    const progress = storage.getOrCreateProgress(wordId);
    const settings = storage.getSettings();

    if (progress.status === 'new') {
      this._stats.newWords++;
    } else {
      this._stats.reviewWords++;
    }

    const newProgress = algorithm.updateAfterAnswer(progress, isCorrect, settings.correctThreshold);
    storage.updateProgress(wordId, newProgress);
  },

  /** 上一个单词 */
  goToPrevWord() {
    if (this._poolIdx <= 0) return;
    this._poolIdx--;
    this._loadCurrentWord();
  },

  /** 下一个单词 */
  goToNextWord() {
    if (!this.data.answered) return;
    const nextIdx = this._poolIdx + 1;
    if (nextIdx >= this._pool.length) {
      this._onComplete();
    } else {
      this._poolIdx = nextIdx;
      this._loadCurrentWord();
    }
  },

  /** 完成时处理 */
  _onComplete() {
    const today = storage.getTodayStr();
    const dailyRecord = storage.getOrCreateDailyRecord(today);

    storage.updateDailyRecord(today, {
      ...dailyRecord,
      wordsStudied: [...new Set([...dailyRecord.wordsStudied, ...this._pool])],
      newWords: dailyRecord.newWords + this._stats.newWords,
      reviewWords: dailyRecord.reviewWords + this._stats.reviewWords,
      completed: true
    });

    this.setData({
      showCompleteModal: true,
      stats: this._stats
    });
  },

  /** 弹窗确认，返回首页 */
  onConfirmComplete() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
