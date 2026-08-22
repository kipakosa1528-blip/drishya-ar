// KBoot — pre-paint hydration for the admin pages.
// Classic script (no modules): loaded in <head> so page-level inline scripts
// can paint cached data from localStorage BEFORE the browser's first paint.
// Module scripts remain the source of truth and overwrite this right after.
(function () {
  'use strict';

  var CACHE_KEY = 'kipakosa_projects_cache';

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : null;
    } catch {
      return null;
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDate(d) {
    if (!d) return '—';
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return '—';
      return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
  }

  function isExpired(p) {
    var exp = p.expiresAt || p.expires_at;
    if (exp && new Date(exp) < new Date()) return true;
    var limit = p.maxScans || p.max_scans;
    var views = Number(p.viewsCount || p.views_count || 0);
    return !!(limit && views >= Number(limit));
  }

  function statusBadge(p) {
    var exp = p.expiresAt || p.expires_at;
    var limit = p.maxScans || p.max_scans;
    var views = Number(p.viewsCount || p.views_count || 0);
    if (exp && new Date(exp) < new Date()) {
      return '<span class="badge badge-red"><span class="badge-dot"></span>Time Expired</span>';
    }
    if (limit && views >= Number(limit)) {
      return '<span class="badge badge-red"><span class="badge-dot"></span>Limit Reached</span>';
    }
    if (limit) {
      return '<span class="badge badge-green"><span class="badge-dot"></span>Active (' + views + '/' + esc(limit) + ')</span>';
    }
    return '<span class="badge badge-green"><span class="badge-dot"></span>Active</span>';
  }

  function byCreatedDesc(a, b) {
    return new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at);
  }

  // Row markup mirrors the module renderers but omits the Delete button:
  // window.delProj isn't defined until module scripts run, and this row is
  // replaced by the authoritative render within milliseconds anyway.
  function rowHTML(p) {
    var thumb = p.imageUrl
      ? '<img class="td-thumb" src="' + esc(p.imageUrl) + '" />'
      : '<div class="td-thumb-placeholder"></div>';
    var scans = p.viewsCount || p.views_count || 0;
    return '' +
      '<tr>' +
        '<td style="width:70px">' + thumb + '</td>' +
        '<td><a href="project.html?id=' + esc(p.id) + '" style="font-weight:600;color:var(--text)">' + esc(p.name) + '</a></td>' +
        '<td style="color:var(--text-secondary)">' + esc(p.client || '') + '</td>' +
        '<td><span style="display:inline-flex;align-items:center;gap:4px;font-weight:600;color:var(--accent)"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ' + scans + '</span></td>' +
        '<td>' + statusBadge(p) + '</td>' +
        '<td style="color:var(--text-secondary)">' + fmtDate(p.expiresAt || p.expires_at) + '</td>' +
        '<td style="text-align:right"><a href="project.html?id=' + esc(p.id) + '" class="btn btn-sm btn-default">View</a></td>' +
      '</tr>';
  }

  function skeletonRow() {
    return '<tr>' +
      '<td><div class="skeleton skeleton-thumb"></div></td>' +
      '<td><div class="skeleton skeleton-line" style="width:65%"></div></td>' +
      '<td><div class="skeleton skeleton-line" style="width:50%"></div></td>' +
      '<td><div class="skeleton skeleton-line" style="width:38px"></div></td>' +
      '<td><div class="skeleton skeleton-line" style="width:78px"></div></td>' +
      '<td><div class="skeleton skeleton-line" style="width:88px"></div></td>' +
      '<td></td>' +
    '</tr>';
  }

  function skeletonRows(n) {
    var out = '';
    for (var i = 0; i < n; i++) out += skeletonRow();
    return out;
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function prefetchOnHover() {
    document.addEventListener('mouseover', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!t) return;
      var href = t.getAttribute('href') || '';
      if (!/^\/?(dashboard|projects|project|create|admin)\.html([?#].*)?$/.test(href)) return;
      if (document.querySelector('link[rel="prefetch"][href="' + href + '"]')) return;
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      document.head.appendChild(link);
    }, { passive: true });
  }

  prefetchOnHover();

  window.KBoot = {
    readCache: readCache,
    esc: esc,
    fmtDate: fmtDate,
    isExpired: isExpired,
    statusBadge: statusBadge,
    byCreatedDesc: byCreatedDesc,
    rowHTML: rowHTML,
    skeletonRows: skeletonRows,
    setText: setText,
  };
})();



