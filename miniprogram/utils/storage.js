/**
 * 存储工具模块
 * 封装所有 wx.Storage 读写操作
 */

const STORAGE_KEYS = {
  WORD_BANK: 'word_bank',
  USER_PROGRESS: 'user_progress',
  DAILY_RECORD: 'daily_record',
  USER_SETTINGS: 'user_settings'
};

// ========== 词库操作 ==========

/**
 * 首次初始化词库到 Storage
 */
function initWordBank(wordList) {
  wx.setStorageSync(STORAGE_KEYS.WORD_BANK, wordList);
}

/**
 * 获取完整词库
 */
function getWordBank() {
  return wx.getStorageSync(STORAGE_KEYS.WORD_BANK) || [];
}

/**
 * 根据 ID 获取单词详情
 */
function getWordById(wordId) {
  const bank = getWordBank();
  return bank.find(w => w.id === wordId) || null;
}

/**
 * 获取词库总大小
 */
function getWordBankSize() {
  const bank = getWordBank();
  return bank.length;
}

/**
 * 词库是否已初始化
 */
function isWordBankReady() {
  const bank = wx.getStorageSync(STORAGE_KEYS.WORD_BANK);
  return bank && bank.length > 0;
}

// ========== 用户进度操作 ==========

/**
 * 获取全部进度 Map
 */
function getProgressMap() {
  return wx.getStorageSync(STORAGE_KEYS.USER_PROGRESS) || {};
}

/**
 * 获取单个单词进度，不存在则返回默认进度
 */
function getProgress(wordId) {
  const progressMap = getProgressMap();
  return progressMap[wordId] || null;
}

/**
 * 获取或创建单词进度
 */
function getOrCreateProgress(wordId) {
  const progressMap = getProgressMap();
  if (!progressMap[wordId]) {
    progressMap[wordId] = {
      wordId: wordId,
      status: 'new',
      consecutiveCorrect: 0,
      totalCorrect: 0,
      totalAttempts: 0,
      lastReviewDate: '',
      nextReviewDate: '',
      reviewStage: 0,
      createdAt: getTodayStr()
    };
    saveProgressMap(progressMap);
  }
  return progressMap[wordId];
}

/**
 * 更新单个单词进度
 */
function updateProgress(wordId, data) {
  const progressMap = getProgressMap();
  progressMap[wordId] = {
    ...(progressMap[wordId] || {}),
    ...data,
    wordId: wordId
  };
  saveProgressMap(progressMap);
  return progressMap[wordId];
}

/**
 * 批量更新进度
 */
function batchUpdateProgress(updates) {
  const progressMap = getProgressMap();
  updates.forEach(({ wordId, data }) => {
    progressMap[wordId] = {
      ...(progressMap[wordId] || {}),
      ...data,
      wordId: wordId
    };
  });
  saveProgressMap(progressMap);
}

function saveProgressMap(progressMap) {
  wx.setStorageSync(STORAGE_KEYS.USER_PROGRESS, progressMap);
}

// ========== 每日记录操作 ==========

/**
 * 获取每日记录 Map
 */
function getDailyRecordMap() {
  return wx.getStorageSync(STORAGE_KEYS.DAILY_RECORD) || {};
}

/**
 * 获取指定日期的学习记录
 */
function getDailyRecord(date) {
  const recordMap = getDailyRecordMap();
  return recordMap[date] || null;
}

/**
 * 获取或创建每日记录
 */
function getOrCreateDailyRecord(date) {
  const recordMap = getDailyRecordMap();
  if (!recordMap[date]) {
    recordMap[date] = {
      date: date,
      wordsStudied: [],
      newWords: 0,
      reviewWords: 0,
      completed: false
    };
    wx.setStorageSync(STORAGE_KEYS.DAILY_RECORD, recordMap);
  }
  return recordMap[date];
}

/**
 * 更新每日学习记录
 */
function updateDailyRecord(date, data) {
  const recordMap = getDailyRecordMap();
  recordMap[date] = {
    ...(recordMap[date] || { date: date, wordsStudied: [], newWords: 0, reviewWords: 0, completed: false }),
    ...data,
    date: date
  };
  wx.setStorageSync(STORAGE_KEYS.DAILY_RECORD, recordMap);
  return recordMap[date];
}

// ========== 设置操作 ==========

const DEFAULT_SETTINGS = {
  dailyWordCount: 30,
  newWordRatio: 0.3,
  correctThreshold: 3
};

/**
 * 获取用户设置
 */
function getSettings() {
  const settings = wx.getStorageSync(STORAGE_KEYS.USER_SETTINGS);
  if (!settings) {
    wx.setStorageSync(STORAGE_KEYS.USER_SETTINGS, DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS };
  }
  return { ...DEFAULT_SETTINGS, ...settings };
}

/**
 * 更新用户设置
 */
function updateSettings(data) {
  const settings = getSettings();
  const newSettings = { ...settings, ...data };
  wx.setStorageSync(STORAGE_KEYS.USER_SETTINGS, newSettings);
  return newSettings;
}

// ========== 打卡相关 ==========

/**
 * 计算连续打卡天数
 * 从今天往前推，检查每天是否有 completed=true 的记录
 */
function getStreakDays() {
  const recordMap = getDailyRecordMap();
  const today = new Date();
  let streak = 0;

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = formatDate(checkDate);

    if (i === 0) {
      // 今天算当天，如果完成了则计数
      const record = recordMap[dateStr];
      if (record && record.completed) {
        streak++;
      } else {
        break;
      }
    } else {
      const record = recordMap[dateStr];
      if (record && record.completed) {
        streak++;
      } else {
        break;
      }
    }
  }

  return streak;
}

// ========== 工具函数 ==========

/**
 * 获取今天日期字符串 YYYY-MM-DD
 */
function getTodayStr() {
  return formatDate(new Date());
}

/**
 * 格式化日期
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 日期字符串转 Date 对象
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * 清理旧数据（30天前的每日记录）
 */
function cleanOldRecords() {
  const recordMap = getDailyRecordMap();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffStr = formatDate(thirtyDaysAgo);

  let cleaned = false;
  Object.keys(recordMap).forEach(date => {
    if (date < cutoffStr) {
      delete recordMap[date];
      cleaned = true;
    }
  });

  if (cleaned) {
    wx.setStorageSync(STORAGE_KEYS.DAILY_RECORD, recordMap);
  }
}

module.exports = {
  // 词库
  initWordBank,
  getWordBank,
  getWordById,
  getWordBankSize,
  isWordBankReady,
  // 进度
  getProgressMap,
  getProgress,
  getOrCreateProgress,
  updateProgress,
  batchUpdateProgress,
  // 每日记录
  getDailyRecordMap,
  getDailyRecord,
  getOrCreateDailyRecord,
  updateDailyRecord,
  // 设置
  getSettings,
  updateSettings,
  // 打卡
  getStreakDays,
  // 工具
  getTodayStr,
  formatDate,
  parseDate,
  cleanOldRecords,
  STORAGE_KEYS
};
