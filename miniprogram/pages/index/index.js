// pages/index/index.js
const storage = require('../../utils/storage');
const algorithm = require('../../utils/algorithm');

Page({
  data: {
    dailyTarget: 30,
    dailyCompleted: 0,
    todayNewWords: 0,
    todayReviewWords: 0,
    streakDays: 0,
    progressPercent: 0,
    leftRotate: 45,    // 左半圆旋转角度
    rightRotate: 45    // 右半圆旋转角度
  },

  onShow() {
    this._loadData();
  },

  _loadData() {
    const settings = storage.getSettings();
    const today = storage.getTodayStr();
    const dailyRecord = storage.getDailyRecord(today);
    const streakDays = storage.getStreakDays();

    let dailyCompleted = 0;
    let todayNewWords = 0;
    let todayReviewWords = 0;

    if (dailyRecord) {
      dailyCompleted = dailyRecord.wordsStudied ? dailyRecord.wordsStudied.length : 0;
      todayNewWords = dailyRecord.newWords || 0;
      todayReviewWords = dailyRecord.reviewWords || 0;
    }

    const dailyTarget = settings.dailyWordCount;
    const percent = dailyTarget > 0
      ? Math.min(Math.floor((dailyCompleted / dailyTarget) * 100), 100)
      : 0;

    // 计算双半圆旋转角度
    let leftRotate, rightRotate;
    if (percent <= 50) {
      leftRotate = 45 + (percent / 50) * 180;
      rightRotate = 45;
    } else {
      leftRotate = 225;
      rightRotate = 45 + ((percent - 50) / 50) * 180;
    }

    this.setData({
      dailyTarget,
      dailyCompleted,
      todayNewWords,
      todayReviewWords,
      streakDays,
      progressPercent: percent,
      leftRotate,
      rightRotate
    });
  },

  onStartStudy() {
    wx.navigateTo({
      url: '/pages/study/index'
    });
  }
});
