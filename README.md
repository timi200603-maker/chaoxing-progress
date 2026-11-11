# 超星作业查交 Skill

给 AI 助手用的技能包：读取超星学习通某个学期的作业列表，输出「已交 / 未交」，带截止倒计时。

- 只读：不提交、不修改、不删除任何作业。
- 不问密码：登录由你本人在 Chrome 窗口里完成，脚本只使用这个窗口的登录态。
- 学期自动判断：按当天日期推导，不用手选。

## 安装

把整个 `chaoxing-homework` 文件夹放到你所用工具的 skills 目录：

| 工具 | 放置位置 |
|---|---|
| Claude Code | `~/.claude/skills/chaoxing-homework/` |
| Codex | `~/.codex/skills/chaoxing-homework/` |
| DeepSeek Harness / 通用 | `~/.agents/skills/chaoxing-homework/` |

Windows 路径形如 `C:\Users\<你>\.agents\skills\chaoxing-homework\`。放好后让 AI 读 `SKILL.md` 即可。

## 依赖

- **Node.js ≥ 22**（脚本用全局 `WebSocket`）。检查：`node -v`
- **Google Chrome**（Edge 也可以，把命令里的 `chrome.exe` 换成 `msedge.exe`）

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
node scripts\check-work.mjs
```

输出示例：

```
【2026-2027第一学期】7 门课 / 17 个作业 / 已交 13 / 未交 4

未交：
  高等数学A        第三次作业          未交  截止 2026/11/12 13:49:09
  ...
```

`check-work.mjs` 的选项：

| 选项 | 说明 |
|---|---|
| `--semester 20251` | 指定学期，`semesternum` 格式（学年 + 学期序号）；`all` 表示全部学期 |
| `--port 9223` | Chrome 调试端口 |
| `--json out.json` | 明细输出路径，默认 `chaoxing-work.json` |

退出码：`0` 成功 / `2` 学期或页面异常 / `3` 未登录 / `4` 调试端口不可用。

## 学期怎么算

| 当前月份 | 学期 | semesternum |
|---|---|---|
| 9–12 月 | 今年–明年 第一学期 | 如 `20261` |
| 1 月 | 去年–今年 第一学期 | 如 `20261` |
| 2–6 月 | 去年–今年 第二学期 | 如 `20252` |
| 7–8 月 | 去年–今年 第三学期 | 如 `20253` |

## 目录

```
chaoxing-homework/
├── SKILL.md                      # 给 AI 读的技能说明
├── README.md                     # 本文件
├── scripts/
│   ├── check-work.mjs            # 主脚本
│   └── launch-chrome.ps1         # Windows 一键启动调试浏览器
└── references/
    └── domain-notes.md           # 页面结构 / 接口 / 踩坑记录（维护用）
```

## 免责

仅用于查看自己账号的作业情况。请勿用于批量抓取他人数据。页面结构由超星决定，改版后可能需要更新 `references/domain-notes.md` 里记录的选择器。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
