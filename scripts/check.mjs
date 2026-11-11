#!/usr/bin/env node
/**
 * 超星学习进度核查 check.mjs
 *
 * 只读：只浏览页面，不提交作业、不进入考试、不改任何数据。
 *
 * 用法:
 *   node check.mjs [--only work|exam|task|all] [--semester 20261|all] [--port 9223] [--json out.json]
 *
 *   --only work  只看作业（已交/未交 + 截止）
 *   --only exam  只看考试（已完成/待做/已过期 + 绝对截止时间）
 *   --only task  只看章节任务点（各课程 已完成/总数 + 完成率）
 *   --only all   三项都查（默认）
 *
 * 退出码: 0 成功 | 2 学期/页面异常 | 3 未登录 | 4 调试端口不可用
 */
import fs from 'node:fs';

/* ---------------- 参数 ---------------- */
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const PORT = parseInt(arg('--port', '9223'), 10);
const OUT = arg('--json', 'chaoxing-progress.json');
const FORCE = arg('--semester', null);
const ONLY = (arg('--only', 'all') || 'all').toLowerCase();
const QUIET = argv.includes('--quiet');
const SCOPES = ONLY === 'all' ? ['work', 'exam', 'task'] : ONLY.split(',').map(s => s.trim()).filter(Boolean);
if (!SCOPES.length || SCOPES.some(s => !['work', 'exam', 'task'].includes(s))) {
  console.error('--only 只能是 work / exam / task / all，或它们的组合（逗号分隔）');
  process.exit(2);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = m => { if (!QUIET) console.error('[chaoxing] ' + m); };

/* ---------------- 日期 -> 学期 ---------------- */
function semesterForDate(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth() + 1;
  let year, term;
  if (m >= 9) { year = y; term = 1; }
  else if (m === 1) { year = y - 1; term = 1; }
  else if (m <= 6) { year = y - 1; term = 2; }
  else { year = y - 1; term = 3; }
  const cn = ['一', '二', '三'][term - 1];
  return { year, term, semesternum: `${year}${term}`, label: `${year}-${year + 1}第${cn}学期` };
}
const want = FORCE || semesterForDate().semesternum;

/* ---------------- 时间格式化 ---------------- */
const pad2 = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const REST = /剩余\s*(\d+)\s*小时\s*(\d+)\s*分钟/;
function deadlineFromRest(text) {
  const m = (text || '').match(REST);
  if (!m) return '';
  return fmtDate(new Date(Date.now() + (+m[1]) * 3600e3 + (+m[2]) * 60e3));
}

/* ---------------- CDP ---------------- */
let tabs;
try { tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); }
catch {
  console.error(`无法连接 Chrome 调试端口 ${PORT}。请以 --remote-debugging-port=${PORT} 启动 Chrome 并登录学习通（见 SKILL.md）。`);
  process.exit(4);
}
const target = tabs.filter(t => t.type === 'page').find(p => p.url.includes('chaoxing')) || tabs.find(t => t.type === 'page');
if (!target) { console.error('没有可用的浏览器标签页。'); process.exit(4); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let mid = 0; const pending = new Map(); const evq = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  } else if (m.method) evq.push(m);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++mid; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});
await send('Page.enable');
await send('Runtime.enable');

async function ev(expression) {
  try {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    return r.exceptionDetails ? { __error: r.exceptionDetails.text } : r.result.value;
  } catch (e) { return { __error: String(e.message).slice(0, 120) }; }
}
async function goto(url, { settle = 1200, maxWait = 9000 } = {}) {
  evq.length = 0;
  const t0 = Date.now();
  try { await send('Page.navigate', { url }); } catch { return null; }
  while (Date.now() - t0 < maxWait) {
    if (evq.some(m => m.method === 'Page.loadEventFired')) break;
    await sleep(120);
  }
  await sleep(settle);
  return ev('location.href');
}

/* ---------------- 课程 + 学期 ---------------- */
const SPACE = 'https://v24.chaoxing.com/wfw/courselist/course3';
await goto(SPACE, { settle: 2500 });
const state = await ev(`({ url: location.href, login: /passport2|login/i.test(location.href),
  hasList: !!document.querySelector('li.w_couritem, .selectEn_con[name="xq"]') })`);
