'use strict';

/* =========================================================
   화면 렌더링 — 홈 / 자산 / 자산상세 / 통계
   ========================================================= */

const ui = {
  tab: 'home',
  sub: null,          // 'settings-assets' | 'settings-cats'
  assetId: null,
  detailTab: 'day',   // day | month | year
  fm: null,           // 자산상세 회계월
  fy: null,           // 자산상세 회계연도
  statFm: null,
  statBucket: 'living',
  openCat: null,
  collapsed: {}
};

function navbar(title, left, right){
  return `<div class="navbar"><div class="navbar-inner">
    <div class="nav-btn">${left||''}</div>
    <div class="nav-title">${esc(title)}</div>
    <div class="nav-btn right">${right||''}</div>
  </div></div>`;
}

function monthNav(fm, actPrev, actNext){
  const r = fiscalRange(fm.y, fm.m);
  return `<div class="monthnav">
      <button data-act="${actPrev}">‹</button>
      <div class="monthnav-t">${fmLabel(fm)}</div>
      <button data-act="${actNext}">›</button>
    </div>
    <div class="monthnav-s">${rangeLabel(r)}</div>`;
}

/* ===================== 홈 ===================== */
function renderHome(){
  const today = todayStr();
  const fm = fiscalOf(today);
  const r = fiscalRange(fm.y, fm.m);
  const sm = summary(r);

  let net = 0, recv = 0;
  for(const a of liveAssets()){
    const b = balanceOf(a.id);
    if(a.kind === 'receivable') recv += b; else net += b;
  }

  // 일일 용돈은 메인자산이 속한 그룹 전체를 쓸 수 있는 돈으로 본다
  const ma = mainAsset();
  const mg = ma ? groupById(ma.groupId) : null;
  const poolAssets = mg ? assetsOfGroup(mg.id) : (ma ? [ma] : []);
  const pool = poolAssets.reduce((s,a)=>s + balanceOf(a.id), 0);
  const left = Math.max(1, daysBetween(today, r.end) + 1);

  // 오늘 그룹에서 나간 지출
  const poolIds = new Set(poolAssets.map(a => a.id));
  let spentToday = 0;
  for(const t of S.txns){
    if(t.date !== today || t.type !== 'expense' || t.excludeFromTotal) continue;
    if(poolIds.has(t.assetId)) spentToday += t.amount;
  }
  // 오늘 쓴 돈을 되더해서 나눈다. 그래야 오늘 쓸수록 목표가 같이 줄어드는
  // (= 아무리 써도 나빠 보이지 않는) 문제가 생기지 않는다.
  const perDay = Math.floor((pool + spentToday) / left);
  const leftToday = perDay - spentToday;

  const spendPct = pct(sm.expense, sm.income);
  const livingW = sm.income > 0 ? Math.min(100, sm.living/sm.income*100) : 0;
  const fixedW  = sm.income > 0 ? Math.min(100-livingW, sm.fixed/sm.income*100) : 0;
  const eventW  = sm.income > 0 ? Math.min(100-livingW-fixedW, sm.event/sm.income*100) : 0;

  const cells = liveAssets().map(a=>{
    const b = balanceOf(a.id);
    return `<button class="gcell" data-act="openAsset" data-id="${a.id}">
      <div class="gcell-n">${esc(a.name)}</div>
      <div class="gcell-v ${balanceClass(a,b)}">${balanceText(a,b,true)}</div>
      ${a.kind==='liability' && b!==0 ? '<div class="gcell-badge" style="color:var(--living)">갚을돈</div>' : ''}
      ${a.kind==='receivable' && b!==0 ? `<div class="gcell-badge">${b<0?'받을돈':'미리받음'}</div>` : ''}
    </button>`;
  }).join('');

  return navbar('홈','', `<button data-act="newTxn" class="nav-btn icon">＋</button>`) + `
  <div class="hero">
    <div class="hero-label">총 잔액</div>
    <div class="hero-amt num ${net<0?'c-living':''}">${won(net)}</div>
    ${recv !== 0 ? `<div class="hero-sub">${recv < 0 ? '정산받을 돈' : '미리 받은 돈'} ${won(Math.abs(recv))} · 총 잔액에 미포함</div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">${fmLabel(fm)} · ${rangeLabel(r)}</div>
    <div class="card">
      <div class="trio">
        <div><div class="trio-k">수입</div><div class="trio-v c-income num">${fmt(sm.income)}</div></div>
        <div><div class="trio-k">지출</div><div class="trio-v c-living num">${fmt(sm.expense)}</div></div>
        <div><div class="trio-k">잔액</div><div class="trio-v num ${sm.income-sm.expense<0?'c-living':''}">${fmt(sm.income-sm.expense)}</div></div>
      </div>
      <div class="split">
        <div class="split-row tap-row" data-act="bucketList" data-v="living">
          <div class="split-k"><span class="dot" style="background:var(--living)"></span>생활지출</div>
          <div class="split-v lead c-living num">${won(sm.living)}<span class="chev sm">›</span></div>
        </div>
        <div class="split-row tap-row" data-act="bucketList" data-v="fixed">
          <div class="split-k"><span class="dot" style="background:${fixedColorVar()}"></span>고정지출 <span class="c-lbl3">자동</span></div>
          <div class="split-v ${fixedClass()} num">${won(sm.fixed)}<span class="chev sm">›</span></div>
        </div>
        <div class="split-row tap-row" data-act="bucketList" data-v="event">
          <div class="split-k"><span class="dot" style="background:var(--event)"></span>이벤트지출</div>
          <div class="split-v c-event num">${won(sm.event)}<span class="chev sm">›</span></div>
        </div>
        ${sm.pending ? `<div class="split-row tap-row" data-act="bucketList" data-v="passthrough">
          <div class="split-k"><span class="dot" style="background:var(--muted)"></span>대납 · 정산예정</div>
          <div class="split-v c-muted num">${won(sm.pending)}<span class="chev sm">›</span></div>
        </div>` : ''}
        <div class="ratio-track">
          <div class="ratio-seg" style="width:${livingW}%;background:var(--living)"></div>
          <div class="ratio-seg" style="width:${fixedW}%;background:${fixedColorVar()}"></div>
          <div class="ratio-seg" style="width:${eventW}%;background:var(--event)"></div>
        </div>
        <div class="split-row" style="padding-top:7px">
          <div class="split-k">수입 대비 지출</div>
          <div class="split-v num ${spendPct>100?'c-living':''}">${spendPct}%</div>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="pocket">
        <div class="pocket-k">💰 오늘 남은 돈</div>
        <div class="pocket-v num ${leftToday<0?'c-living':''}">${won(leftToday)}<span class="pocket-of">/ ${won(perDay)}</span></div>
        <div class="pocket-sub">${spentToday ? `오늘 ${fmt(spentToday)}원 썼어요` : '오늘 아직 안 썼어요'}</div>
        <div class="pocket-sub">${mg?esc(mg.name)+' 그룹':'메인자산 없음'} · ${fmt(pool+spentToday)}원 ÷ 남은 ${left}일 (${r.end.slice(5).replace('-','/')}까지)</div>
        ${poolAssets.length > 1 ? `<div class="pocket-sub">${poolAssets.map(a=>esc(a.name)).join(' + ')}</div>` : ''}
      </div>
    </div>
  </div>

  ${compareCard(fm, r, today)}

  <div class="section">
    <div class="section-title">자산</div>
    <div class="card"><div class="grid5">${cells}</div></div>
  </div>

  <div class="section">
    <div class="card">
      <div class="row tap" data-act="goStats"><div class="row-main"><div class="row-title">📊 이번 달 통계 보기</div></div><div class="chev">›</div></div>
    </div>
  </div>
  <div style="height:20px"></div>`;
}

/** 저번 달 같은 일차와 '남은 여유'를 비교한다.
 *  이번 달은 진행 중이라 완결된 저번 달과 그냥 견주면 항상 이번 달이 이긴다.
 *  그래서 저번 달도 같은 일차까지만 잘라서 본다. */
function compareCard(fm, r, today){
  const dayIdx = Math.max(0, daysBetween(r.start, today));
  const dayNo  = dayIdx + 1;
  const pv = shiftMonth(fm, -1);

  if(!monthHasTxn(pv)){
    return `<div class="section">
      <div class="card"><div class="pocket">
        <div class="pocket-k">📊 저번 달과 비교</div>
        <div class="pocket-sub" style="margin-top:6px;line-height:1.6">
          저번 달 기록이 없어 아직 비교할 수 없어요.<br>
          다음 달부터 <b>같은 일차끼리</b> 남은 여유를 견줘 드릴게요.
        </div>
      </div></div>
    </div>`;
  }

  const cur  = slackUpTo(fm, dayIdx);
  const prev = slackUpTo(pv, dayIdx);
  const diff = cur.slack - prev.slack;
  const cls  = diff > 0 ? 'c-income' : diff < 0 ? 'c-living' : '';
  const word = diff > 0 ? '더 남았어요' : diff < 0 ? '덜 남았어요' : '저번 달과 같아요';

  return `<div class="section">
    <div class="card"><div class="pocket">
      <div class="pocket-k">📊 저번 달 이맘때보다</div>
      <div class="pocket-v num ${cls}">${diff === 0 ? '' : won(Math.abs(diff))}<span class="pocket-suffix">${word}</span></div>
      <div class="cmp">
        <div class="cmp-row"><span>이번 달 ${dayNo}일차</span><span class="num">${won(cur.slack)}</span></div>
        <div class="cmp-row c-lbl2"><span>저번 달 ${dayNo}일차</span><span class="num">${won(prev.slack)}</span></div>
      </div>
    </div></div>
  </div>`;
}

/* ===================== 자산 집계표 ===================== */
function renderAssets(){
  let asset = 0, liab = 0, recv = 0;
  for(const a of liveAssets()){
    const b = balanceOf(a.id);
    if(a.kind === 'liability') liab += b;
    else if(a.kind === 'receivable') recv += b;
    else asset += b;
  }

  let body = '';
  for(const g of S.groups){
    const list = assetsOfGroup(g.id);
    if(!list.length) continue;
    const gsum = list.reduce((s,a)=>s+balanceOf(a.id), 0);
    const open = !ui.collapsed[g.id];
    body += `<div class="ghead" data-act="toggleGroup" data-id="${g.id}">
        <div class="ghead-n">${open?'▾':'▸'} ${esc(g.name)}</div>
        <div class="ghead-v num ${gsum<0?'c-living':''}">${won(gsum)}</div>
      </div>`;
    if(!open) continue;
    body += '<div class="card">' + list.map(a=>{
      const b = balanceOf(a.id);
      const isMain = S.settings.mainAssetId === a.id;
      return `<div class="row tap" data-act="openAsset" data-id="${a.id}">
        <div class="row-main">
          <div class="row-title">${isMain?'⭐ ':''}${esc(a.name)}</div>
          ${a.kind!=='asset' ? `<div class="row-sub">${
              a.kind==='liability' ? '부채 · 갚을 돈'
              : '대납 · 합계 미포함 · ' + (b < 0 ? '받을 돈' : b > 0 ? '미리 받음' : '정산 완료')
            }</div>`:''}
        </div>
        <div><div class="row-val ${balanceClass(a,b)} num">${balanceText(a,b)}</div></div>
        <div class="chev">›</div>
      </div>`;
    }).join('') + '</div>';
  }

  return navbar('자산','', `<button data-act="goAssetSettings" class="nav-btn icon">✏️</button>`) + `
  <div class="section" style="margin-top:12px">
    <div class="card">
      <div class="trio">
        <div><div class="trio-k">자산</div><div class="trio-v c-income num">${fmt(asset)}</div></div>
        <div><div class="trio-k">부채</div><div class="trio-v c-living num">${fmt(liab)}</div></div>
        <div><div class="trio-k">합계</div><div class="trio-v num ${asset+liab<0?'c-living':''}">${fmt(asset+liab)}</div></div>
      </div>
      ${recv!==0 ? `<div class="split"><div class="split-row">
        <div class="split-k">${recv < 0 ? '정산받을 돈' : '미리 받은 돈'} <span class="c-lbl3">합계 미포함</span></div>
        <div class="split-v c-muted num">${won(Math.abs(recv))}</div>
      </div></div>` : ''}
    </div>
  </div>
  <div class="section">${body}</div>
  <div style="height:24px"></div>`;
}

/* ===================== 자산 상세 ===================== */
function renderAssetDetail(){
  const a = assetById(ui.assetId);
  if(!a){ ui.tab='assets'; return renderAssets(); }
  if(!ui.fm) ui.fm = fiscalOf(todayStr());
  if(!ui.fy) ui.fy = fiscalOf(todayStr()).y;

  const tabs = `<div class="hscroll">
    <button class="hstab" data-act="goHome">홈</button>
    ${liveAssets().map(x=>`<button class="hstab ${x.id===a.id?'on':''}" data-act="openAsset" data-id="${x.id}">${esc(x.name)}</button>`).join('')}
  </div>`;

  const bal = balanceOf(a.id);
  let head = navbar(a.name,
      `<button data-act="goAssets">‹ 자산</button>`,
      `<button data-act="editAsset" data-id="${a.id}" class="nav-btn icon">✏️</button>`) + tabs + `
    <div class="hero" style="text-align:center;padding-top:18px">
      <div class="hero-label">현재 누적잔액</div>
      <div class="hero-amt num ${bal<0?'c-living':''}">${won(bal)}</div>
    </div>
    <div class="acts">
      <button class="act ex" data-act="newTxn" data-v="expense">지출</button>
      <button class="act in" data-act="newTxn" data-v="income">수입</button>
      <button class="act tr" data-act="newTxn" data-v="transfer">이체</button>
    </div>
    <div class="section"><div class="seg">
      <button class="${ui.detailTab==='day'?'on':''}" data-act="detailTab" data-v="day">일별</button>
      <button class="${ui.detailTab==='month'?'on':''}" data-act="detailTab" data-v="month">월별</button>
      <button class="${ui.detailTab==='year'?'on':''}" data-act="detailTab" data-v="year">연별</button>
    </div></div>`;

  if(ui.detailTab === 'day')   return head + detailDay(a);
  if(ui.detailTab === 'month') return head + detailMonth(a);
  return head + detailYear(a);
}

function detailDay(a){
  const r = fiscalRange(ui.fm.y, ui.fm.m);
  const st = periodStats(a.id, r.start, r.end);
  const sm = summary(r, a.id);
  const rm = runningMap(a.id);

  const list = txnsOfAsset(a.id).filter(t=>inRange(t.date, r)).sort(cmpDesc);
  const byDay = {};
  for(const t of list){ (byDay[t.date] = byDay[t.date] || []).push(t); }

  let rows = '';
  for(const date of Object.keys(byDay).sort().reverse()){
    const items = byDay[date];
    let din = 0, dout = 0;
    for(const t of items){ const d = delta(t, a.id); if(d>0) din += d; else dout += -d; }
    const d = parseD(date);
    rows += `<div class="dayhead">
      <div class="dayhead-d">${d.getDate()}</div>
      <div class="dayhead-w">${WD[d.getDay()]}요일</div>
      <div class="dayhead-sp"></div>
      <div class="dayhead-v c-income num">${fmt(din)}원</div>
      <div class="dayhead-v c-living num">${fmt(dout)}원</div>
    </div><div class="card flush">`;
    for(const t of items) rows += txnRow(t, a.id, rm[t.id]);
    rows += '</div>';
  }
  if(!rows) rows = `<div class="empty">이 기간에 내역이 없습니다.<br>아래 ＋ 로 추가해 보세요.</div>`;

  return monthNav(ui.fm,'prevMonth','nextMonth') + `
    <div class="card">
      <div class="trio">
        <div><div class="trio-k">수입</div><div class="trio-v c-income num">${fmt(sm.income)}</div></div>
        <div><div class="trio-k">지출</div><div class="trio-v c-living num">${fmt(sm.expense)}</div></div>
        <div><div class="trio-k">이체입금</div><div class="trio-v num">${fmt(sm.transfer)}</div></div>
      </div>
      ${sm.pending?`<div class="split"><div class="split-row"><div class="split-k">정산예정 (합계 제외)</div><div class="split-v c-muted num">${won(sm.pending)}</div></div></div>`:''}
    </div>
    <div class="section">${rows}</div>
    ${catBreakdown(r, a.id)}
    <div style="height:24px"></div>`;
}

function txnRow(t, assetId, bal){
  const d = delta(t, assetId);
  let cls, amtTxt, cat;
  if(t.type === 'transfer'){
    cls = 'c-transfer'; cat = '이체';
    amtTxt = fmt(Math.abs(d)) + '원';
  }else if(t.type === 'income'){
    cls = 'c-income'; cat = catName(t.categoryId);
    amtTxt = fmt(t.amount) + '원';
  }else{
    cls = t.excludeFromTotal ? 'c-transfer' : (t.bucket === 'fixed' ? fixedClass() : 'c-living');
    cat = catName(t.categoryId);
    amtTxt = fmt(t.amount) + '원';
  }
  const c = catById(t.categoryId);
  const memo = t.type === 'transfer'
    ? `${esc(assetName(t.assetId))} → ${esc(assetName(t.toAssetId))}`
    : esc(t.memo || catName(t.categoryId));
  return `<div class="txn" data-act="editTxn" data-id="${t.id}">
    <div class="txn-cat">${c&&t.type!=='transfer'?c.emoji+' ':''}${esc(cat)}</div>
    <div class="txn-body">
      <div class="txn-memo">${memo}${t.excludeFromTotal?'<span class="tag">미표기</span>':''}${t.type==='expense'&&t.bucket==='fixed'?'<span class="tag">고정</span>':''}</div>
    </div>
    <div class="txn-right">
      <div class="txn-amt ${cls} num">${amtTxt}</div>
      <div class="txn-bal num">${fmt(bal)}</div>
    </div>
  </div>`;
}

function catBreakdown(r, assetId){
  const map = {};
  let total = 0;
  for(const t of S.txns){
    if(t.type !== 'expense' || t.excludeFromTotal) continue;
    if(!inRange(t.date, r)) continue;
    if(assetId && t.assetId !== assetId) continue;
    const k = t.categoryId || 'none';
    (map[k] = map[k] || { amt:0, items:[] });
    map[k].amt += t.amount; map[k].items.push(t);
    total += t.amount;
  }
  const keys = Object.keys(map).sort((x,y)=>map[y].amt-map[x].amt);
  if(!keys.length) return '';

  const rows = keys.map(k=>{
    const c = catById(k);
    const e = map[k];
    const open = ui.openCat === k;
    const p = pct(e.amt, total);
    const sub = open ? `<div class="subitems">${e.items.sort(cmpDesc).map(t=>`
        <div class="subitem" data-act="editTxn" data-id="${t.id}">
          <div class="subitem-b"><div class="subitem-t">${esc(t.memo||catName(t.categoryId))}</div><div class="subitem-d">${t.date}</div></div>
          <div class="subitem-v ${t.bucket==='fixed'?fixedClass():'c-living'} num">${won(t.amount)}</div>
        </div>`).join('')}</div>` : '';
    return `<div class="catrow">
      <div class="catrow-top" data-act="toggleCat" data-id="${k}">
        <span class="dot" style="background:${c?c.color:'#8E8E93'}"></span>
        <span class="catrow-n">${esc(c?c.name:'미분류')} <span class="catrow-arrow">${open?'▲':'▼'}</span></span>
        <span class="catrow-v num">${won(e.amt)}</span>
        <span class="catrow-p num">${p}%</span>
      </div>
      <div class="catrow-track"><div class="catrow-fill" style="width:${p}%;background:${c?c.color:'#8E8E93'}"></div></div>
      ${sub}
    </div>`;
  }).join('');

  return `<div class="section">
    <div class="section-title">분류별 지출</div>
    <div class="card">${rows}
      <div class="total-row"><span>합계</span><span class="num">${won(total)}</span></div>
    </div>
  </div>`;
}

function detailMonth(a){
  const yr = fiscalYearRange(ui.fy);
  const tot = periodStats(a.id, yr.start, yr.end);
  let rows = '';
  for(let m = 11; m >= 0; m--){
    const r = fiscalRange(ui.fy, m);
    const st = periodStats(a.id, r.start, r.end);
    const isNow = fiscalOf(todayStr()).y === ui.fy && fiscalOf(todayStr()).m === m;
    rows += `<div class="row tap" data-act="pickMonth" data-v="${m}" ${isNow?'style="background:var(--fill)"':''}>
      <div class="row-main">
        <div class="row-title">${m+1}월</div>
        <div class="row-sub">${rangeLabel(r)}</div>
      </div>
      <div style="min-width:96px">
        <div class="row-val c-income num">${fmt(st.inn)}원</div>
        <div class="row-val-sub num">${fmt(st.net)}원</div>
      </div>
      <div style="min-width:96px">
        <div class="row-val c-living num">${fmt(st.out)}원</div>
        <div class="row-val-sub num">(${fmt(st.endBal)}원)</div>
      </div>
    </div>`;
  }
  return `<div class="monthnav">
      <button data-act="prevYear">‹</button>
      <div class="monthnav-t">${ui.fy}년</div>
      <button data-act="nextYear">›</button>
    </div>
    <div class="monthnav-s">${rangeLabelY(yr)}</div>
    <div class="card">
      <div class="trio">
        <div><div class="trio-k">입금</div><div class="trio-v c-income num">${fmt(tot.inn)}</div></div>
        <div><div class="trio-k">출금</div><div class="trio-v c-living num">${fmt(tot.out)}</div></div>
        <div><div class="trio-k">합계</div><div class="trio-v num">${fmt(tot.net)}</div></div>
      </div>
    </div>
    <div class="section"><div class="card">${rows}</div></div>
    <div style="height:24px"></div>`;
}

function detailYear(a){
  const years = new Set([fiscalOf(todayStr()).y]);
  for(const t of txnsOfAsset(a.id)) years.add(fiscalOf(t.date).y);
  const list = Array.from(years).sort((x,y)=>y-x);
  let tIn = 0, tOut = 0;
  for(const y of list){
    const r = fiscalYearRange(y), st = periodStats(a.id, r.start, r.end);
    tIn += st.inn; tOut += st.out;
  }
  const head = `<div class="card"><div class="trio">
      <div><div class="trio-k">입금</div><div class="trio-v c-income num">${fmt(tIn)}</div></div>
      <div><div class="trio-k">출금</div><div class="trio-v c-living num">${fmt(tOut)}</div></div>
      <div><div class="trio-k">합계</div><div class="trio-v num">${fmt(tIn-tOut)}</div></div>
    </div></div>`;
  const rows = list.map(y=>{
    const r = fiscalYearRange(y);
    const st = periodStats(a.id, r.start, r.end);
    return `<div class="row tap" data-act="pickYear" data-v="${y}">
      <div class="row-main">
        <div class="row-title">${y}년</div>
        <div class="row-sub">${rangeLabelY(r)}</div>
      </div>
      <div style="min-width:96px">
        <div class="row-val c-income num">${fmt(st.inn)}원</div>
        <div class="row-val-sub num">${fmt(st.net)}원</div>
      </div>
      <div style="min-width:96px">
        <div class="row-val c-living num">${fmt(st.out)}원</div>
        <div class="row-val-sub num">(${fmt(st.endBal)}원)</div>
      </div>
    </div>`;
  }).join('');
  return head + `<div class="section"><div class="card">${rows}</div></div><div style="height:24px"></div>`;
}

/* ===================== 통계 ===================== */
function renderStats(){
  if(!ui.statFm) ui.statFm = fiscalOf(todayStr());
  const r = fiscalRange(ui.statFm.y, ui.statFm.m);
  const sm = summary(r);
  const prev = shiftMonth(ui.statFm, -1);
  const smPrev = summary(fiscalRange(prev.y, prev.m));

  const b = ui.statBucket;
  const pick = (s) => b === 'all' ? s.expense : (s[b] || 0);
  const cur = pick(sm), before = pick(smPrev);
  const diff = before > 0 ? Math.round((cur-before)/before*100) : null;

  // 분류별
  const map = {}; let total = 0;
  for(const t of S.txns){
    if(t.type !== 'expense' || t.excludeFromTotal) continue;
    if(!inRange(t.date, r)) continue;
    if(b !== 'all' && (t.bucket || 'living') !== b) continue;
    if(b === 'all' && t.bucket === 'passthrough') continue;
    (map[t.categoryId] = map[t.categoryId] || { amt:0, items:[] });
    map[t.categoryId].amt += t.amount; map[t.categoryId].items.push(t);
    total += t.amount;
  }
  const keys = Object.keys(map).sort((x,y)=>map[y].amt-map[x].amt);
  const rows = keys.length ? keys.map(k=>{
    const c = catById(k), e = map[k], open = ui.openCat === k, p = pct(e.amt, total);
    const sub = open ? `<div class="subitems">${e.items.sort(cmpDesc).map(t=>`
      <div class="subitem" data-act="editTxn" data-id="${t.id}">
        <div class="subitem-b"><div class="subitem-t">${esc(t.memo||catName(t.categoryId))}</div>
          <div class="subitem-d">${t.date} · ${esc(assetName(t.assetId))}</div></div>
        <div class="subitem-v ${t.bucket==='fixed'?fixedClass():'c-living'} num">${won(t.amount)}</div>
      </div>`).join('')}</div>` : '';
    return `<div class="catrow">
      <div class="catrow-top" data-act="toggleCat" data-id="${k}">
        <span class="dot" style="background:${c?c.color:'#8E8E93'}"></span>
        <span class="catrow-n">${esc(c?c.name:'미분류')} <span class="catrow-arrow">${open?'▲':'▼'}</span></span>
        <span class="catrow-v num">${won(e.amt)}</span>
        <span class="catrow-p num">${p}%</span>
      </div>
      <div class="catrow-track"><div class="catrow-fill" style="width:${p}%;background:${c?c.color:'#8E8E93'}"></div></div>
      ${sub}
    </div>`;
  }).join('') : `<div class="empty">해당 지출이 없습니다.</div>`;

  const free = sm.income - sm.fixed;

  return navbar('통계') + monthNav(ui.statFm,'prevStatMonth','nextStatMonth') + `
  <div class="seg seg-bucket">
    <button class="b-living ${b==='living'?'on':''}" data-act="statBucket" data-v="living">생활</button>
    <button class="b-fixed ${b==='fixed'?'on':''}" data-act="statBucket" data-v="fixed">고정</button>
    <button class="b-event ${b==='event'?'on':''}" data-act="statBucket" data-v="event">이벤트</button>
    <button class="${b==='all'?'on':''}" data-act="statBucket" data-v="all">전체</button>
  </div>

  <div class="section">
    <div class="card"><div class="pad">
      <div class="pocket-k">${fmLabel(ui.statFm)} ${b==='all'?'전체 지출':BUCKET_NAME[b]}</div>
      <div class="pocket-v num ${b==='all'?'c-living':bucketClass(b)}">${won(cur)}</div>
      <div class="pocket-sub">${diff===null?'전월 데이터 없음':`전월 대비 ${diff>0?'▲':diff<0?'▼':'-'} ${Math.abs(diff)}% (${fmt(before)}원)`}</div>
    </div></div>
  </div>

  <div class="section">
    <div class="section-title">진짜 여윳돈</div>
    <div class="card">
      <div class="row"><div class="row-main"><div class="row-title">이번 달 수입</div></div><div class="row-val c-income num">${won(sm.income)}</div></div>
      <div class="row tap" data-act="bucketList" data-v="fixed"><div class="row-main"><div class="row-title">− 고정지출 <span class="c-lbl3">이미 결정된 돈</span></div></div><div class="row-val ${fixedClass()} num">${won(sm.fixed)}</div><div class="chev">›</div></div>
      <div class="row"><div class="row-main"><div class="row-title">쓸 수 있었던 돈</div></div><div class="row-val num">${won(free)}</div></div>
      <div class="row tap" data-act="bucketList" data-v="living"><div class="row-main"><div class="row-title">− 생활지출</div></div><div class="row-val c-living num">${won(sm.living)}</div><div class="chev">›</div></div>
      <div class="row tap" data-act="bucketList" data-v="event"><div class="row-main"><div class="row-title">− 이벤트지출</div></div><div class="row-val c-event num">${won(sm.event)}</div><div class="chev">›</div></div>
      <div class="row" style="background:var(--fill)"><div class="row-main"><div class="row-title" style="font-weight:600">남은 여유</div></div>
        <div class="row-val num" style="font-weight:700;${free-sm.living-sm.event<0?'color:var(--living)':''}">${won(free - sm.living - sm.event)}</div></div>
    </div>
    <div class="hint">고정지출은 이번 달에 바꿀 수 없는 돈입니다. 먼저 빼고 남은 것만으로 평가하면 실제 소비 습관이 보입니다.</div>
  </div>

  <div class="section">
    <div class="section-title">분류별</div>
    <div class="card">${rows}${keys.length?`<div class="total-row"><span>합계</span><span class="num">${won(total)}</span></div>`:''}</div>
  </div>

  <div class="section">
    <div class="section-title">AI 분석</div>
    <div class="card">
      <div class="row tap" data-act="copyAnalysis">
        <div class="row-main"><div class="row-title">📋 ${fmLabel(ui.statFm)} 분석용 텍스트 복사</div>
          <div class="row-sub">복사해서 AI에 붙여넣으면 이 달 지출을 분석해 줍니다</div></div>
        <div class="chev">›</div>
      </div>
      <div class="row tap" data-act="previewAnalysis">
        <div class="row-main"><div class="row-title c-lbl2">복사될 내용 보기</div></div>
        <div class="chev">›</div>
      </div>
    </div>
  </div>

  ${sm.pending?`<div class="section">
    <div class="section-title">대납 · 정산예정 (지출 미표기)</div>
    <div class="card"><div class="row"><div class="row-main"><div class="row-title">이번 달 대납액</div>
      <div class="row-sub">내 지출에 포함되지 않습니다</div></div>
      <div class="row-val c-muted num">${won(sm.pending)}</div></div></div>
  </div>`:''}
  <div style="height:24px"></div>`;
}
