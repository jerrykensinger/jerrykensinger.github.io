/* nfl-league.js — live NFL league data for jerrykensinger.com/nfl.html
 *
 * Pulls sanitized league data from the public "NFL League Website Feed"
 * Google Sheet (refreshed every ~30 min from the private master workbook
 * + ESPN's official scoreboard API) and renders:
 *   - pick submission status (counts only)
 *   - game results: team picks stay hidden until every player has submitted
 *     for the week; once all picks are in they go public, with win/loss
 *     (green/red) updating per game as each game goes officially final
 *   - live weekly standings (+ weekly winner once every game is final)
 *
 * If the feed can't be reached, the published static snapshot in the HTML
 * stays in place and a note says so.
 */
(() => {
  'use strict';

  const FEED_ID = '18BN00MtCX4iSMBtkPdbS2LVBOE3BnMdppQnPQY1fUJM';
  const REFRESH_MS = 5 * 60 * 1000;

  const ABBR = {
    'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL',
    'Buffalo Bills': 'BUF', 'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI',
    'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE', 'Dallas Cowboys': 'DAL',
    'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
    'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX',
    'Kansas City Chiefs': 'KC', 'Las Vegas Raiders': 'LV', 'Los Angeles Chargers': 'LAC',
    'Los Angeles Rams': 'LAR', 'Miami Dolphins': 'MIA', 'Minnesota Vikings': 'MIN',
    'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
    'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT',
    'San Francisco 49ers': 'SF', 'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB',
    'Tennessee Titans': 'TEN', 'Washington Commanders': 'WSH', 'New Orlean Saints': 'NO'
  };
  const abbr = name => ABBR[name] || name;

  const $ = id => document.getElementById(id);

  function el(tag, text, cls) {
    const e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  async function gviz(sheet) {
    const url = `https://docs.google.com/spreadsheets/d/${FEED_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheet)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('feed ' + res.status);
    const text = await res.text();
    const data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (data.status !== 'ok') throw new Error('feed status ' + data.status);
    const labels = data.table.cols.map(c => c.label);
    const rows = (data.table.rows || []).map(r => (r.c || []).map(cell => (cell && cell.v !== null && cell.v !== undefined) ? cell.v : ''));
    return { labels, rows };
  }

  function asObjects(parsed) {
    return parsed.rows.map(r => {
      const o = {};
      parsed.labels.forEach((l, i) => { o[l] = r[i]; });
      return o;
    });
  }

  function fmtKickoff(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function renderMeta(meta) {
    const week = meta.week, total = +meta.games_total || 0, fin = +meta.games_final || 0;
    const eyebrow = $('league-eyebrow');
    if (eyebrow) eyebrow.textContent = `NFL Picks League · Week ${week}`;
    const badge = $('league-badge');
    if (badge) badge.textContent = total ? `${fin} / ${total} games final` : 'Season not started';
    const upd = $('league-updated');
    if (upd) upd.textContent = `Live data · updated ${meta.generated_et || ''} · refreshes automatically`;
    const note = $('league-note');
    if (note) note.textContent = 'This page updates automatically from the league tracker — pick counts, results, and standings refresh without republishing. Player nicknames are used throughout. Team picks stay hidden until every player has submitted for the week; once all picks are in they go public, and win/loss updates as each game goes final.';
    const jumpWeek = $('jump-weekly');
    if (jumpWeek) jumpWeek.textContent = `Week ${week}`;
    const weeklyTitle = $('weekly-title');
    if (weeklyTitle) weeklyTitle.textContent = `Week ${week} standings`;
    const gamesTitle = $('games-title');
    if (gamesTitle) gamesTitle.textContent = `Week ${week} game results`;
  }

  function renderCards(meta, weekly) {
    const allIn = meta.all_picks_in === 'yes';
    const c2 = $('card-week-leaders');
    if (c2) {
      if (!allIn) {
        c2.querySelector('h2').textContent = 'Waiting on picks';
        c2.querySelector('p').textContent = 'Standings unlock once every player has submitted.';
      } else if (weekly.length) {
        const leaders = weekly.filter(p => +p.correct === Math.max(...weekly.map(q => +q.correct || 0)));
        const scored = Math.max(...weekly.map(q => +q.scored || 0));
        c2.querySelector('h2').textContent = leaders.map(p => p.player).join(' & ');
        c2.querySelector('p').textContent = `${leaders[0].correct} correct each · ${(+meta.games_total || 0) - (+meta.games_final || 0)} game(s) remaining`;
      }
    }
    const c3 = $('card-pending');
    if (c3) {
      const remaining = (+meta.games_total || 0) - (+meta.games_final || 0);
      c3.querySelector('span').textContent = remaining ? 'Still to be decided' : 'Week complete';
      c3.querySelector('h2').textContent = remaining ? `${remaining} game${remaining > 1 ? 's' : ''} pending` : 'All games final';
      c3.querySelector('p').textContent = remaining ? 'Result pending in the league tracker' : 'Final weekly standings below';
    }
  }

  function renderSubmission(rows) {
    const body = $('submission-body');
    const summary = $('submission-summary');
    if (!body) return;
    body.replaceChildren();
    const complete = rows.filter(r => r.status === 'COMPLETE').length;
    if (summary) {
      summary.textContent = rows.length
        ? `${complete} of ${rows.length} players have all picks in.`
        : 'No players yet.';
    }
    if (!rows.length) {
      const tr = el('tr'); const td = el('td', 'No submission data yet.'); td.colSpan = 3; tr.append(td); body.append(tr);
      return;
    }
    rows.forEach(r => {
      const tr = el('tr');
      const nameCell = el('th', r.player); nameCell.scope = 'row';
      if (r.name) { const s = el('small', ' ' + r.name); s.style.display = 'block'; s.style.fontWeight = '400'; s.style.color = 'var(--muted)'; nameCell.append(s); }
      tr.append(nameCell);
      tr.append(el('td', `${r.picks_in} of ${r.games_total}`));
      const pill = el('span', r.status, 'status-pill ' + (r.status === 'COMPLETE' ? 'complete' : r.status === 'NOT STARTED' ? 'not-started' : 'remaining'));
      const td = el('td'); td.append(pill); tr.append(td);
      body.append(tr);
    });
  }

  function playerCell(player, pick, result) {
    if (!pick && !result) return el('td', '–', 'pick-cell pick-none');
    const td = el('td', '', 'pick-cell ' + (result === 'correct' ? 'pick-correct' : result === 'incorrect' ? 'pick-incorrect' : 'pick-none'));
    td.title = pick ? `${player} picked ${pick}` : `${player}: no pick`;
    const mark = result === 'correct' ? '✓' : result === 'incorrect' ? '✗' : '';
    td.append(el('span', abbr(pick), 'pick-team'));
    if (mark) td.append(el('span', ' ' + mark, 'pick-mark'));
    return td;
  }

  function renderGames(parsed, meta) {
    const body = $('games-body');
    const head = $('games-head');
    if (!body || !head) return;
    const allIn = meta.all_picks_in === 'yes';
    const labels = parsed.labels;
    const players = labels.filter(l => l.endsWith('_pick')).map(l => l.slice(0, -5));
    head.replaceChildren();
    ['Game', 'Away', 'Score', 'Home', 'Score', 'Winner'].forEach(t => head.append(el('th', t, '')));
    players.forEach(p => { const th = el('th', p); th.scope = 'col'; head.append(th); });
    body.replaceChildren();
    asObjects(parsed).forEach(g => {
      const tr = el('tr');
      tr.append(el('td', g.game));
      const awayTh = el('th', g.away); awayTh.scope = 'row'; tr.append(awayTh);
      const final = g.state === 'final';
      const live = g.state === 'in_progress';
      tr.append(el('td', final || live ? g.away_score : '–'));
      tr.append(el('td', g.home));
      tr.append(el('td', final || live ? g.home_score : '–'));
      const winTd = el('td');
      if (final) winTd.textContent = g.winner;
      else if (live) winTd.append(el('span', 'LIVE', 'status-pill live'));
      else if (g.state === 'scheduled' && g.kickoff_et) winTd.append(el('span', fmtKickoff(g.kickoff_et), 'kickoff'));
      else winTd.textContent = '–';
      tr.append(winTd);
      players.forEach(p => {
        // Picks are public once every player has submitted; before that every
        // cell stays hidden. Win/loss highlighting appears per game as it goes final.
        tr.append(allIn ? playerCell(p, g[`${p}_pick`], g[`${p}_result`]) : el('td', '–', 'pick-cell pick-none'));
      });
      body.append(tr);
    });
    const sub = $('games-sub');
    if (sub) {
      const fin = +meta.games_final || 0, total = +meta.games_total || 0;
      sub.textContent = total
        ? (allIn
            ? `${fin} of ${total} games officially final. ✓ = correct pick, ✗ = incorrect.`
            : `Team picks unlock once all ${players.length} players have submitted. ${fin} of ${total} games officially final.`)
        : '';
    }
  }

  function renderWeekly(rows, meta) {
    const body = $('weekly-body');
    if (!body) return;
    const sub = $('weekly-sub');
    const banner = $('weekly-winner');
    const total = +meta.games_total || 0, fin = +meta.games_final || 0;
    const allIn = meta.all_picks_in === 'yes';
    body.replaceChildren();
    if (!allIn) {
      const tr = el('tr');
      const td = el('td', 'Standings unlock once every player has submitted for the week.');
      td.colSpan = 6;
      tr.append(td);
      body.append(tr);
      if (sub) sub.textContent = 'Waiting on picks — no win/loss shown yet.';
      if (banner) banner.replaceChildren();
      return;
    }
    const sorted = [...rows].sort((a, b) => (+b.correct || 0) - (+a.correct || 0) || (+a.wrong || 0) - (+b.wrong || 0));
    let rank = 0, prev = null;
    sorted.forEach((p, i) => {
      const key = `${p.correct}-${p.wrong}`;
      if (key !== prev) rank = i + 1;
      prev = key;
      const tr = el('tr');
      tr.append(el('td', rank));
      const th = el('th', p.player); th.scope = 'row'; tr.append(th);
      tr.append(el('td', p.correct));
      tr.append(el('td', p.wrong));
      tr.append(el('td', p.no_pick));
      const scored = +p.scored || 0;
      tr.append(el('td', scored ? `${p.win_pct}%` : '—'));
      body.append(tr);
    });
    if (sub) sub.textContent = total ? (fin === total ? `Final · all ${total} games scored. Equal records are tied.` : `In progress · ${fin} of ${total} games scored. Equal records are tied.`) : '';
    if (banner) {
      banner.replaceChildren();
      if (total && fin === total && sorted.length) {
        const top = +sorted[0].correct || 0;
        const winners = sorted.filter(p => (+p.correct || 0) === top).map(p => p.player);
        banner.append(el('strong', `Weekly winner${winners.length > 1 ? 's' : ''}: `));
        banner.append(document.createTextNode(`${winners.join(' & ')} (${top}-${sorted[0].wrong})`));
      }
    }
  }

  let lastSeen = '';
  async function refresh() {
    try {
      const [metaP, subP, gamesP, recP] = await Promise.all([
        gviz('meta'), gviz('submission_status'), gviz('games'), gviz('weekly_records')
      ]);
      const meta = asObjects(metaP)[0] || {};
      if (meta.generated_utc && meta.generated_utc === lastSeen) return;
      lastSeen = meta.generated_utc || '';
      const sub = asObjects(subP), rec = asObjects(recP);
      renderMeta(meta);
      renderCards(meta, rec);
      renderSubmission(sub);
      renderGames(gamesP, meta);
      renderWeekly(rec, meta);
    } catch (err) {
      const upd = $('league-updated');
      if (upd && !lastSeen) upd.textContent += ' · live data unavailable — showing published snapshot';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
  setInterval(refresh, REFRESH_MS);
})();
