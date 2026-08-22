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

export function statusBadge(projOrExpiresAt, viewsCount = null, maxScans = null) {
  let expDate = null;
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
