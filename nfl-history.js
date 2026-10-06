(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const scopes = {
    all: 'Recovered regular-season results, 2022–2025. Partial years are included; compare accuracy alongside volume.',
    2022: 'Partial archive: Weeks 4–17 only, with 206 recorded outcomes. No full-season champion is inferred.',
    2023: 'All 18 regular-season weeks and 272 outcomes. Angie and Gary have separate personal records.',
    2024: 'All 18 regular-season weeks and 272 outcomes. Nate joined during the season, so his sample is smaller.',
    2025: 'Partial results: 256 of 272 outcomes recorded. Missing winners in Weeks 4, 7 and 8; no final champion inferred.'
  };
  function cell(row, text, header = false, sub = '') {
    const c = document.createElement(header ? 'th' : 'td');
    if (header) c.scope = 'row';
    c.textContent = text;
    if (sub) { const small = document.createElement('small'); small.textContent = sub; c.append(small); }
    row.append(c);
  }
  function draw(target, values, metric, weekly = false) {
    const sorted = [...values].sort((a,b) => b[metric] - a[metric] || a.nick.localeCompare(b.nick));
    const frag = document.createDocumentFragment(); let previous = null, rank = 0;
    sorted.forEach((p,i) => {
      if (p[metric] !== previous) rank = i+1;
      previous = p[metric];
      const tr = document.createElement('tr');
      cell(tr,rank); cell(tr,p.nick,true,p.name || ''); cell(tr,p.correct); cell(tr,p.wrong);
      if (weekly) { cell(tr,p.noPick); cell(tr,p.scored ? (100*p.correct/p.scored).toFixed(1)+'%' : '—'); }
      else { cell(tr,p.pct === null ? '—' : p.pct.toFixed(1)+'%'); cell(tr,p.scored); cell(tr,p.weeks); cell(tr,p.weeklyLeads); }
      frag.append(tr);
    });
    target.replaceChildren(frag);
  }
  fetch('nfl-history-data.json').then(r => { if (!r.ok) throw new Error('data'); return r.json(); }).then(data => {
    function renderStats() {
      const scope = $('history-season').value, metric = $('history-sort').value;
      let values = scope === 'all' ? data.alltime : data.seasons[scope];
      if (metric === 'pct') values = values.filter(p => p.scored >= 200);
      draw($('history-body'),values,metric);
      $('history-context').textContent = scopes[scope] + (metric === 'pct' ? ' Accuracy view includes only players with 200+ scored picks.' : '');
    }
    function renderWeek() {
      const year=+$('week-year').value, week=+$('week-number').value;
      const c=data.coverage.find(c=>c.year===year && c.week===week);
      const values=data.rows.filter(r=>r.year===year && r.week===week).map(r=>({...r,name:data.names[r.nick]}));
      draw($('week-body'),values,'correct',true);
      $('week-context').textContent=`${year} · Week ${week} · ${c.recorded}/${c.games} outcomes recorded. `+(c.recorded===c.games?'Complete outcome coverage.':'Partial: blank winners are excluded; these are not final weekly standings.');
    }
    function setWeeks() {
      const year=+$('week-year').value;
      $('week-number').replaceChildren(...data.coverage.filter(c=>c.year===year).sort((a,b)=>a.week-b.week).map(c=>{
        const o=document.createElement('option');o.value=c.week;o.textContent='Week '+c.week+(c.recorded<c.games?' · partial':'');return o;
      }));
      renderWeek();
    }
    $('history-season').addEventListener('change',renderStats);
    $('history-sort').addEventListener('change',renderStats);
    $('week-year').addEventListener('change',setWeeks);
    $('week-number').addEventListener('change',renderWeek);
    renderStats();setWeeks();
  }).catch(() => {
    $('history-error').textContent='Interactive filters could not load. The saved archive totals remain visible; reload to try again.';
    document.querySelectorAll('.history-controls select').forEach(s=>s.disabled=true);
  });
})();
