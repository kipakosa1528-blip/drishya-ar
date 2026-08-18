export function fmt(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export function statusBadge(expiresAt) {
  const exp = isExpired(expiresAt);
  if (exp) {
    return `<span class="badge badge-red"><span class="badge-dot"></span>Expired</span>`;
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
  t.className = `toast ${type === 'err' ? 'toast-err' : ''}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

export function generateQR(text, containerEl, size = 160) {
  containerEl.innerHTML = '';
  if (!window.QRCodeStyling) {
    containerEl.textContent = 'QR Code library missing';
    return null;
  }
  const qr = new window.QRCodeStyling({
    width: size,
    height: size,
    data: text,
    dotsOptions: { color: "#000000", type: "rounded" },
    backgroundOptions: { color: "#ffffff" },
    imageOptions: { crossOrigin: "anonymous", margin: 4 }
  });
  qr.append(containerEl);
  return qr;
}

export function downloadQR(text, filename = 'ar-qr') {
  if (!window.QRCodeStyling) return;
  const qr = new window.QRCodeStyling({
    width: 600,
    height: 600,
    data: text,
    dotsOptions: { color: "#000000", type: "rounded" },
    backgroundOptions: { color: "#ffffff" }
  });
  qr.download({ name: filename, extension: "png" });
}

export async function copyText(str) {
  try {
    await navigator.clipboard.writeText(str);
    toast('Copied to clipboard!');
  } catch {
    toast('Failed to copy', 'err');
  }
}
