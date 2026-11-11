---
name: chaoxing-homework
description: 查超星学习通 / 超星泛雅（i.chaoxing.com、mooc1.chaoxing.com、mooc2-ans.chaoxing.com）某个学期的作业提交情况，输出「已交 / 未交」清单和截止倒计时。Use when 用户问「作业交了没」「哪些没交」「学习通/超星作业」，或贴出 chaoxing.com 的链接，或要求按学期核对作业。
---

# 超星作业查交

只读操作：只读取页面，绝不点提交、不改作业内容。

## 一条铁律：学期由当前日期算，不要问用户

用户问「作业交了没」时，**默认口径是"当前学期"**，由对话的当前时间推导，不要反问是哪一学期：

| 当前月份 | 学年 | 学期 | semesternum |
|---|---|---|---|
| 9 月 – 12 月 | 今年–明年 | 第一学期 | `<今年>1`，如 `20261` |
| 1 月 | 去年–今年 | 第一学期 | `<去年>1` |
| 2 月 – 6 月 | 去年–今年 | 第二学期 | `<去年>2`，如 `20252` |
| 7 月 – 8 月 | 去年–今年 | 第三学期（暑期） | `<去年>3`，如 `20253` |

例：对话时间是 2026-11-11 → 2026-2027第一学期 → `semesternum=20261`。
只有当用户明确说「查大二下 / 上一学期 / 全部学期」时，才用 `--semester` 指定别的学期。

## 前置条件

1. **Node.js ≥ 22**（脚本用全局 `WebSocket`，Node 18/20 会报 `WebSocket is not defined`）。
2. 一个**已登录学习通的 Chrome**，且开着远程调试端口。不要让用户把密码或 Cookie 交给你——由用户本人在窗口里登录。

启动方式（独立 profile，不干扰用户日常浏览器，不影响已开着的 Chrome）：

```powershell
# Windows
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9223 `
  --user-data-dir="$env:LOCALAPPDATA\chaoxing-skill-profile" `
  --no-first-run --no-default-browser-check `
  "https://i.chaoxing.com/base"
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

## 流程

1. **算学期**：按上表从当前日期得出 `semesternum`。
2. **拉起浏览器**：窗口打开后请用户自己扫码 / 手机号登录，你**不要**代登录。
3. **等登录**：轮询 `http://127.0.0.1:9223/json/list`，页面上出现 `chaoxing.com` 且不是 `passport2` 即表示已登录；也可以直接跑脚本，脚本会报 `NEED_LOGIN`。
4. **跑脚本**：

```bash
node scripts/check-work.mjs [--semester 20261] [--port 9223] [--json out.json]
```

5. **转述结果**：先给「未交」清单（按截止时间从近到远），再给「已交」清单，最后列出「暂无作业」的课。截止时间用绝对时间说，例如「明天 11/12 13:49」。

## 输出约定

- `未交` = 状态为 `未交` / `未完成` / `未提交` / 已过期。
- `已交` = `已完成` / `待批阅` / `已提交`（待批阅是交过了等老师批）。
- `暂无作业` 只表示该课**作业模块**为空，不等于没交。老师也可能把任务放在「章节任务点 / 测验 / 考试」里，交付时要说明这一区别，不要扩大解读。
- 同名作业（如「第一次作业」出现 2–3 次）是老师重复发布的不同 `workId`，**不要去重**，要在结论里提示"有重名，注意别漏"。

## 常见异常

| 现象 | 处理 |
|---|---|
| `NEED_LOGIN` / 页面停在 passport2 | 请用户在那个窗口登录后重跑；不要索要账号密码 |
| `WebSocket is not defined` | Node 版本 < 22，换 Node 22+ |
| `没有可用的浏览器标签页` | Chrome 没开调试端口，按上面的命令重启 Chrome |
| 某门课 `no workEnc` | 偶发加载失败，脚本已自动重试 3 次；仍失败就单独再跑一次 |
| 找不到学期 | 该学期此账号没有课程（如刚入学），或 `--semester` 写错；脚本会打印页面上全部学期供核对 |

## 隐私边界

只读、只用用户自己的登录态。不抓取、不输出 Cookie、密码、手机号；不把页面数据发往任何第三方。结束后可提示用户关掉那个浏览器窗口。
