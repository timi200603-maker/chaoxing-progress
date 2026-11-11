#!/usr/bin/env node
/**
 * 超星学习通 · 作业查交
 *
 * 只读：只浏览「作业列表」页面，不提交、不修改任何作业。
 *
 * 用法:
 *   node check-work.mjs [--semester 20261|all] [--port 9223] [--json out.json] [--timeout 30000]
 *
 * 退出码:
 *   0 成功   2 学期/页面异常   3 未登录   4 浏览器调试端口不可用
 */
import fs from 'node:fs';

/* ---------------- 参数 ---------------- */
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const PORT = parseInt(arg('--port', '9223'), 10);
const OUT = arg('--json', 'chaoxing-work.json');
const FORCE = arg('--semester', null);          // '20261' 或 'all'
const QUIET = argv.includes('--quiet');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = m => { if (!QUIET) console.error('[chaoxing] ' + m); };

/* ---------------- 日期 -> 学期 ---------------- */
export function semesterForDate(d = new Date()) {
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

/* ---------------- CDP 连接 ---------------- */
let tabs;
try {
  tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
} catch {
  console.error(`无法连接 Chrome 调试端口 ${PORT}。请先以 --remote-debugging-port=${PORT} 启动 Chrome（见 SKILL.md）。`);
  process.exit(4);
}
const target = tabs.filter(t => t.type === 'page').find(p => p.url.includes('chaoxing')) || tabs.find(t => t.type === 'page');
if (!target) { console.error('没有可用的浏览器标签页。'); process.exit(4); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let mid = 0;
const pending = new Map();
const evq = [];
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method) evq.push(msg);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++mid;
  pending.set(id, { resolve, reject });
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
    if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
    return r.result.value;
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

const SPACE = 'https://v24.chaoxing.com/wfw/courselist/course3';

/* ---------------- 打开课程列表 + 选学期 ---------------- */
await goto(SPACE, { settle: 2500 });
let state = await ev(`({
  url: location.href,
  login: /passport2|login/i.test(location.href),
  hasList: !!document.querySelector('li.w_couritem, .selectEn_con[name="xq"]')
})`);
if (state && state.login) {
  console.error('NEED_LOGIN: 浏览器尚未登录学习通。请在该窗口自行登录后重跑。');
  process.exit(3);
}
if (!state || !state.hasList) {
  await goto('https://i.chaoxing.com/base', { settle: 2500 });
  await goto(SPACE, { settle: 3000 });
}

const picked = await ev(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = window.jQuery;
  if (!$) return { error: '页面缺少 jQuery，可能未登录或页面结构变更' };
  const want = ${JSON.stringify(want)};
  const ul = document.querySelector('.selectEn_con[name="xq"]');
  const lis = ul ? [...ul.querySelectorAll('li')] : [];
  if (!lis.length) return { error: '找不到学期下拉（页面结构可能已变更）' };

  const all = lis.map(li => ({ value: li.value, semesternum: li.getAttribute('semesternum') || '', label: (li.innerText || '').trim() }));
  let hit;
  if (want === 'all') {
    hit = lis.find(li => (li.innerText || '').trim() === '全部');
  } else {
    hit = lis.find(li => li.getAttribute('semesternum') === want);
    if (!hit) {  // 该学期未开课：退到最近一个更早的学期
      const cands = lis.filter(li => li.getAttribute('semesternum'))
        .sort((a, b) => Number(b.getAttribute('semesternum')) - Number(a.getAttribute('semesternum')));
      hit = cands.find(li => Number(li.getAttribute('semesternum')) <= Number(want)) || cands[0];
    }
  }
  if (!hit) return { error: '学期列表为空', all };

  $(hit).trigger('click');
  await sleep(5000);

  const seen = new Set();
  const courses = [];
  for (const li of document.querySelectorAll('li.w_couritem')) {
    const a = li.querySelector('.w_courtit a') || li.querySelector('a[href*="opencoursenewfy"]');
    const href = a ? (a.getAttribute('href') || '') : '';
    if (!href || seen.has(href)) continue;
    // 课程名优先取 li[cname]，已结课的卡片标题是角标，不能直接读 anchor 文本
    const name = (li.getAttribute('cname') || a.getAttribute('title') || a.innerText || '').trim().replace(/\\s+/g, ' ');
    if (!name) continue;
    seen.add(href);
    courses.push({ name, href, courseId: li.getAttribute('cid') || '', classId: li.getAttribute('classid') || '' });
  }
  return {
    picked: (hit.innerText || '').trim(),
    semesternum: hit.getAttribute('semesternum') || '',
    requested: want,
    fallback: want !== 'all' && hit.getAttribute('semesternum') !== want,
    courses, all
  };
})()`);

if (!picked || picked.error) {
  console.error('学期定位失败: ' + JSON.stringify(picked));
  process.exit(2);
}
log(`当前时间 ${new Date().toLocaleString('zh-CN')} → 学期 ${picked.picked}（semesternum=${picked.semesternum}），课程 ${picked.courses.length} 门`);
if (picked.fallback) log(`注意：请求的学期 ${picked.requested} 不在列表中，已退到最近的 ${picked.semesternum}`);

/* ---------------- 逐课抓作业 ---------------- */
async function scrape(c) {
  const url = new URL(c.href, 'https://v24.chaoxing.com').toString();
  for (let attempt = 0; attempt < 3; attempt++) {
    await goto(url, { settle: 1600 });
    const meta = await ev(`(() => { const v = id => { const e = document.getElementById(id); return e ? e.value : ''; };
      return { courseid: v('courseid'), clazzid: v('clazzid'), cpi: v('cpi'), t: v('t'), enc: v('enc'), workEnc: v('workEnc') }; })()`);
    if (meta && !meta.__error && meta.workEnc) {
      const wu = `https://mooc1.chaoxing.com/mooc2/work/list?courseId=${meta.courseid}` +
        `&classId=${meta.clazzid}&cpi=${meta.cpi}&ut=s&t=${meta.t}&stuenc=${meta.enc}&enc=${meta.workEnc}`;
      await goto(wu, { settle: 2200 });
      const page = await ev(`(() => {
        const body = document.body.innerText || '';
        const items = [...document.querySelectorAll('.bottomList li')].map(li => {
          const n = li.querySelector('.overHidden2'), s = li.querySelector('.status'), t = li.querySelector('.time');
          return {
            name: n ? n.innerText.trim() : '',
            status: s ? s.innerText.trim() : '',
            timeText: t ? (t.innerText || '').replace(/\\s+/g, ' ').trim() : '',
            url: li.getAttribute('data') || ''
          };
        }).filter(x => x.name);
        const m = body.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
        return { summary: m ? m[0] : '', empty: body.includes('暂无作业'), items };
      })()`);
      if (page && !page.__error && (page.items.length || page.empty)) return { name: c.name, ...page };
    }
    await sleep(1000);
  }
  return { name: c.name, error: '抓取失败（重试 3 次）', items: [], summary: '' };
}