if (state && state.login) { console.error('NEED_LOGIN: 浏览器尚未登录学习通，请在该窗口登录后重跑。'); process.exit(3); }
if (!state || !state.hasList) {
  await goto('https://i.chaoxing.com/base', { settle: 2500 });
  await goto(SPACE, { settle: 3000 });
}

const picked = await ev(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = window.jQuery;
  if (!$) return { error: '页面缺少 jQuery，可能未登录或页面结构变更' };
  const want = ${JSON.stringify(want)};
  const lis = [...document.querySelectorAll('.selectEn_con[name="xq"] li')];
  if (!lis.length) return { error: '找不到学期下拉（页面结构可能已变更）' };
  const all = lis.map(li => ({ semesternum: li.getAttribute('semesternum') || '', label: (li.innerText || '').trim() }));
  let hit;
  if (want === 'all') hit = lis.find(li => (li.innerText || '').trim() === '全部');
  else {
    hit = lis.find(li => li.getAttribute('semesternum') === want);
    if (!hit) {
      const cands = lis.filter(li => li.getAttribute('semesternum'))
        .sort((a, b) => Number(b.getAttribute('semesternum')) - Number(a.getAttribute('semesternum')));
      hit = cands.find(li => Number(li.getAttribute('semesternum')) <= Number(want)) || cands[0];
    }
  }
  if (!hit) return { error: '学期列表为空', all };
  $(hit).trigger('click');
  await sleep(5000);
  const seen = new Set(); const courses = [];
  for (const li of document.querySelectorAll('li.w_couritem')) {
    const a = li.querySelector('.w_courtit a') || li.querySelector('a[href*="opencoursenewfy"]');
    const href = a ? (a.getAttribute('href') || '') : '';
    if (!href || seen.has(href)) continue;
    const name = (li.getAttribute('cname') || a.getAttribute('title') || a.innerText || '').trim().replace(/\\s+/g, ' ');
    if (!name) continue;
    seen.add(href);
    courses.push({ name, href });
  }
  return { picked: (hit.innerText || '').trim(), semesternum: hit.getAttribute('semesternum') || '',
           requested: want, fallback: want !== 'all' && hit.getAttribute('semesternum') !== want, courses, all };
})()`);

if (!picked || picked.error) { console.error('学期定位失败: ' + JSON.stringify(picked)); process.exit(2); }
log(`当前时间 ${new Date().toLocaleString('zh-CN')} → 学期 ${picked.picked}（semesternum=${picked.semesternum}），课程 ${picked.courses.length} 门，查询范围 ${SCOPES.join('+')}`);
if (picked.fallback) log(`注意：请求的学期 ${picked.requested} 不在列表中，已退到 ${picked.semesternum}`);

/* ---------------- 单个课程抓取 ---------------- */
const EXTRACT_WORK = `(() => {
  const body = document.body.innerText || '';
  const items = [...document.querySelectorAll('.bottomList li, li')].map(li => {
    const n = li.querySelector('.overHidden2'), s = li.querySelector('.status'), t = li.querySelector('.time');
    if (!n) return null;
    return { name: n.innerText.trim(), status: s ? s.innerText.trim() : '',
             timeText: t ? (t.innerText || '').replace(/\\s+/g, ' ').trim() : '', url: li.getAttribute('data') || '' };
  }).filter(Boolean);
  const m = body.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
  return { summary: m ? m[0] : '', empty: body.includes('暂无作业'), items };
})()`;

const EXTRACT_EXAM = `(() => {
  const body = document.body.innerText || '';
  const items = [...document.querySelectorAll('li')].map(li => {
    const n = li.querySelector('.overHidden2'), s = li.querySelector('.status'), t = li.querySelector('.time');
    if (!n) return null;
    const oc = li.querySelector('[onclick]');
    const raw = oc ? (oc.getAttribute('onclick') || '') : '';
    const dm = raw.match(/'(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})/);
    return { name: n.innerText.trim(), status: s ? s.innerText.trim() : '',
             absDeadline: dm ? dm[1] : '', timeText: t ? (t.innerText || '').replace(/\\s+/g, ' ').trim() : '' };
  }).filter(Boolean);
  const m = body.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
  return { summary: m ? m[0] : '', empty: body.includes('暂无考试'), items };
})()`;

const EXTRACT_TASK = `(() => {
  const t = document.body.innerText || '';
  const grab = label => { const m = t.match(new RegExp(label + '[^\\\\d]{0,24}(\\\\d+)\\\\s*\\\\/\\\\s*(\\\\d+)')); return m ? { done: +m[1], total: +m[2] } : null; };
  return {
    task: grab('章节任务点'), quiz: grab('章节测验'), exam: grab('在线考试'), work: grab('课程作业'),
    rate: (t.match(/完成率\\s*(\\d+(?:\\.\\d+)?)\\s*%/) || [])[1] || ''
  };
})()`;

async function courseMeta(c) {
  const url = new URL(c.href, 'https://v24.chaoxing.com').toString();
  for (let attempt = 0; attempt < 3; attempt++) {
    await goto(url, { settle: 1500 });
    const meta = await ev(`(() => { const v = id => { const e = document.getElementById(id); return e ? e.value : ''; };
      return { courseid: v('courseid'), clazzid: v('clazzid'), cpi: v('cpi'), t: v('t'),
               enc: v('enc'), workEnc: v('workEnc'), examEnc: v('examEnc'), openc: v('openc') }; })()`);
    if (meta && !meta.__error && meta.enc) return meta;
    await sleep(900);
  }
  return null;
}

const courses = [];
for (const c of picked.courses) {
  const rec = { name: c.name, work: null, exam: null, task: null, error: '' };
  const meta = await courseMeta(c);
  if (!meta) { rec.error = '课程页加载失败'; courses.push(rec); log(`${c.name}: ${rec.error}`); continue; }

  if (SCOPES.includes('work')) {
    if (!meta.workEnc) rec.work = { error: '无 workEnc' };
    else {
      await goto(`https://mooc1.chaoxing.com/mooc2/work/list?courseId=${meta.courseid}&classId=${meta.clazzid}` +
        `&cpi=${meta.cpi}&ut=s&t=${meta.t}&stuenc=${meta.enc}&enc=${meta.workEnc}`, { settle: 2200 });
      const r = await ev(EXTRACT_WORK);
      rec.work = (r && !r.__error) ? r : { error: '作业页解析失败' };
    }
  }

  if (SCOPES.includes('exam')) {
    if (!meta.examEnc) rec.exam = { error: '无 examEnc' };
    else {
      await goto(`https://mooc1.chaoxing.com/exam-ans/mooc2/exam/exam-list?courseid=${meta.courseid}&clazzid=${meta.clazzid}` +
        `&cpi=${meta.cpi}&ut=s&t=${meta.t}&stuenc=${meta.enc}&enc=${meta.examEnc}&openc=${meta.openc}`, { settle: 2400 });
      const r = await ev(EXTRACT_EXAM);
      rec.exam = (r && !r.__error) ? r : { error: '考试页解析失败' };
    }
  }

  if (SCOPES.includes('task')) {
    await goto(`https://stat2-ans.chaoxing.com/study-data/index?courseid=${meta.courseid}&clazzid=${meta.clazzid}` +
      `&cpi=${meta.cpi}&ut=s&t=${meta.t}&stuenc=${meta.enc}`, { settle: 3000 });
    const r = await ev(EXTRACT_TASK);
    rec.task = (r && !r.__error) ? r : { error: '学习记录页解析失败' };
  }

  courses.push(rec);
  const bits = [];
  if (rec.work) bits.push(`作业 ${rec.work.summary || ((rec.work.items || []).length)}`);
  if (rec.exam) bits.push(`考试 ${rec.exam.summary || ((rec.exam.items || []).length)}`);
  if (rec.task) bits.push(`任务点 ${rec.task.task ? rec.task.task.done + '/' + rec.task.task.total : '?'}`);
  log(`${c.name}: ${bits.join(' | ')} ${rec.error || ''}`);
  await sleep(250);
}

