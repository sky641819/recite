// app.js
const wordBank = require('./utils/wordbank');
const storage = require('./utils/storage');

App({
  onLaunch: function () {
    // 初始化词库（仅首次需要）
    if (!storage.isWordBankReady()) {
      console.log('首次启动，初始化词库...');
      storage.initWordBank(wordBank);
      console.log('词库初始化完成，共', storage.getWordBankSize(), '个单词');
    }

    // 清理旧数据
    storage.cleanOldRecords();

    // 确保设置存在
    storage.getSettings();

    this.globalData = {};
  }
});
