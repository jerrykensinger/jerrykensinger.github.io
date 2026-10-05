(() => {
  const root = document.documentElement;
  const themeButton = document.querySelector('.theme-toggle');
  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.site-nav');

  if (nav && !nav.querySelector('a[href="nfl.html"]')) {
    const leagueLink = document.createElement('a');
    leagueLink.href = 'nfl.html';
    leagueLink.className = 'nav-link';
    leagueLink.textContent = 'NFL League';
    nav.appendChild(leagueLink);
  }

  const savedTheme = localStorage.getItem('jk-theme');
  const preferredDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || (preferredDark ? 'dark' : 'light');
  root.dataset.theme = initialTheme;

  const syncThemeLabel = () => {
    if (!themeButton) return;
    const isDark = root.dataset.theme === 'dark';
    themeButton.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    themeButton.setAttribute('title', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    const icon = themeButton.querySelector('.theme-icon');
    if (icon) icon.textContent = isDark ? '☀' : '◐';
  };

  syncThemeLabel();

  const syncCommentTheme = () => {
    const message = {
      type: 'set-theme',
      theme: root.dataset.theme === 'dark' ? 'github-dark' : 'github-light'
    };
    document.querySelectorAll('iframe.utterances-frame').forEach(frame => {
      frame.contentWindow?.postMessage(message, 'https://utteranc.es');
    });
  };

  themeButton?.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('jk-theme', root.dataset.theme);
    syncThemeLabel();
    syncCommentTheme();
  });

  window.addEventListener('message', (event) => {
    if (event.origin === 'https://utteranc.es') {
      setTimeout(syncCommentTheme, 150);
    }
  });

  menuButton?.addEventListener('click', () => {
    const open = nav?.classList.toggle('open') || false;
    menuButton.setAttribute('aria-expanded', String(open));
  });

  nav?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      menuButton?.setAttribute('aria-expanded', 'false');
    });
  });

  document.querySelectorAll('[data-current-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });
})();