/* ---------------- 汇总 ---------------- */
const WORK_DONE = s => /已完成|待批阅|已提交/.test(s);
const EXAM_DONE = s => /已完成|已提交/.test(s);

const pendingWorks = [], doneWorks = [], pendingExams = [], doneExams = [];
for (const c of courses) {
  for (const it of (c.work && c.work.items) || []) {
    const row = { course: c.name, name: it.name, status: it.status, deadline: deadlineFromRest(it.timeText), kind: '作业' };
    (WORK_DONE(it.status) ? doneWorks : pendingWorks).push(row);
  }
  for (const it of (c.exam && c.exam.items) || []) {
    const row = {
      course: c.name, name: it.name, status: it.status, kind: '考试',
      deadline: it.absDeadline ? it.absDeadline.slice(0, 16) : deadlineFromRest(it.timeText)
    };
    (EXAM_DONE(it.status) ? doneExams : pendingExams).push(row);
  }
}
const byDeadline = (a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999');
pendingWorks.sort(byDeadline); pendingExams.sort(byDeadline);

const taskRows = courses.filter(c => c.task && c.task.task).map(c => ({
  course: c.name, done: c.task.task.done, total: c.task.task.total,
  pct: c.task.task.total === 0 ? '-'
    : (c.task.rate !== '' ? c.task.rate + '%' : Math.round(c.task.task.done / c.task.task.total * 100) + '%'),
  quiz: c.task.quiz, examCount: c.task.exam, workCount: c.task.work
}));

const result = {
  generatedAt: new Date().toISOString(),
  semester: picked.picked, semesternum: picked.semesternum,
  requestedSemester: picked.requested, semesterFallback: !!picked.fallback,
  scopes: SCOPES,
  stats: {
    courses: courses.length,
    workPending: pendingWorks.length, workDone: doneWorks.length,
    examPending: pendingExams.length, examDone: doneExams.length,
    taskPendingCourses: taskRows.filter(t => t.total > t.done).length
  },
  pendingWorks, doneWorks, pendingExams, doneExams, tasks: taskRows,
  courses: courses.map(c => ({
    name: c.name, error: c.error,
    work: c.work ? { summary: c.work.summary, empty: !!c.work.empty, count: (c.work.items || []).length } : null,
    exam: c.exam ? { summary: c.exam.summary, empty: !!c.exam.empty, count: (c.exam.items || []).length } : null,
    task: c.task || null
  }))
};
fs.writeFileSync(OUT, JSON.stringify(result, null, 1), 'utf8');

/* ---------------- 终端报告 ---------------- */
const w = s => { let n = 0; for (const ch of s) n += /[\u4e00-\u9fa5]/.test(ch) ? 2 : 1; return n; };
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - w(s)));

