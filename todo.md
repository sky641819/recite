# 背单词微信小程序开发
开发步骤如下
1. 准备单词源 coca 5000词库
2. 小程序方案设计
3. 开发微信小程序 
## 方案设计

### 1. 整体架构
- 基于微信小程序原生框架，不依赖云开发，纯本地存储
- 所有数据存储在微信小程序本地 Storage 中
- 单词库以 JSON 文件形式打包在小程序内部
- 语音使用微信小程序 `wx.createInnerAudioContext` API 播放，语音资源可采用 TTS 在线合成或预置音频

### 2. 数据模型设计

#### 2.1 单词库（word_bank）
```
{
  "id": 1,                    // 单词唯一ID
  "word": "abandon",          // 英文单词
  "phonetic": "/əˈbændən/",  // 音标
  "meaning": "放弃；抛弃",    // 中文释义
  "audio_url": "https://...", // 语音地址（可选，可用TTS合成）
  "level": 1                  // COCA词频等级（1-5）
}
```

#### 2.2 用户学习记录（user_progress）
```
{
  "wordId": 1,                // 单词ID
  "status": "learning",       // 状态：new/learning/review/mastered
  "consecutiveCorrect": 0,     // 当天连续正确次数（0-3）
  "totalCorrect": 12,         // 累计正确次数
  "totalAttempts": 15,        // 累计尝试次数
  "lastReviewDate": "2026-08-08", // 最近复习日期
  "nextReviewDate": "2026-08-09", // 下次复习日期（艾宾浩斯）
  "reviewStage": 2,           // 复习阶段（0=新词，1=第1次复习，2=第2次，...）
  "createdAt": "2026-08-01"   // 首次学习日期
}
```

#### 2.3 每日学习记录（daily_record）
```
{
  "date": "2026-08-08",       // 日期
  "wordsStudied": [1,5,23],   // 当天学习的单词ID列表
  "newWords": 10,             // 当天新学单词数
  "reviewWords": 20,          // 当天复习单词数
  "completed": true           // 是否完成当日任务
}
```

#### 2.4 用户设置（user_settings）
```
{
  "dailyWordCount": 30,       // 每日背诵单词数
  "newWordRatio": 0.3,        // 新词比例（默认30%新词，70%复习）
  "correctThreshold": 3       // 连续正确通过阈值（默认3次）
}
```

### 3. 页面设计

#### 3.1 页面结构
| 页面 | 路径 | 说明 |
|------|------|------|
| 首页 | pages/index/index | 当日学习进度、开始背诵入口 |
| 背诵页 | pages/study/study | 单词选择答题页 |
| 设置页 | pages/settings/settings | 每日单词数、新词比例等设置 |

#### 3.2 首页（index）
- 顶部：显示今日进度（已完成 X / 30 个）
- 中间：「开始背诵」按钮（大字，醒目）
- 底部：今日学习统计（新词数 / 复习数）、连续打卡天数
- 底部导航：「首页」「设置」

#### 3.3 背诵页（study）
- 播放语音按钮（大图标，居中）
- 4 个中文选项按钮（2x2 网格排列）
- 答题反馈：正确显示绿色勾，错误显示红色叉 + 正确答案高亮
- 顶部进度条（当前第 X / 30 个）
- 答完后短暂延迟自动进入下一题
- 全部完成后跳转回首页，显示完成弹窗

#### 3.4 设置页（settings）
- 每日背诵单词数（滑块或输入框，10-100）
- 新词比例调整
- 关于信息

### 4. 艾宾浩斯遗忘曲线算法

#### 4.1 复习间隔
采用经典艾宾浩斯间隔，以天为单位：
| 复习阶段 | 间隔 | 说明 |
|----------|------|------|
| 第1次复习 | 1天后 | 学习后第1天 |
| 第2次复习 | 2天后 | 第1次复习后2天 |
| 第3次复习 | 4天后 | 第2次复习后4天 |
| 第4次复习 | 7天后 | 第3次复习后7天 |
| 第5次复习 | 15天后 | 第4次复习后15天 |
| 第6次复习 | 30天后 | 第5次复习后30天 |
| 已掌握 | - | 6次复习后标记为 mastered |

#### 4.2 每日单词池构建逻辑
1. 查询所有 `nextReviewDate <= today` 的单词 → 候选复习词
2. 如果候选复习词 < 每日单词数，从新词库（status=new）中补充
3. 从候选池中随机选取达到每日单词数的单词
4. 随机打乱顺序后返回

```
function buildDailyWordPool(dailyCount) {
    // 1. 获取到期需复习的单词
    const reviewWords = getWordsByStatusAndDate('learning/review', 'nextReviewDate <= today')
    
    // 2. 计算需要的新词数
    const newWordCount = Math.min(dailyCount - reviewWords.length, dailyCount * newWordRatio)
    
    // 3. 从新词库中随机取词
    const newWords = getRandomNewWords(newWordCount)
    
    // 4. 从复习词中随机选取补足每日总量
    const selectedReview = shuffle(reviewWords).slice(0, dailyCount - newWords.length)
    
    // 5. 合并并随机打乱
    return shuffle([...newWords, ...selectedReview])
}
```

#### 4.3 复习后状态更新
- **连续正确达成阈值（3次）**：当天该单词标记为"通过"，`reviewStage += 1`，按艾宾浩斯间隔更新 `nextReviewDate`
- **中途答错**：`consecutiveCorrect = 0`，当天可继续出现该单词，直到连续正确3次
- **当天已通过**：当天不再出现该单词

### 5. 单词源导入方案
@./coca_5000.jsonl 
- COCA 5000 词库按词频等级分 5 个 JSON 文件，按需加载
- 首次启动时，将词库数据初始化到本地 Storage
- 单词语音采用在线 TTS 合成（如腾讯云 TTS），在背诵时动态获取并缓存

### 6. 核心交互流程

```
启动小程序 → 首页（展示今日进度）
    ↓ 点击「开始背诵」
背诵页 → 构建今日单词池（艾宾浩斯算法）
    ↓
播放语音 → 用户四选一
    ↓ 正确 → 连续正确+1 → 判断是否>=3次
    │                         ↓ 是 → 标记通过，更新复习周期
    │                         ↓ 否 → 放入待复习池
    ↓ 错误 → 连续正确清0 → 重新播放语音 → 再次选择
    ↓
下一题 → 直到今日30个全部通过
    ↓
完成弹窗 → 回到首页
```

### 7. 数据持久化方案
- 使用 `wx.setStorageSync` / `wx.getStorageSync` 进行本地读写
- 每次答题后实时更新 Storage，防止小程序被杀进程导致进度丢失
- 定期（如每次启动）清理旧数据（如30天前的每日记录）

### 8. 开发规范
- 使用微信小程序原生 JS，不引入第三方框架
- 样式使用 WXSS，保持简洁
- 代码分模块管理：`utils/storage.js`（存储）、`utils/algorithm.js`（算法）、`utils/audio.js`（语音）


## 开发原则
1. 微信小程序最小化开发
2. KISS原则，简单易懂，易于维护
3. 轻量化，易测试

## dev plan