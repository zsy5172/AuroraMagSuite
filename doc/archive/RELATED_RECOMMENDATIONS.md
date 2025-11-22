# 智能关联推荐功能（通用版）

## 概述

本版本升级了推荐系统，从简单的**关键词搜索**改为**智能关联推荐**，支持**所有类型内容**（电影、电视剧、游戏、软件等），为用户提供更准确、更相关的内容推荐。

## 通用内容推荐

### 支持的内容类型

系统现在支持以下所有类型的智能推荐：

1. **电影 (Movies)**
   - 提取：片名、年份、续集信息
   - 关联：系列电影、同年电影、同导演作品
   - 例如：《复仇者联盟4》 → 推荐其他漫威电影

2. **电视剧 (TV Shows)**
   - 提取：剧名、季数、集数
   - 关联：同系列其他季、相似题材剧集
   - 例如：《权力的游戏 S08》 → 推荐其他季或类似史诗剧

3. **游戏 (Games)**
   - 提取：游戏名、版本号、DLC信息
   - 关联：同系列游戏、同开发商作品
   - 例如：《刺客信条：英灵殿》 → 推荐其他刺客信条系列

4. **软件 (Software)**
   - 提取：软件名、版本号
   - 关联：同软件不同版本、同类软件
   - 例如：《Adobe Photoshop 2024》 → 推荐其他版本或Adobe产品

### 关键词提取策略

#### 电影/电视剧
```javascript
✅ 提取年份 (2023, 2024)
✅ 提取续集标记 (Part 2, III, 第三季)
✅ 过滤技术标签 (1080p, x264, BluRay)
✅ 提取主要片名/剧名
```

#### 游戏
```javascript
✅ 提取版本信息 (GOTY, Deluxe, v1.2)
✅ 提取DLC/扩展包信息
✅ 过滤平台标签 (PC, PS5, Xbox)
✅ 提取游戏主名
```

#### 软件
```javascript
✅ 提取版本号 (v2024, 12.5.1)
✅ 提取软件名
✅ 过滤系统标签 (x64, Win, macOS)
```

### 关联词生成

系统内置了丰富的关联词映射：

#### 电影系列关联
- **Marvel** → MCU, Avengers, Spider-Man, Iron Man
- **DC** → Batman, Superman, Justice League
- **Star Wars** → Skywalker, Mandalorian, Jedi
- **Harry Potter** → Wizarding World, Fantastic Beasts
- **Fast & Furious** → Fast, Furious, F&F
- 还有更多...

#### 游戏系列关联
- **Call of Duty** → COD, Modern Warfare, Black Ops
- **Assassin's Creed** → AC, Ubisoft
- **Grand Theft Auto** → GTA, Rockstar
- **The Witcher** → Geralt, CD Projekt
- **Dark Souls** → Elden Ring, Bloodborne, FromSoftware
- 还有更多...

### 智能匹配评分

系统会为每个推荐项计算匹配分数：

```javascript
匹配分数 = 主关键词匹配 × 2 + 关联词匹配 × 1
```

- 完全匹配主关键词：+2分
- 匹配关联关键词：+1分
- 按分数排序，优先显示最相关内容

### 使用示例

#### 示例1: 电影推荐
```
查看: "The Matrix Resurrections 2021 1080p"
提取关键词: [Matrix, Resurrections, 2021]
关联词: [Matrix, 2020, 2022, Reloaded, Revolution]
推荐结果:
  ✅ The Matrix Reloaded (匹配分: 4)
  ✅ The Matrix Revolutions (匹配分: 4)
  ✅ The Matrix 1999 (匹配分: 3)
```

#### 示例2: 游戏推荐
```
查看: "Assassins Creed Valhalla Complete Edition"
提取关键词: [Assassins, Creed, Valhalla, Complete]
关联词: [AC, Assassin, Odyssey, Origins, Ubisoft]
推荐结果:
  ✅ Assassins Creed Odyssey (匹配分: 5)
  ✅ Assassins Creed Origins (匹配分: 5)
  ✅ Assassins Creed Unity (匹配分: 4)
```

#### 示例3: 电视剧推荐
```
查看: "Game of Thrones S08E06"
提取关键词: [Game, Thrones, S08]
关联词: [Game of Thrones, S07, S06, GOT]
推荐结果:
  ✅ Game of Thrones S07 (匹配分: 6)
  ✅ Game of Thrones Complete Series (匹配分: 5)
  ✅ House of the Dragon (匹配分: 2)
```

## 性能对比

### 之前（关键词搜索）
- 仅搜索标题中的确切词
- 约3-5个推荐结果
- 可能遗漏相关系列

### 现在（智能关联）
- 搜索主关键词 + 关联词
- 12-20个高质量推荐
- 覆盖整个系列/制作商

## 未来扩展

可以继续扩展的功能：

1. ✅ **通用内容推荐** - 已支持所有类型
2. **基于类型的关联推荐** - 推荐相似题材/类型的作品
3. **基于评分的关联推荐** - 优先推荐高质量作品
4. **机器学习关联** - 基于用户行为学习推荐模式
5. **跨语言推荐** - 支持中英文等多语言内容关联

## 性能优化

- ✅ 使用 GraphQL 缓存避免重复查询
- ✅ 并行搜索提高响应速度
- ✅ 智能去重减少数据传输
- ✅ 限制推荐数量（最多12个）避免过载

## 配置

无需额外配置，系统会自动启用智能关联推荐功能。

关联系列映射在 `getRelatedSeriesCodes()` 函数中定义，可根据需要添加新的关联关系。

---

**版本：** v1.8  
**更新时间：** 2025-01-13  
**作者：** AuroraMag Detail Proxy Team