console.log(`\n【${result.semester}】${courses.length} 门课　查询范围：${SCOPES.map(s => ({ work: '作业', exam: '考试', task: '任务点' }[s])).join(' + ')}\n`);

const block = (title, rows) => {
  if (!rows.length) return;
  console.log(title);
  for (const r of rows) {
    const tail = r.deadline ? `截止 ${r.deadline}` : '';
    console.log(`  ${pad(r.kind || '', 4)} ${pad(r.course, 20)} ${pad(r.name, 30)} ${pad(r.status, 7)}${tail}`);
  }
  console.log('');
};

block('⚠ 未完成', [...pendingWorks, ...pendingExams]);

const withTasks = taskRows.filter(t => t.total > 0);
const withoutTasks = taskRows.filter(t => t.total === 0);
if (withTasks.length) {
  console.log('章节任务点：');
  for (const t of withTasks) {
    const mark = t.total > t.done ? '·' : '✓';
    const extra = [];
    if (t.quiz && t.quiz.total) extra.push(`测验 ${t.quiz.done}/${t.quiz.total}`);
    if (t.examCount && t.examCount.total) extra.push(`考试 ${t.examCount.done}/${t.examCount.total}`);
    console.log(`  ${mark} ${pad(t.course, 26)} ${t.done}/${t.total}  (${t.pct})${extra.length ? '   ' + extra.join(' · ') : ''}`);
  }
  console.log('');
}
if (withoutTasks.length) console.log('无章节任务点：' + withoutTasks.map(t => t.course).join('、') + '\n');

block('✓ 已完成', [...doneWorks, ...doneExams]);

const empty = courses.filter(c =>
  (!c.work || !(c.work.items || []).length) &&
  (!c.exam || !(c.exam.items || []).length));
if (empty.length && SCOPES.includes('work') && SCOPES.includes('exam')) {
  console.log('既无作业也无考试的课程：' + empty.map(c => c.name).join('、') + '\n');
}
const errs = courses.filter(c => c.error || (c.work && c.work.error) || (c.exam && c.exam.error) || (c.task && c.task.error));
if (errs.length) {
  console.log('抓取异常：');
  for (const e of errs) console.log(`  ${e.name}: ${e.error || [e.work && e.work.error, e.exam && e.exam.error, e.task && e.task.error].filter(Boolean).join(',')}`);
  console.log('');
}
console.log(`明细已写入 ${OUT}`);
ws.close();
process.exit(0);
