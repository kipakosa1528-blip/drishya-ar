export function fmt(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function isExpired(projOrExpiresAt, viewsCount = null, maxScans = null) {
  if (typeof projOrExpiresAt === 'object' && projOrExpiresAt !== null) {
    const exp = projOrExpiresAt.expiresAt || projOrExpiresAt.expires_at;
    const views = projOrExpiresAt.viewsCount || projOrExpiresAt.views_count || 0;
    const limit = projOrExpiresAt.maxScans || projOrExpiresAt.max_scans;
    if (exp && new Date(exp) < new Date()) return true;
    if (limit && Number(views) >= Number(limit)) return true;
    return false;
  }
  if (projOrExpiresAt && new Date(projOrExpiresAt) < new Date()) return true;
  if (maxScans && viewsCount !== null && Number(viewsCount) >= Number(maxScans)) return true;
  return false;
}

export function statusBadge(projOrExpiresAt, viewsCount = null, maxScans = null) {  let expDate = null;
  let views = 0;
  let limit = null;

  if (typeof projOrExpiresAt === 'object' && projOrExpiresAt !== null) {
    expDate = projOrExpiresAt.expiresAt || projOrExpiresAt.expires_at;
    views = projOrExpiresAt.viewsCount || projOrExpiresAt.views_count || 0;
    limit = projOrExpiresAt.maxScans || projOrExpiresAt.max_scans;
  } else {
    expDate = projOrExpiresAt;
    views = viewsCount || 0;
    limit = maxScans;
  }

  if (expDate && new Date(expDate) < new Date()) {
    return `<span class="badge badge-red"><span class="badge-dot"></span>Time Expired</span>`;
  }
  if (limit && Number(views) >= Number(limit)) {
    return `<span class="badge badge-red"><span class="badge-dot"></span>Limit Reached</span>`;
  }
  if (limit) {
    return `<span class="badge badge-green"><span class="badge-dot"></span>Active (${views}/${limit})</span>`;
  }
  return `<span class="badge badge-green"><span class="badge-dot"></span>Active</span>`;
}

// ── Projects filtering / sorting ─────────────────────────────────────────────
// Pure, DOM-free helpers shared by projects.html — unit-tested in Node by
// tests/admin-filters.spec.js.

/** Expiration mode of a project, mirroring the create-wizard options. */
export function expType(p) {
  const hasDate = !!(p.expiresAt || p.expires_at);
  const hasCap = !!(p.maxScans || p.max_scans);
  if (hasDate && hasCap) return 'both';
  if (hasDate) return 'time';
  if (hasCap) return 'scans';
  return 'permanent';
}

/** Whole days until dateStr (negative once past); null when unknown. */
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  if (isNaN(ms)) return null;
  return Math.ceil(ms / 86400000);
}

/**
 * Filter projects. Criteria (all optional):
 *   status: 'all' | 'active' | 'expired' | 'soon'   ('soon' = unexpired, ≤7 days)
 *   type:   'all' | 'permanent' | 'time' | 'scans' | 'both'
 *   client: 'all' | exact client name
 *   usage:  'all' | 'never' | 'has' | 'near'        ('near' = ≥80% of cap used)
 *   search: free text matched against name + client + notes
 *   from/to: 'YYYY-MM-DD' inclusive bounds on created_at
 */
