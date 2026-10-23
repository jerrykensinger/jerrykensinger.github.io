/* nfl-league.js — live NFL league data for jerrykensinger.com/nfl.html
 *
 * Pulls sanitized league data from the public "NFL League Website Feed"
 * Google Sheet (refreshed every ~30 min from the private master workbook
 * + ESPN's official scoreboard API) and renders:
 *   - pick submission status (counts only)
 *   - game results: each game's picks are revealed once every player has
 *     picked that matchup (or after its kickoff); win/loss (green/red)
 *     updates per game as each game goes officially final
 *   - live weekly standings over fully-picked final games (+ weekly winner
 *     once every game is final)
 *   - season standings rendered live from the league tracker's Season
 *     Standings tab (via the feed's season_standings tab)
 *
 * If the feed can't be reached, show a clear error or keep the last
 * successfully loaded data with its update time.
 */
(() => {
  'use strict';

  const FEED_ID = '18BN00MtCX4iSMBtkPdbS2LVBOE3BnMdppQnPQY1fUJM';
  const REFRESH_MS = 5 * 60 * 1000;
  // Data files live on the main site; nfl.jerrykensinger.com loads them cross-origin.
  const SITE = 'https://jerrykensinger.com/';

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
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
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

  async function weeklyHistory() {
    const res = await fetch(SITE + 'nfl-weekly-history.json?ts=' + Date.now(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error('weekly history ' + res.status);
    return res.json();
  }

  function fmtKickoff(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
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
    if (note) note.textContent = 'This page updates automatically from the league tracker — pick counts, results, and standings refresh without republishing. Player nicknames are used throughout. A game\u2019s picks are revealed once every player has picked that matchup (or after its kickoff); win/loss then updates as each game goes final.';
    const jumpWeek = $('jump-weekly');
    if (jumpWeek) jumpWeek.textContent = `Week ${week}`;
    const weeklyTitle = $('weekly-title');
    if (weeklyTitle) weeklyTitle.textContent = `Week ${week} standings`;
    const gamesTitle = $('games-title');
    if (gamesTitle) gamesTitle.textContent = `Week ${week} game results`;
    ['weekly', 'games'].forEach(id => {
      const section = $(id);
      section.querySelector('[role="region"]').setAttribute('aria-label', `Week ${week} ${id === 'weekly' ? 'standings' : 'game results'}`);
      section.querySelector('caption').textContent = `Week ${week} ${id === 'weekly' ? 'standings' : 'game results'}`;
    });
  }

  function renderCards(meta, weekly) {
    const scored = +meta.games_scored || 0;
    const c2 = $('card-week-leaders');
    if (c2) {
      c2.querySelector('span').textContent = `Week ${meta.week} leaders`;
      if (!scored || !weekly.length) {
        c2.querySelector('h2').textContent = 'Waiting for results';
        c2.querySelector('p').textContent = 'Standings appear as games finish and picks are scored.';
      } else {
        const leaders = weekly.filter(p => +p.correct === Math.max(...weekly.map(q => +q.correct || 0)));
        c2.querySelector('h2').textContent = leaders.map(p => p.player).join(' & ');
        const remaining = Math.max(0, (+meta.games_total || 0) - (+meta.games_final || 0));
        c2.querySelector('p').textContent = `${leaders[0].correct} correct${leaders.length > 1 ? ' each' : ''} · ${remaining} game${remaining === 1 ? '' : 's'} remaining`;
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

  // League split for a revealed game, counted only from that game's own pick
  // cells. The feed blanks them until the game is revealed, so an unrevealed
  // game never gets a row (and no split can leak).
  function consensusRow(g, picks, span) {
    const A = abbr(g.away), H = abbr(g.home);
    const away = picks.filter(p => abbr(p) === A).length;
    const home = picks.filter(p => abbr(p) === H).length;
    const total = away + home;
    if (!total) return null;
    const hi = Math.max(away, home), lo = Math.min(away, home);
    const summary = !lo ? `Unanimous — all ${total} on ${away ? A : H}`
      : away === home ? `Dead even, ${away}–${home}`
      : `League leans ${away > home ? A : H} ${hi}–${lo}`;
    const label = el('div', null, 'consensus-label');
    label.append(el('span', `${A} · ${away}`, 'away'), el('span', summary, 'consensus-summary'), el('span', `${home} · ${H}`, 'home'));
    const bar = el('div', null, 'consensus-bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', `League picks: ${away} on ${g.away}, ${home} on ${g.home}`);
    [['away', away], ['home', home]].forEach(([side, n]) => {
      if (!n) return;
      const seg = el('span', null, 'consensus-seg ' + side);
      seg.style.width = `${(n / total) * 100}%`;
      bar.append(seg);
    });
    const wrap = el('div', null, 'consensus');
    wrap.append(label, bar);
    const td = el('td'); td.colSpan = span; td.append(wrap);
    const tr = el('tr', null, 'consensus-row'); tr.append(td);
    return tr;
  }

  function renderGames(parsed, meta) {
    const body = $('games-body');
    const head = $('games-head');
    if (!body || !head) return;
    const labels = parsed.labels;
    const players = labels.filter(l => l.endsWith('_pick')).map(l => l.slice(0, -5));
    head.replaceChildren();
    ['Game', 'Away', 'Score', 'Home', 'Score', 'Winner / kickoff'].forEach(t => { const th = el('th', t); th.scope = 'col'; head.append(th); });
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
      if (final) {
        const tied = g.away_score !== '' && g.home_score !== '' && +g.away_score === +g.home_score;
        winTd.textContent = g.winner || (tied ? 'TIE' : 'Final');
      }
      else if (live) winTd.append(el('span', 'LIVE', 'status-pill live'));
      else if (g.state === 'scheduled' && g.kickoff_et) {
        winTd.append(el('span', fmtKickoff(g.kickoff_et), 'kickoff'));
        winTd.append(el('br'));
        const nPicked = +g.n_picked || 0;
        winTd.append(el('span', nPicked >= players.length ? 'All picks in' : `${nPicked} of ${players.length} picked`,
          'status-pill ' + (nPicked >= players.length ? 'complete' : 'togo')));
      }
      else winTd.textContent = '–';
      tr.append(winTd);
      // The feed blanks pick cells for games that aren't revealed yet, so
      // each game's picks appear independently as that matchup fills up.
      players.forEach(p => {
        tr.append(playerCell(p, g[`${p}_pick`], g[`${p}_result`]));
      });
      body.append(tr);
      const picks = players.map(p => String(g[`${p}_pick`] || '').trim()).filter(Boolean);
      const meter = picks.length ? consensusRow(g, picks, 6 + players.length) : null;
      if (meter) {
        tr.classList.add('has-consensus');
        body.append(meter);
      }
    });
    const sub = $('games-sub');
    if (sub) {
      const fin = +meta.games_final || 0, total = +meta.games_total || 0;
      sub.textContent = total
        ? `${fin} of ${total} games officially final. A game's picks are revealed once every player has picked that matchup (or after kickoff). ✓ = correct pick, ✗ = incorrect.`
        : '';
    }
  }

  function renderWeekly(rows, meta) {
    const body = $('weekly-body');
    if (!body) return;
    const sub = $('weekly-sub');
    const banner = $('weekly-winner');
    const total = +meta.games_total || 0, fin = +meta.games_final || 0;
    const scored = +meta.games_scored || 0;
    body.replaceChildren();
    if (!scored) {
      const tr = el('tr');
      const td = el('td', 'No fully-picked final games yet — standings appear as each matchup fills up and completes.');
      td.colSpan = 6;
      tr.append(td);
      body.append(tr);
      if (sub) sub.textContent = fin ? 'Waiting for scored results — no win/loss shown yet.' : 'Waiting for game results — no win/loss shown yet.';
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
    if (sub) sub.textContent = total ? (fin === total ? `Final · all ${total} games final. NFL ties are treated as pushes. Equal records are tied.` : `In progress · counting ${scored} of ${total} games (fully picked & final). Equal records are tied.`) : '';
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

  function renderSeason(rows, meta) {
    const body = $('season-body');
    if (!body) return;
    const sorted = [...rows].sort((a, b) => (+a.rank || 99) - (+b.rank || 99));
    body.replaceChildren();
    sorted.forEach(p => {
      const tr = el('tr');
      tr.append(el('td', p.rank));
      const th = el('th', p.player); th.scope = 'row'; tr.append(th);
      tr.append(el('td', p.correct));
      tr.append(el('td', p.wrong));
      tr.append(el('td', `${p.win_pct}%`));
      tr.append(el('td', p.weekly_wins));
      body.append(tr);
    });
    const sub = $('season-sub');
    if (sub) sub.textContent = "Includes completed games · live from the league tracker's season standings.";
    const card = $('card-season-leader');
    if (card && sorted.length) {
      const top = sorted[0];
      card.querySelector('h2').textContent = top.player;
      card.querySelector('p').textContent = `${top.correct} correct · ${top.wrong} wrong · ${top.win_pct}%`;
    }
  }


  function renderCompletedHistory(history, meta, seasonRows) {
    const details = $('completed-weekly');
    const summary = $('completed-weekly-summary');
    const head = $('completed-weekly-head');
    const body = $('completed-weekly-body');
    const note = $('completed-weekly-note');
    if (!summary || !head || !body) return;

    const weeks = history && Array.isArray(history.weeks)
      ? history.weeks.slice().sort((a, b) => (+a.week || 0) - (+b.week || 0))
      : [];

    if (details) details.hidden = weeks.length === 0;
    if (!weeks.length) return;

    const lastWeek = +weeks[weeks.length - 1].week || 0;
    summary.textContent = `Completed weekly records · Weeks 1–${lastWeek}`;

    head.replaceChildren();
    ['Rank', 'Player'].forEach(text => {
      const th = el('th', text);
      th.scope = 'col';
      head.append(th);
    });
    weeks.forEach(w => {
      const th = el('th', `Week ${w.week}`);
      th.scope = 'col';
      head.append(th);
    });

    const currentRank = new Map(
      (seasonRows || []).map(r => [String(r.player || ''), +r.rank || 99])
    );

    const players = new Set();
    weeks.forEach(w => Object.keys(w.records || {}).forEach(p => players.add(p)));
    const orderedPlayers = [...players].sort((a, b) =>
      (currentRank.get(a) || 99) - (currentRank.get(b) || 99) || a.localeCompare(b)
    );

    body.replaceChildren();
    orderedPlayers.forEach(player => {
      const tr = el('tr');
      tr.append(el('td', currentRank.get(player) || ''));
      const th = el('th', player);
      th.scope = 'row';
      tr.append(th);

      weeks.forEach(w => {
        const rec = (w.records || {})[player];
        if (!rec) {
          tr.append(el('td', '—'));
          return;
        }
        let value = `${+rec.correct || 0}-${+rec.wrong || 0}`;
        if (+rec.push) value += ` (${rec.push} push${+rec.push === 1 ? '' : 'es'})`;
        tr.append(el('td', value));
      });
      body.append(tr);
    });

    if (note) {
      note.textContent =
        `Automatically archived through Week ${lastWeek}. Records show correct–wrong picks; NFL ties are pushes and do not count as wins or losses.`;
    }
  }

  // The feed writer has mistakenly included dashboard Sorted Results rows as
  // games. Only an actual NFL-vs-NFL matchup may affect live game totals.
  function normalizeFeed(meta, submission, parsedGames) {
    const all = asObjects(parsedGames);
    const isGame = g => Object.hasOwn(ABBR, String(g.away).trim()) &&
      Object.hasOwn(ABBR, String(g.home).trim()) &&
      String(g.away).trim() !== String(g.home).trim() &&
      Number.isInteger(+g.game) && +g.game >= 1 && +g.game <= 16;
    const real = all.filter(isGame);
    const extra = all.filter(g => !isGame(g));
    const total = real.length;

    // Current feed bug: each standings row leaks false picks into the first
    // dashboard player columns (D = losses, E = win % once games are final).
    // n_picked says how many leaked (1 before results, 2 after). Apply only
    // when the exact known standings-row shape is present. When the upstream
    // feed writer is repaired, no adjustment will be made.
    const standingsLeak = extra.length > 0 && extra.every(g =>
      submission.some(p => p.player === String(g.away)) &&
      /^\d+$/.test(String(g.home)) && !g.kickoff_et &&
      g.state === 'scheduled' && [0, 1, 2].includes(+g.n_picked));
    const corrected = submission.map((p, idx) => {
      const extraPicks = standingsLeak ? extra.filter(g => +g.n_picked > idx).length : 0;
      const picks = Math.max(0, Math.min(total, (+p.picks_in || 0) - extraPicks));
      return { ...p, picks_in: picks, games_total: total,
        status: picks === total && total > 0 ? 'COMPLETE' :
          picks === 0 ? 'NOT STARTED' : `${total - picks} REMAINING` };
    });
    const parsed = { ...parsedGames, rows: parsedGames.rows.filter((r, i) => isGame(all[i])) };
    return {
      meta: { ...meta, games_total: total,
        games_final: real.filter(g => g.state === 'final').length },
      submission: corrected,
      games: parsed
    };
  }


  // 2023–25 seasons were reconstructed from their archived Google Sheets.
  // The current season is read from the existing completed-week history file.
  let legacyPromise = null;
  async function loadLegacyHistory() {
    if (!legacyPromise) {
      legacyPromise = Promise.all([2023, 2024, 2025].map(async year => {
        const response = await fetch(SITE + 'nfl-legacy-' + year + '.json', {cache: 'no-store'});
        if (!response.ok) throw new Error('Historical season ' + year + ': ' + response.status);
        return response.json();
      })).catch(err => {legacyPromise = null; throw err;});
    }
    return legacyPromise;
  }

  function archiveSeasons(history, legacy) {
    const older = (legacy || []).filter(y => y && Array.isArray(y.verified_weeks))
      .map(y => ({ year: +y.season, weeks: y.verified_weeks,
        scores: y.season_scores || [], excluded: y.excluded || [] }));
    const currentWeeks = history && Array.isArray(history.weeks) ? history.weeks : [];
    if (currentWeeks.length) {
      const overall = new Map();
      const normalizedWeeks = currentWeeks.map(w => {
        const scores = w.records || {};
        const records = Object.entries(scores).map(([player, s]) => ({
          player, correct: +s.correct || 0, wrong: +s.wrong || 0, push: +s.push || 0
        }));
        const best = Math.max(0, ...records.map(r => r.correct));
        records.forEach(r => {
          if (!overall.has(r.player)) overall.set(r.player,
            { player: r.player, correct: 0, wrong: 0, push: 0, weeks: 0 });
          const total = overall.get(r.player);
          total.correct += r.correct;
          total.wrong += r.wrong;
          total.push += r.push;
          total.weeks++;
        });
        return { week: +w.week, games: Array.isArray(w.games) ? w.games : [],
          winners: records.filter(r => r.correct === best), scores };
      });
      older.push({ year: 2026, weeks: normalizedWeeks,
        scores: [...overall.values()].sort((a, b) => b.correct - a.correct),
        excluded: [] });
    }
    return older.sort((a, b) => b.year - a.year);
  }

  let historyView = {history: null, legacy: []};
  function renderHistory(history, legacy) {
    historyView = {history, legacy};
    const filter = $('history-year-filter');
    if (!filter) return;
    if (!filter.dataset.historyBound) {
      filter.addEventListener('change', () =>
        renderHistory(historyView.history, historyView.legacy));
      filter.dataset.historyBound = '1';
    }
    const seasons = archiveSeasons(history, legacy);
    const selected = filter.value === 'all' ? seasons : seasons.filter(s => String(s.year) === filter.value);
    const weeks = selected.flatMap(s => s.weeks.map(w => ({...w, year: s.year})))
      .sort((a, b) => b.year - a.year || b.week - a.week);
    const games = weeks.flatMap(w => (w.games || []).map(g => ({...g, year: w.year, week: w.week})));
    const surprise = games.filter(g => !g.push && g.picked > 0 && g.correct === 0);
    const solo = games.filter(g => !g.push && g.picked > 0 && g.correct === 1);
    const unanimous = games.filter(g => !g.push && g.picked > 0 && g.correct === g.picked);

    const counts = new Map();
    for (const w of weeks) for (const winner of w.winners || [])
      counts.set(winner.player, (counts.get(winner.player) || 0) + 1);
    const most = Math.max(0, ...counts.values());
    const leaders = [...counts].filter(([, count]) => count === most)
      .map(([player]) => player).sort();

    const allWinners = weeks.flatMap(w => (w.winners || []).map(p => ({...p, year:w.year, week:w.week})));
    const bestWin = allWinners.sort((a, b) =>
      (+b.correct || 0) - (+a.correct || 0) || (+a.wrong || 0) - (+b.wrong || 0))[0];

    const stat = (index, value, detail) => {
      const box = $('history-kpis')?.children[index];
      if (!box) return;
      const strong = box.querySelector('strong');
      if (strong) strong.textContent = value;
      let note = box.querySelector('small');
      if (!note) {note = document.createElement('small'); box.append(note);}
      note.textContent = detail;
    };
    stat(0, most ? leaders.join(' & ') : '—', most ? most + ' weekly wins' : 'No completed weeks');
    stat(1, bestWin ? bestWin.correct + '–' + bestWin.wrong : '—',
      bestWin ? bestWin.player + ' · ' + bestWin.year + ', Week ' + bestWin.week : 'No record yet');
    stat(2, String(surprise.length), 'Games nobody picked correctly');
    stat(3, String(solo.length), 'Games only one player called');

    const championBody = $('history-champions');
    if (championBody) {
      championBody.replaceChildren();
      for (const s of selected) {
        const ranks = [...s.scores].sort((a, b) => (+b.correct || 0) - (+a.correct || 0));
        if (!ranks.length) continue;
        const best = +ranks[0].correct || 0;
        const topPlayers = ranks.filter(p => (+p.correct || 0) === best);
        const played = (+ranks[0].correct || 0) + (+ranks[0].wrong || 0);
        const complete = s.year < 2026 && s.weeks.length === 18 && !s.excluded.length;
        const tr = el('tr');
        [String(s.year), topPlayers.map(p => p.player).join(' & '),
          String(best), played ? (100 * best / played).toFixed(1) + '%' : '—',
          complete ? '18 of 18 · Champion' : s.year === 2026
            ? s.weeks.length + ' completed weeks · Ongoing'
            : s.weeks.length + ' of 18 · Partial'].forEach(v => tr.append(el('td', v)));
        championBody.append(tr);
      }
    }

    const winnerBody = $('history-winners');
    if (winnerBody) {
      winnerBody.replaceChildren();
      for (const w of weeks) {
        if (!w.winners?.length) continue;
        const first = w.winners[0];
        const tr = el('tr');
        [w.year + ' · Week ' + w.week,
          w.winners.map(p => p.player).join(' & '),
          (+first.correct || 0) + '–' + (+first.wrong || 0) +
            (+first.push ? ' (' + first.push + ' push)' : '')].forEach(v => tr.append(el('td', v)));
        winnerBody.append(tr);
      }
      if (!winnerBody.children.length) {
        const tr = el('tr'); const td = el('td', 'No completed weeks for this season.');
        td.colSpan = 3; tr.append(td); winnerBody.append(tr);
      }
    }

    const storyList = $('history-storylines');
    if (storyList) {
      storyList.replaceChildren();
      const stories = [];
      const perfect = allWinners.filter(w => w.wrong === 0 && w.correct >= 12);
      if (perfect.length) {
        const best = perfect.sort((a,b) => b.correct-a.correct)[0];
        stories.push('Perfect week: ' + best.player + ' went ' + best.correct + '–0 in ' +
          best.year + ' Week ' + best.week + '.');
      }
      let streak = {count:0,player:'',year:0,end:0};
      const persons = [...new Set(allWinners.map(w => w.player))];
      for (const s of selected) for (const p of persons) {
        const winningWeeks = new Set(s.weeks.filter(w => w.winners?.some(v => v.player === p)).map(w => +w.week));
        for (const week of winningWeeks) {
          let len = 1;
          while (winningWeeks.has(week - len)) len++;
          if (len > streak.count) streak = {count:len,player:p,year:s.year,end:week};
        }
      }
      if (streak.count >= 2) stories.push('Winning streak: ' + streak.player + ' shared or won ' +
        streak.count + ' consecutive weeks in ' + streak.year + ' (through Week ' + streak.end + ').');
      const loneCounts = new Map();
      for (const g of solo) if (g.lone_correct)
        loneCounts.set(g.lone_correct, (loneCounts.get(g.lone_correct) || 0) + 1);
      if (loneCounts.size) {
        const [player, count] = [...loneCounts].sort((a,b) => b[1]-a[1])[0];
        stories.push('Against the crowd: ' + player + ' was the only correct picker ' +
          count + (count === 1 ? ' time.' : ' times.'));
      }
      stories.push(unanimous.length + ' games were unanimous correct picks across the chosen completed weeks.');
      stories.push('Weekly-win leaders: ' + (most ? leaders.join(' & ') + ' (' + most + ' each)' : 'not available') + '.');
      stories.forEach(s => storyList.append(el('li', s)));
    }

    const gameList = (id, values, suffix) => {
      const list = $(id);
      if (!list) return;
      list.replaceChildren();
      for (const g of values.slice().sort((a,b) => b.year-a.year || b.week-a.week || b.game-a.game).slice(0,12)) {
        const li = el('li');
        li.append(el('strong', g.winner));
        li.append(document.createTextNode(' beat the league · ' + g.year + ' Week ' + g.week));
        const note = el('span', g.away + ' vs ' + g.home + ' · ' +
          (suffix === 'solo' ? g.lone_correct + ' was the lone correct picker' :
            '0 of ' + g.picked + ' correctly picked the winner'), 'history-game-note');
        li.append(note);
        list.append(li);
      }
      if (!list.children.length) list.append(el('li', 'No matching completed games.'));
    };
    gameList('history-stunners', surprise, 'surprise');
    gameList('history-lone-picks', solo, 'solo');

    const footer = $('history-footnote');
    if (footer) {
      const missing = selected.filter(s => s.year < 2026 && s.weeks.length < 18)
        .map(s => s.year + ' (' + s.weeks.length + '/18 weeks)');
      footer.textContent = weeks.length + ' completed weeks, ' + games.length +
        ' archived matchups included. NFL ties count as pushes. Shared wins count for each player.' +
        (missing.length ? ' Partial historical seasons: ' + missing.join(', ') +
          '; their season leaders are not confirmed champions.' : '') +
        ' Current 2026 results count completed weeks only.';
    }
    const sub = $('history-sub');
    if (sub) sub.textContent = 'Archived NFL league picks from 2023 onward · ' +
      weeks.length + ' completed weeks available' + (filter.value === 'all' ? ' across seasons.' : ' in the selected season.');
  }

  let lastSeen = '';
  let lastMeta = null;
  let refreshing = false;
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const [metaP, subP, gamesP, recP, ssP, historyP, legacyP] = await Promise.all([
        gviz('meta'),
        gviz('submission_status'),
        gviz('games'),
        gviz('weekly_records'),
        gviz('season_standings'),
        weeklyHistory().catch(() => null),
        loadLegacyHistory().catch(() => [])
      ]);
      const sourceMeta = asObjects(metaP)[0] || {};
      if (!(+sourceMeta.week > 0) || !sourceMeta.generated_utc) throw new Error('Missing feed metadata');
      const clean = normalizeFeed(sourceMeta, asObjects(subP), gamesP);
      const meta = clean.meta, sub = clean.submission, rec = asObjects(recP);
      renderMeta(meta);
      renderCards(meta, rec);
      renderSubmission(sub);
      const seasonRows = asObjects(ssP);
      renderSeason(seasonRows, meta);
      renderGames(clean.games, meta);
      renderWeekly(rec, meta);
      renderCompletedHistory(historyP, meta, seasonRows);
      renderHistory(historyP, legacyP);
      lastSeen = meta.generated_utc;
      lastMeta = meta;
    } catch (err) {
      const upd = $('league-updated');
      if (upd) upd.textContent = lastMeta
        ? `Refresh unavailable · showing data updated ${lastMeta.generated_et || lastSeen} · retrying automatically`
        : 'Live data unavailable · retrying automatically. Reload to try again now.';
      if (!lastMeta) {
        ['season-body', 'weekly-body', 'games-body', 'submission-body'].forEach(id => {
          const body = $(id);
          if (!body) return;
          const tr = el('tr'), td = el('td', 'Live data unavailable. Please try again shortly.');
          td.colSpan = id === 'submission-body' ? 3 : 6;
          tr.append(td); body.replaceChildren(tr);
        });
        ['card-season-leader', 'card-week-leaders', 'card-pending'].forEach(id => {
          const card = $(id);
          if (card) { card.querySelector('h2').textContent = 'Unavailable'; card.querySelector('p').textContent = 'Retrying automatically.'; }
        });
        const summary = $('submission-summary');
        if (summary) summary.textContent = 'Pick counts are temporarily unavailable.';
        const badge = $('league-badge');
        if (badge) badge.textContent = 'Results unavailable';
      }
    } finally {
      refreshing = false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
  setInterval(refresh, REFRESH_MS);
})();
