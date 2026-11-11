# 超星页面结构与接口（维护记录）

记录自 2026-11 实测，用于改版后快速定位。

## 1. 课程列表页

`https://v24.chaoxing.com/wfw/courselist/course3`

- 也需要 `s`、`space_token` 参数才能直接在顶层打开；不带参数时先访问 `https://i.chaoxing.com/base`，再从左侧「课程」进入，页面里的 iframe 会带上这两个参数。
- 学期下拉：

```html
<ul class="selectEn_con" name="xq">
  <li value="0">全部</li>
  <li value="47748" semesternum="20261">2026-2027第一学期</li>
  <li value="43343" semesternum="20253">2025-2026第三学期</li>
</ul>
```

- `value` 是**账号相关的内部 ID**，不能写死；`semesternum` = 学年 + 学期序号（`20261` = 2026-2027 第一学期），是稳定标识。
- 筛选是前端行为，必须用 jQuery 触发：

```js
$('.selectEn_con[name="xq"] li[value="47748"]').trigger('click');  // 用 semesternum 找到 li 再点
```

  原生 `li.click()` 不生效（列表 `display:none`，事件是委托绑定的）。

- 课程卡片：

```html
<li class="w_couritem" cid="100000001" classid="100000002" cname="示例课程">
  <div class="w_courpic"><a href="/courselist/opencoursenewfy?..."><img></a></div>
  <h3 class="w_courtit"><a href="/courselist/opencoursenewfy?...&ckenc=..." title="课程名">课程名</a></h3>
</li>
```

  **取课程名要读 `li[cname]`**。封面图和标题是两个不同的 `<a>`，封面那个没有文字；已结课的卡片里 `<a>` 的文本是「本课程已结课」角标。用宽泛的 `p` / `h3` 选择器会误抓到学期下拉的 `<p class="selectEn_name">`。

## 2. 课程主页（要拿 workEnc）

点开后跳到：

`https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu?courseid=..&clazzid=..&cpi=..&enc=..&t=..&pageHeader=0&v=0&hideHead=0`

页面里有若干隐藏 input，直接读值即可拼作业列表地址：

| input id | 含义 |
|---|---|
| `courseid` / `clazzid` / `cpi` | 课程/班级/关系 ID |
| `t` | 时间戳（每次进页面都变） |
| `enc` | `stuenc`，本次会话的学员加密串 |
| `workEnc` | 作业模块加密串 |

「作业」是页签（`span.nav_content`），点击后加载 iframe：
`https://mooc1.chaoxing.com/mooc2/work/list?courseId=..&classId=..&cpi=..&ut=s&t=..&stuenc=..&enc=..`

因为 iframe 跨域（mooc2-ans → mooc1）无法读内容，**直接把顶层标签页导航到该 URL** 更省事；它靠 Cookie 鉴权，能正常渲染。

## 3. 作业列表页

- 标题：作业列表；进度形如 `6/10`（已交/总数）。
- 空列表时正文包含「暂无作业」。
- 条目结构：

```html
<li onclick="goTask(this)" data="https://mooc1.chaoxing.com/mooc-ans/mooc2/work/task?...&workId=100000003&answerId=0&enc=...">
  <p class="overHidden2 fl">第一次作业</p>
  <p class="status fl">未交</p>
  <div class="time notOver">剩余21小时59分钟</div>   <!-- 有截止时间才有 -->
</li>
```

- 状态取值：`已完成` / `待批阅` / `未交`（偶尔出现 `未完成`、`已过期`）。
- 截止信息只有「剩余 X 小时 Y 分钟」这种相对文案，没有绝对时间；脚本按抓取时刻换算成绝对时间。要报得准，就现抓现报。

## 4. 考试列表页

- 地址：`https://mooc1.chaoxing.com/exam-ans/mooc2/exam/exam-list?courseid=..&clazzid=..&cpi=..&ut=s&t=..&stuenc=..&enc=<examEnc>&openc=<openc>`
- 注意参数是**小写**的 `courseid` / `clazzid`（作业页是大写 `courseId` / `classId`），别照抄。
- `examEnc`、`openc` 都在课程页的隐藏 input 里。
- 条目复用了作业页的样式，且 `onclick` 里带绝对时间：

```html
<li>
  <div onclick="goTest('266276362',11160933,0,'2026-11-30 10:01:32.0',572496277,false,'6df6...','0');">
    <p class="overHidden2 fl">第11章 蜗杆传动</p>
    <p class="status fl">待做</p>
  </div>
  <div class="time notOver"><img ...>剩余449小时53分钟</div>
</li>
```

- `goTest` 的第 4 个参数就是**截止时刻**，直接取，比换算「剩余时间」准。
- 状态取值：`待做` / `已完成` / `已过期`。`已过期` = 关闭了且没做（做过会显示 `已完成`）。
- 空列表时正文包含「暂无考试」。

## 5. 学习记录页（任务点的唯一可靠来源）

`https://stat2-ans.chaoxing.com/study-data/index?courseid=..&clazzid=..&cpi=..&ut=s&t=..&stuenc=..`

页面正文包含（顺序不一定稳定，用正则按标签取）：

```
章节任务点 详情 0/50个 完成率 0%
学习任务
章节测验 0/8
在线考试 1/7
课程作业 7/9
AI实践 0/0
互动测验 0/0
分组任务 0/0
```

- 这页一次给全四类任务的「已完成/总数」，是课程级汇总的最佳来源。
- 课程作业的数字要和作业列表对得上（实测 `7/9` 与作业页一致），可用来交叉验证。
- 还有班级排名、章节学习次数、签到出勤等，暂未使用。

**章节页的坑**：`mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=..&clazzid=..&cpi=..&ut=s&t=..&stuenc=..` 顶部也写着「已完成任务点: x/y」，但它是**渲染占位**——实测一门已结课、任务点 50 个的课，这里和学习记录页都显示 `0/50` 且进度条 0%，而该页每个小节的数字（`catalog_points_yi`）是**该小节任务点总数**，不是完成数。所以：任务点一律以学习记录页为准，章节页只用来读章节目录。

## 6. 踩过的坑

| 坑 | 说明 |
|---|---|
| 同名作业重复 | 老师重复发布会得到多个 `workId`，标题一样。**不能按标题去重**，否则会漏掉没交的那份。 |
| `0/0` + `暂无作业` | 只是作业模块为空。老师可能把任务放在「章节任务点 / 测验 / 考试」，交付时要说明区别。 |
| 已结课课程无课程名 | 卡片角标覆盖了 `<a>` 文本，必须读 `li[cname]`。 |
| Node < 22 | 没有全局 `WebSocket`，报 `WebSocket is not defined`。 |
| PowerShell 读 JSON 乱码 | `Get-Content` 默认按 ANSI 解码，中文变「鍟嗗闄」。用 `-Encoding UTF8`，或直接用 Node 读。数据文件本身是 UTF-8，没坏。 |
| 首屏未渲染完 | 课程列表、作业/考试列表都是 JS 渲染，固定等待 2–5 秒比事件更省心；偶发 `no workEnc` / `no examEnc` 时重试 3 次即可。 |
| 重名方法污染 | 脚本里别同时出现 `const pending` 和筛选后的 `pending`，ESM 会直接语法报错。 |
| 任务点数字想当然 | 章节页的 `x/y` 看着像完成度，其实是渲染占位；必须去学习记录页读。 |
| 作业页/考试页参数大小写 | 作业 `courseId`+`classId`，考试 `courseid`+`clazzid`，抄错会 404。 |