export function filterProjects(list, c = {}) {
  const q = String(c.search || '').trim().toLowerCase();
  const from = c.from ? new Date(c.from + 'T00:00:00').getTime() : null;
  const to = c.to ? new Date(c.to + 'T23:59:59.999').getTime() : null;

  return (list || []).filter(p => {
    // Status axis
    if (c.status === 'active' && isExpired(p)) return false;
    if (c.status === 'expired' && !isExpired(p)) return false;
    if (c.status === 'soon') {
      if (isExpired(p)) return false;
      const d = daysUntil(p.expiresAt || p.expires_at);
      if (d === null || d > 7) return false;
    }
    // Expiration type axis
    if (c.type && c.type !== 'all' && expType(p) !== c.type) return false;
    // Client axis
    if (c.client && c.client !== 'all' && String(p.client || '') !== c.client) return false;
    // Scan-usage axis
    const views = Number(p.viewsCount || p.views_count || 0);
    const cap = Number(p.maxScans || p.max_scans || 0);
    if (c.usage === 'never' && views > 0) return false;
    if (c.usage === 'has' && views <= 0) return false;
    if (c.usage === 'near') {
      // integer math avoids float drift on the 80% boundary
      if (!cap || views * 100 < cap * 80) return false;
    }
    // Created range axis
    const created = new Date(p.createdAt || p.created_at || 0).getTime();
    if (from && created < from) return false;
    if (to && created > to) return false;
    // Search axis
    if (q) {
      const titleName = p.title || p.name || '';
      const hay = `${titleName} ${p.client || ''} ${p.notes || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Sort a copy of the list. Modes:
 *   newest | oldest | name_asc | scans_desc | scans_asc | expiring | recent_scan | cost_desc
 * 'expiring': dated projects first, soonest first; permanent ones last.
 * 'recent_scan': most recent lastScannedAt first; never-scanned last.
 */
export function sortProjects(list, mode = 'newest') {
  const arr = (list || []).slice();
  const createdMs = p => new Date(p.createdAt || p.created_at || 0).getTime();
  const viewsOf = p => Number(p.viewsCount || p.views_count || 0);
  const nameOf = p => String(p.title || p.name || '');

  switch (mode) {
    case 'oldest':
      return arr.sort((a, b) => createdMs(a) - createdMs(b));
    case 'name_asc':
      return arr.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    case 'scans_desc':
      return arr.sort((a, b) => viewsOf(b) - viewsOf(a));
    case 'scans_asc':
      return arr.sort((a, b) => viewsOf(a) - viewsOf(b));
    case 'expiring':
      return arr.sort((a, b) => {
        const da = daysUntil(a.expiresAt || a.expires_at);
        const dbv = daysUntil(b.expiresAt || b.expires_at);
        if (da === null && dbv === null) return 0;
        if (da === null) return 1;
        if (dbv === null) return -1;
        return da - dbv;
      });
    case 'recent_scan': {
      const lastScanMs = p => {
        const ls = p.lastScannedAt || p.last_scanned_at;
        return ls ? new Date(ls).getTime() : -1;
      };
      return arr.sort((a, b) => lastScanMs(b) - lastScanMs(a));
    }
    case 'cost_desc':
      return arr.sort((a, b) => calcMuxCost(b).totalCost - calcMuxCost(a).totalCost);
    default: // newest
      return arr.sort((a, b) => createdMs(b) - createdMs(a));
  }
}

/**
 * Computes exact estimated Mux Video API costs (Storage + Delivery) for both single frames and multi-target magazines.
 * @param {object} projectOrMag
 */
export function calcMuxCost(projectOrMag) {
  if (!projectOrMag) return { totalCost: 0, formattedTotal: '$0.00', minutesDelivered: 0, videoCount: 0 };

  let durationSec = 0;
  let videoCount = 0;

  // Check if magazine with targets array
  if (Array.isArray(projectOrMag.targets) && projectOrMag.targets.length > 0) {
    projectOrMag.targets.forEach(t => {
      const oType = (t.overlay && t.overlay.type) || t.overlay_type || 'video';
      if (oType === 'video') {
        videoCount++;
        const td = (typeof t.targetData === 'object' && t.targetData) ? t.targetData : (t.target_data || {});
        durationSec += Number(td.duration || t.duration || 30);
      }
    });
  } else {
    // Single Living Frame
    videoCount = 1;
    const td = (typeof projectOrMag.targetData === 'object' && projectOrMag.targetData) ? projectOrMag.targetData : (projectOrMag.target_data || {});
    durationSec = Number(td.duration || projectOrMag.duration || 30);
  }

  const durationMin = durationSec / 60;
  const views = Number(projectOrMag.viewsCount || projectOrMag.views_count || 0);

  // Mux rates: $0.005/min/month storage, $0.0013/min delivered
  const storageCost = durationMin * 0.005;
  const deliveryCost = durationMin * views * 0.0013;
  const totalCost = storageCost + deliveryCost;
  const minutesDelivered = durationMin * views;

  return {
    videoCount,
    durationSec: Number(durationSec.toFixed(1)),
    durationMin: Number(durationMin.toFixed(2)),
    views,
    storageCost,
    deliveryCost,
    totalCost,
    minutesDelivered: Number(minutesDelivered.toFixed(1)),
    formattedTotal: totalCost === 0 ? '$0.00' : (totalCost < 0.01 ? '<$0.01' : `$${totalCost.toFixed(2)}`),
    formattedDelivery: deliveryCost === 0 ? '$0.00' : (deliveryCost < 0.01 ? '<$0.01' : `$${deliveryCost.toFixed(2)}`),
    formattedStorage: `$${storageCost.toFixed(3)}/mo`
  };
}


export function arUrl(id) {
  return `${window.location.origin}/ar?id=${id}`;

}

export function toast(msg, type = 'info') {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    document.body.appendChild(c);
  }
  const t = document.createElement('div');
  const isErr = type === 'err' || type === 'error';
  const isSuccess = type === 'success' || type === 'ok';
  
  t.className = `toast ${isErr ? 'toast-err' : ''}`;
  const icon = isErr ? '❌' : (isSuccess ? '✅' : 'ℹ️');
  t.innerHTML = `<span style="font-size:15px">${icon}</span> <span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(10px)';
    t.style.transition = 'all 0.3s ease';
    setTimeout(() => t.remove(), 300);
  }, 4000);
}


export function generateQR(text, containerEl, size = 160) {
  containerEl.innerHTML = '';
  const QRClass = (typeof QRCodeStyling !== 'undefined') ? QRCodeStyling : (window.QRCodeStyling || null);
  if (!QRClass) {
    containerEl.textContent = 'QR Code library missing';
    return null;
  }
  const qr = new QRClass({
    width: size,
    height: size,
    data: text,
    margin: 4, // Ultra-tight compact margin
    qrOptions: {
      typeNumber: 0,
      mode: "Byte",
      errorCorrectionLevel: "H" // Level H: 30% error recovery for robust scanning
    },
    dotsOptions: {
      color: "#05070a",
      type: "rounded"
    },
    cornersSquareOptions: {
      color: "#05070a",
      type: "extra-rounded"
    },
    cornersDotOptions: {
      color: "#05070a",
      type: "dot"
    },
    backgroundOptions: { color: "#ffffff" }
  });
  qr.append(containerEl);
  return qr;
}

export async function downloadQR(text, filename = 'ar-qr', format = 'png') {
  const QRClass = (typeof QRCodeStyling !== 'undefined') ? QRCodeStyling : (window.QRCodeStyling || null);
  if (!QRClass) return;

  const size = 1200;
  const padding = 48; // Sleek, tight padding (4% border)
  const radius = 72;  // Aesthetic luxury rounded corners

  const rawQr = new QRClass({
    width: size - (padding * 2),
    height: size - (padding * 2),
    data: text,
    margin: 0,
    qrOptions: {
      typeNumber: 0,
      mode: "Byte",
      errorCorrectionLevel: "H"
    },
    dotsOptions: {
      color: "#05070a",
      type: "rounded"
    },
    cornersSquareOptions: {
      color: "#05070a",
      type: "extra-rounded"
    },
    cornersDotOptions: {
      color: "#05070a",
      type: "dot"
    },
    backgroundOptions: { color: "transparent" }
  });

  if (format === 'svg') {
    try {
      const rawBlob = await rawQr.getRawData('svg');
      const svgText = await rawBlob.text();
      const styledSvg = svgText.replace(/<svg([^>]*)>/, `<svg$1><rect width="100%" height="100%" rx="${radius}" fill="#ffffff"/>`);
      const blob = new Blob([styledSvg], { type: 'image/svg+xml' });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${filename}.svg`;
      link.href = blobUrl;
      link.click();
      URL.revokeObjectURL(blobUrl);
      return;
    } catch {
      rawQr.download({ name: filename, extension: 'svg' });
      return;
    }
  }

  try {
    const rawBlob = await rawQr.getRawData('png');
    const img = new Image();
    const blobUrl = URL.createObjectURL(rawBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // Draw rounded background card
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(0, 0, size, size, radius);
      } else {
        ctx.arcTo ? (function() {
          const r = radius;
          ctx.moveTo(r, 0);
          ctx.lineTo(size - r, 0);
          ctx.quadraticCurveTo(size, 0, size, r);
          ctx.lineTo(size, size - r);
          ctx.quadraticCurveTo(size, size, size - r, size);
          ctx.lineTo(r, size);
          ctx.quadraticCurveTo(0, size, 0, size - r);
          ctx.lineTo(0, r);
          ctx.quadraticCurveTo(0, 0, r, 0);
        })() : ctx.rect(0, 0, size, size);
      }
      ctx.fill();

      // Draw QR code centered with tight padding
      ctx.drawImage(img, padding, padding, size - (padding * 2), size - (padding * 2));

      // Trigger download
      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      URL.revokeObjectURL(blobUrl);
    };
    img.src = blobUrl;
  } catch {
    rawQr.download({ name: filename, extension: 'png' });
  }
}


export async function copyText(str) {
  try {
    await navigator.clipboard.writeText(str);
    toast('Copied to clipboard!');
  } catch {
    toast('Failed to copy', 'err');
  }
}

export async function downloadMedia(urlOrBlob, filename = 'target-image.jpg') {
  try {
    let blob;
    if (urlOrBlob instanceof Blob) {
      blob = urlOrBlob;
    } else {
      const res = await fetch(urlOrBlob);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      blob = await res.blob();
    }
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
    toast('Downloaded ' + filename, 'success');
  } catch (err) {
    if (typeof urlOrBlob === 'string') {
      window.open(urlOrBlob, '_blank');
    } else {
      toast('Failed to download file', 'err');
    }
  }
}

