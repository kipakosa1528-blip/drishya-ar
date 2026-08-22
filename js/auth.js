// Supabase Auth session helpers for the Kipakosa AR admin app.
// The Supabase JS UMD bundle is loaded lazily from /external/supabase-js.min.js.

let clientPromise = null;

function loadSupabaseUmd() {
  return new Promise((resolve, reject) => {
    if (window.supabase?.createClient) return resolve();
    const s = document.createElement('script');
    s.src = '/external/supabase-js.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Supabase JS'));
    document.head.appendChild(s);
  });
}

export function getSupabase() {
  if (!clientPromise) {
    clientPromise = (async () => {
      await loadSupabaseUmd();
      const cfg = await fetch('/api/config').then(r => r.json());
      if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
        throw new Error('Supabase Auth is not configured on the server');
      }
      window.__kipakosaAdminEmail = cfg.adminEmail || '';
      return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    })();
  }
  return clientPromise;
}

export async function isLoggedIn() {
  try {
    const sb = await getSupabase();
    const { data } = await sb.auth.getSession();
    return !!data?.session;
  } catch {
    return false;
  }
}

export async function requireAuth() {
  if (!(await isLoggedIn())) {
    window.location.replace('/admin.html');
  }
}

export async function login(email, password) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function logout() {
  try {
    const sb = await getSupabase();
    await sb.auth.signOut();
  } catch { /* ignore */ }
  window.location.replace('/admin.html');
}

export async function logoutToLogin() { return logout(); }

// Returns headers carrying the current access token for privileged API calls.
export async function authHeaders() {
  try {
    const sb = await getSupabase();
    const { data } = await sb.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export function initNav(activePage) {
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === activePage);
  });
  document.querySelectorAll('#logout-btn, #mobile-logout-btn, .logout-btn').forEach(btn => {
    btn.addEventListener('click', logout);
  });
}


export const ICONS = {
  home:    `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>`,
  folder:  `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>`,
  plus:    `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`,
  trash:   `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>`,
  edit:    `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  copy:    `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
  logout:  `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>`,
  qr:      `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM17 17h3v3M14 20h3M20 14v3"/></svg>`,
  eye:     `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
};
