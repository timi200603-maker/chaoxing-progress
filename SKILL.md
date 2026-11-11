---
name: chaoxing-progress
description: 查超星学习通 / 超星泛雅（i.chaoxing.com、mooc1.chaoxing.com、mooc2-ans.chaoxing.com）某学期的作业、考试、章节任务点完成情况，输出「已完成 / 未完成」清单与截止倒计时。Use when 用户问「作业交了没」「哪些没交」「考试考了没」「任务点刷完了吗」「学习通进度」，或贴出 chaoxing.com 链接。
---

# 超星学习进度核查

只读操作：只浏览页面，**不提交作业、不进入考试、不改任何数据**。

## 一、学期由当前日期算，不问用户

用户问「作业交了没」时，默认口径就是**当前学期**，直接按对话时间推导：

| 当前月份 | 学年 | 学期 | semesternum |
|---|---|---|---|
| 9 月 – 12 月 | 今年–明年 | 第一学期 | `<今年>1`，如 `20261` |
| 1 月 | 去年–今年 | 第一学期 | `<去年>1` |
| 2 月 – 6 月 | 去年–今年 | 第二学期 | `<去年>2`，如 `20252` |
| 7 月 – 8 月 | 去年–今年 | 第三学期 | `<去年>3`，如 `20253` |

例：对话时间 2026-11-11 → 2026-2027第一学期 → `20261`。
只有用户明确说「查大二下 / 上学期 / 全部学期」时，才用 `--semester` 覆盖；`--semester all` 表示不筛学期。

## 二、只查用户要的那一项

脚本用 `--only` 控制范围，**别默认全跑**——用户只问作业时跑 `work`，省一半以上时间：

| 用户问法 | 参数 |
|---|---|
| 作业交了没 / 哪些没交 | `--only work` |
| 考试考了没 / 什么时候截止 | `--only exam` |
| 任务点刷完了吗 / 进度多少 | `--only task` |
| 这学期还有什么没做 / 全部 | `--only all`（默认） |

`--only` 也接受组合，如 `--only work,exam`。

## 三、前置条件

1. **Node.js ≥ 22**（脚本用全局 `WebSocket`；18/20 报 `WebSocket is not defined`）。
2. 一个**已登录学习通的 Chrome**，开着远程调试端口。不要让用户把密码或 Cookie 交给你——由用户本人在窗口里登录。

```powershell
# Windows
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9223 `
  --user-data-dir="$env:LOCALAPPDATA\chaoxing-skill-profile" `
  --no-first-run --no-default-browser-check "https://i.chaoxing.com/base"
```

```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9223 --user-data-dir="$HOME/.chaoxing-skill-profile" \
  --no-first-run --no-default-browser-check "https://i.chaoxing.com/base"

# Linux
google-chrome --remote-debugging-port=9223 --user-data-dir="$HOME/.chaoxing-skill-profile" \
  --no-first-run --no-default-browser-check "https://i.chaoxing.com/base"
```

Windows 下可直接用 `scripts/launch-chrome.ps1`。

## 四、执行

```bash
node scripts/check.mjs --only all [--semester 20261] [--port 9223] [--json out.json]
```

脚本会：定位学期 → 列出该学期课程 → 逐课读取作业 / 考试 / 学习记录 → 汇总打印并写 JSON。

## 五、三路数据的来源与口径

| 项 | 来源页面 | 判定 |
|---|---|---|
| 作业 | `mooc1.chaoxing.com/mooc2/work/list` | `已完成` / `待批阅` / `已提交` = 已交；`未交` / `未完成` = 未交 |
| 考试 | `mooc1.chaoxing.com/exam-ans/mooc2/exam/exam-list` | `已完成` = 已考；`待做` = 未考；`已过期` = 已关闭且没做 |
| 任务点 | `stat2-ans.chaoxing.com/study-data/index` | 直接读「章节任务点 已完成/总数」和完成率 |

要点：

- **考试有绝对截止时间**：条目 `onclick` 里的第 4 个参数就是截止时刻（如 `2026-11-30 10:01:32`），比「剩余 X 小时」更准，优先用它。
- **作业只有相对时间**：页面只给「剩余 X 小时 Y 分钟」，脚本按抓取时刻换算成绝对时间，所以要现抓现报。
- **任务点以「学习记录」页为准**：章节页顶部也有「已完成任务点 x/y」，但它可能只是渲染占位（实测已结课、学过 50 个任务点的课，两处都是 0），学习记录页才有完成率与班级排名。
- **任务点只有课程级粒度**：没有逐小节的完成状态可读，报告到「课程 0/20（0%）」这一层就够。

## 六、输出约定

- 先给**未完成**（作业未交 + 考试待做/已过期），按截止时间从近到远。
- 再给**章节任务点**进度，`·` 表示还没刷完，`✓` 表示已完成。
- 最后给**已完成**清单。
- 同名作业（如「第一次作业」出现 2–3 次）是老师重复发布的不同 `workId`，**不要去重**，要提示「有重名，注意别漏」。
- 作业模块为空不等于没任务：老师可能只把内容放在考试或任务点里，反之亦然。交付时说明这个区别，别把「暂无作业」说成「这门课没任务」。

## 七、常见异常

| 现象 | 处理 |
|---|---|
| `NEED_LOGIN` / 停在 passport2 | 请用户在窗口登录后重跑；不要索要账号密码 |
| `WebSocket is not defined` | Node < 22，换 Node 22+ |
| `没有可用的浏览器标签页` | Chrome 没开调试端口，按上面的命令重启 |
| 某门课缺 `workEnc` / `examEnc` | 偶发加载失败，脚本已重试 3 次；仍失败就单课重跑 |
| 找不到学期 | 该学期没课，或 `--semester` 写错；脚本会打印页面上全部学期 |
| 任务点全 0 | 先确认用户是否真的没刷；若多门课都 0 而用户说做过，改用学习记录页核对，别直接下结论 |

## 八、隐私边界

只读、只用用户自己的登录态。不抓取、不输出 Cookie、密码、手机号，不把数据发往任何第三方。结束后可提示用户关掉那个浏览器窗口。
