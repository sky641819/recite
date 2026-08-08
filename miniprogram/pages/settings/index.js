// pages/settings/index.js
const storage = require('../../utils/storage');

Page({
  data: {
    dailyWordCount: 30,
    newWordRatio: 30,
    newWordRatioText: '30%'
  },

  onShow() {
    const settings = storage.getSettings();
    this.setData({
      dailyWordCount: settings.dailyWordCount,
      newWordRatio: Math.round(settings.newWordRatio * 100),
      newWordRatioText: Math.round(settings.newWordRatio * 100) + '%'
    });
  },

  /** 每日单词数滑块变化 */
  onDailyCountChange(e) {
    const val = e.detail.value;
    this.setData({ dailyWordCount: val });
    storage.updateSettings({ dailyWordCount: val });
  },

  /** 新词比例选择 */
  onRatioSelect(e) {
    const ratio = e.currentTarget.dataset.ratio;
    const ratioNum = ratio / 100;
    this.setData({
      newWordRatio: ratio,
      newWordRatioText: ratio + '%'
    });
    storage.updateSettings({ newWordRatio: ratioNum });
  }
});
