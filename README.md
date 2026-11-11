# 超星学习进度核查 Skill

给 AI 助手用的技能包：读取超星学习通某个学期的**作业、考试、章节任务点**完成情况，输出「已完成 / 未完成」和截止倒计时。

- 只读：不提交作业、不进入考试、不修改任何数据。
- 不问密码：登录由你本人在 Chrome 窗口里完成，脚本只使用这个窗口的登录态。
- 学期自动判断：按当天日期推导，不用手选。
- 按需查询：只查用户问的那一项，不浪费时间抓无关页面。

## 安装

把整个 `chaoxing-progress` 文件夹放到你所用工具的 skills 目录：

| 工具 | 放置位置 |
|---|---|
| Claude Code | `~/.claude/skills/chaoxing-progress/` |
| Codex | `~/.codex/skills/chaoxing-progress/` |
| DeepSeek Harness / 通用 | `~/.agents/skills/chaoxing-progress/` |

Windows 路径形如 `C:\Users\<你>\.agents\skills\chaoxing-progress\`。放好后让 AI 读 `SKILL.md` 即可。

## 依赖

- **Node.js ≥ 22**（脚本用全局 `WebSocket`）。检查：`node -v`
- **Google Chrome**（Edge 也行，把命令里的 `chrome.exe` 换成 `msedge.exe`）

## 手动跑一次（不用 AI 也能用）

```powershell
# 1. 开一个带调试端口的 Chrome（独立配置目录，不影响你日常浏览器）
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9223 `
  --user-data-dir="$env:LOCALAPPDATA\chaoxing-skill-profile" `
  --no-first-run --no-default-browser-check `
  "https://i.chaoxing.com/base"

# 2. 在弹出的窗口里登录学习通（扫码或手机号验证码）

# 3. 跑脚本
node scripts\check.mjs --only all
```

输出示例：

```
【2026-2027第一学期】7 门课　查询范围：作业 + 考试 + 任务点

⚠ 未完成
  作业 控制工程基础实验   控制工程实验报告三   未交    截止 2026-11-12 13:49
  考试 机械设计           第8章 带传动         待做    截止 2026-11-16 08:13
  考试 机械设计           第11章 蜗杆传动      待做    截止 2026-11-30 10:01
  考试 机械设计           第5 章 螺纹连接      已过期
  ...

章节任务点：
  · 控制工程基础            0/20  (0%)
  · 网络安全培训（2026年）   0/19  (0%)
```

## 参数

| 参数 | 说明 |
|---|---|
| `--only work` | 只看作业（已交 / 未交 + 截止） |
| `--only exam` | 只看考试（已完成 / 待做 / 已过期 + 绝对截止时间） |
| `--only task` | 只看章节任务点（课程级 已完成/总数 + 完成率） |
| `--only all` | 三项都查（默认） |
| `--only work,exam` | 也可组合 |
| `--semester 20251` | 指定学期，`semesternum` 格式；`all` 表示全部学期 |
| `--port 9223` | Chrome 调试端口 |
| `--json out.json` | 明细输出路径，默认 `chaoxing-progress.json` |

退出码：`0` 成功 / `2` 学期或页面异常 / `3` 未登录 / `4` 调试端口不可用。

## 学期怎么算

| 当前月份 | 学期 | semesternum |
|---|---|---|
| 9–12 月 | 今年–明年 第一学期 | 如 `20261` |
| 1 月 | 去年–今年 第一学期 | 如 `20261` |
| 2–6 月 | 去年–今年 第二学期 | 如 `20252` |
| 7–8 月 | 去年–今年 第三学期 | 如 `20253` |

## 三项数据从哪来

| 项 | 页面 | 说明 |
|---|---|---|
| 作业 | `mooc1.chaoxing.com/mooc2/work/list` | `待批阅` 也算已交 |
| 考试 | `mooc1.chaoxing.com/exam-ans/mooc2/exam/exam-list` | 截止时间取自 `onclick`，是绝对时刻 |
| 任务点 | `stat2-ans.chaoxing.com/study-data/index` | 学习记录页，含完成率与班级排名 |

细节和踩坑见 `references/domain-notes.md`。

## 目录

```
chaoxing-progress/
├── SKILL.md                      # 给 AI 读的技能说明
├── README.md                     # 本文件
├── scripts/
│   ├── check.mjs                 # 主脚本
│   └── launch-chrome.ps1         # Windows 一键启动调试浏览器
└── references/
    └── domain-notes.md           # 页面结构 / 接口 / 踩坑记录（维护用）
```

## 免责

仅用于查看自己账号的学习情况。请勿用于批量抓取他人数据。页面结构由超星决定，改版后可能需要更新 `references/domain-notes.md` 里记录的选择器。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