const REST = /剩余\s*(\d+)\s*小时\s*(\d+)\s*分钟/;
const isDone = s => /已完成|待批阅|已提交/.test(s);

const courses = [];
for (const c of picked.courses) {
  const r = await scrape(c);
  const items = (r.items || []).map(it => {
    const m = it.timeText.match(REST);
    return {
      ...it,
      done: isDone(it.status),
      deadline: m ? new Date(Date.now() + (+m[1]) * 3600e3 + (+m[2]) * 60e3).toISOString() : ''
    };
  });
  courses.push({ name: c.name, summary: r.summary || '', empty: !!r.empty, error: r.error || '', items });
  log(`${c.name}: ${r.summary || '-'}，共 ${items.length}，未交 ${items.filter(i => !i.done).length}`);
  await sleep(250);
}

/* ---------------- 汇总输出 ---------------- */
const all = courses.flatMap(c => c.items.map(i => ({ course: c.name, ...i })));
const todo = all.filter(i => !i.done)
  .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
const done = all.filter(i => i.done);

const result = {
  generatedAt: new Date().toISOString(),
  semester: picked.picked,
  semesternum: picked.semesternum,
  requestedSemester: picked.requested,
  semesterFallback: !!picked.fallback,
  stats: { courses: courses.length, assignments: all.length, submitted: done.length, pending: todo.length },
  pending: todo,
  submitted: done,
  courses
};
fs.writeFileSync(OUT, JSON.stringify(result, null, 1), 'utf8');

const width = s => { let w = 0; for (const ch of s) w += /[\u4e00-\u9fa5]/.test(ch) ? 2 : 1; return w; };
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));
const fmt = iso => iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }) : '';

console.log(`\n【${result.semester}】${courses.length} 门课 / ${all.length} 个作业 / 已交 ${done.length} / 未交 ${todo.length}\n`);
console.log(todo.length ? '未交：' : '未交：无');
for (const p of todo) {
  console.log(`  ${pad(p.course, 22)} ${pad(p.name, 30)} ${pad(p.status, 6)}${p.deadline ? '截止 ' + fmt(p.deadline) : '未显示截止'}`);
}
if (done.length) {
  console.log('\n已交：');
  for (const d of done) console.log(`  ${pad(d.course, 22)} ${pad(d.name, 30)} ${d.status}`);
}
console.log('');
for (const c of courses) {
  const txt = c.items.length
    ? `${c.items.filter(i => i.done).length}/${c.items.length} 已交`
    : c.empty ? '暂无作业' : (c.error || '无数据');
  console.log(`  ${pad(c.name, 30)} ${txt}`);
}
console.log(`\n明细已写入 ${OUT}`);
ws.close();
process.exit(0);
