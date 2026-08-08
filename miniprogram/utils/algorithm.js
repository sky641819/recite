/**
 * 算法工具模块
 * 艾宾浩斯间隔计算、每日单词池构建、干扰选项生成
 */

const storage = require('./storage');

// 艾宾浩斯复习间隔（天）
const EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 15, 30];

/**
 * 根据复习阶段计算下次复习日期
 * reviewStage: 0=新词, 1=第1次复习后, ...
 * 返回日期字符串 YYYY-MM-DD
 */
function getNextReviewDate(reviewStage) {
  if (reviewStage >= EBBINGHAUS_INTERVALS.length) {
    // 已掌握，返回很久以后的日期
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 10);
    return storage.formatDate(farFuture);
  }
  const interval = EBBINGHAUS_INTERVALS[reviewStage];
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  return storage.formatDate(nextDate);
}

/**
 * 构建每日单词池
 * @param {number} dailyCount - 每日目标单词数
 * @param {number} newWordRatio - 新词比例 (0-1)
 * @returns {Array<number>} 单词ID数组（已随机打乱）
 */
function buildDailyWordPool(dailyCount, newWordRatio) {
  const today = storage.getTodayStr();

  // 1. 查询所有到期需复习的单词 (nextReviewDate <= today)
  const progressMap = storage.getProgressMap();
  const wordBank = storage.getWordBank();

  const reviewWordIds = [];
  const newWordIds = [];
  const masteredWordIds = [];
  const todayPassedWordIds = [];

  wordBank.forEach(w => {
    const progress = progressMap[w.id];
    if (!progress || progress.status === 'new') {
      newWordIds.push(w.id);
    } else if (progress.status === 'mastered') {
      masteredWordIds.push(w.id);
    } else {
      // learning 或 review 状态
      if (isPassedToday(progress)) {
        todayPassedWordIds.push(w.id);
      } else if (progress.nextReviewDate && progress.nextReviewDate <= today) {
        reviewWordIds.push(progress.wordId);
      }
    }
  });

  // 2. 计算需要的新词数
  const maxNewWords = Math.floor(dailyCount * newWordRatio);
  const reviewNeed = Math.min(reviewWordIds.length, dailyCount);
  const newWordNeed = Math.min(newWordIds.length, dailyCount - reviewNeed, maxNewWords);

  // 3. 从复习词中随机选取
  const selectedReview = shuffle([...reviewWordIds]).slice(0, reviewNeed);

  // 4. 从新词库中随机选取
  const selectedNew = shuffle([...newWordIds]).slice(0, newWordNeed);

  // 5. 如果还不够，从复习词中补足
  const remaining = dailyCount - selectedReview.length - selectedNew.length;
  let extraReview = [];
  if (remaining > 0) {
    const usedIds = new Set([...selectedReview, ...selectedNew]);
    const remainingReview = reviewWordIds.filter(id => !usedIds.has(id));
    extraReview = shuffle(remainingReview).slice(0, remaining);
  }

  // 6. 合并并随机打乱
  const pool = shuffle([...selectedNew, ...selectedReview, ...extraReview]);

  console.log(`[单词池] 今日目标:${dailyCount} 新词:${selectedNew.length} 复习:${selectedReview.length + extraReview.length} 总计:${pool.length}`);
  return pool;
}

/**
 * 生成干扰选项
 * @param {number} correctWordId - 正确答案的单词ID
 * @param {Array<number>} excludeIds - 需要排除的单词ID（如已在选项中）
 * @param {number} count - 需要的干扰项数量
 * @returns {Array<Object>} 选项列表 [{wordId, meaning, isCorrect}]
 */
function generateOptions(correctWordId, excludeIds, count) {
  const correctWord = storage.getWordById(correctWordId);
  if (!correctWord) return [];

  const wordBank = storage.getWordBank();
  const excludeSet = new Set([correctWordId, ...excludeIds]);

  // 从词库中随机选取不相等的单词作为干扰项
  const candidates = wordBank
    .filter(w => !excludeSet.has(w.id))
    .map(w => ({ wordId: w.id, meaning: w.meaning }));

  const distractors = shuffle(candidates).slice(0, count);

  // 构建完整选项列表
  const options = [
    { wordId: correctWordId, meaning: correctWord.meaning, isCorrect: true },
    ...distractors.map(d => ({ ...d, isCorrect: false }))
  ];

  // 随机打乱选项顺序
  return shuffle(options);
}

/**
 * 判断单词当天是否已通过
 */
function isPassedToday(progress) {
  if (!progress || !progress.lastReviewDate) return false;
  const today = storage.getTodayStr();
  return progress.lastReviewDate === today && progress.consecutiveCorrect >= 3;
}

/**
 * 答题后更新进度
 * @param {Object} progress - 当前进度对象
 * @param {boolean} isCorrect - 是否答对
 * @param {number} threshold - 连续正确通过阈值（默认3）
 * @returns {Object} 更新后的进度对象
 */
function updateAfterAnswer(progress, isCorrect, threshold) {
  threshold = threshold || 3;
  const today = storage.getTodayStr();
  const now = new Date();

  let newProgress = { ...progress };
  newProgress.totalAttempts = (newProgress.totalAttempts || 0) + 1;

  if (isCorrect) {
    newProgress.totalCorrect = (newProgress.totalCorrect || 0) + 1;
    newProgress.consecutiveCorrect = (newProgress.consecutiveCorrect || 0) + 1;

    if (newProgress.consecutiveCorrect >= threshold) {
      // 通过！更新复习阶段
      if (newProgress.status === 'new') {
        newProgress.status = 'learning';
      }
      newProgress.reviewStage = (newProgress.reviewStage || 0) + 1;

      // 判断是否已掌握
      if (newProgress.reviewStage >= EBBINGHAUS_INTERVALS.length) {
        newProgress.status = 'mastered';
        newProgress.nextReviewDate = getNextReviewDate(EBBINGHAUS_INTERVALS.length);
      } else {
        newProgress.status = newProgress.reviewStage === 0 ? 'learning' : 'review';
        newProgress.nextReviewDate = getNextReviewDate(newProgress.reviewStage);
      }

      newProgress.lastReviewDate = today;
      newProgress.consecutiveCorrect = 0; // 通过后重置连续正确计数（当天不再出现）
    }
  } else {
    // 答错：重置连续正确计数
    newProgress.consecutiveCorrect = 0;
    newProgress.status = newProgress.status === 'new' ? 'new' : 'learning';

    // 如果还没有 nextReviewDate，设置为今天
    if (!newProgress.nextReviewDate || newProgress.nextReviewDate > today) {
      newProgress.nextReviewDate = today;
    }
  }

  return newProgress;
}

/**
 * 判断每日学习是否完成
 * @param {string} date - 日期字符串
 * @returns {boolean}
 */
function isDailyCompleted(date) {
  const record = storage.getDailyRecord(date);
  return record && record.completed;
}

// ========== 工具函数 ==========

/**
 * Fisher-Yates 洗牌算法
 */
function shuffle(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

module.exports = {
  EBBINGHAUS_INTERVALS,
  getNextReviewDate,
  buildDailyWordPool,
  generateOptions,
  isPassedToday,
  updateAfterAnswer,
  isDailyCompleted,
  shuffle
};
