// Security primitives shared by all routes: HTML escaping, script-safe JSON,
// an in-memory rate limiter and Supabase JWT auth middleware.

/**
 * Escape a value for safe interpolation into HTML text or attributes.
 * @param {unknown} value
 * @returns {string}
 */
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * JSON.stringify made safe for embedding inside a <script> block:
 * prevents `</script>` breakouts, `<!--` comments and U+2028/2029 line errors.
 * @param {unknown} value
 * @returns {string}
 */
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const rateBuckets = new Map();

/**
 * Tiny fixed-window in-memory rate limiter keyed by client IP.
 * Suitable for single-instance deployments only.
 * @param {{ windowMs?: number, max?: number }} [opts]
 */
export function rateLimit({ windowMs = 60000, max = 30 } = {}) {
  setInterval(() => rateBuckets.clear(), windowMs).unref();
  return (req, res, next) => {
    const key = `${req.ip}:${Math.floor(Date.now() / windowMs)}`;
    const hits = (rateBuckets.get(key) || 0) + 1;
    rateBuckets.set(key, hits);
    if (hits > max) return res.status(429).json({ error: 'Too many requests' });
    next();
  };
}

/**
 * Build middleware that rejects requests without a valid Supabase Auth
 * Bearer token. Attaches the verified user to `req.user`.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export function makeRequireAuth(supabase) {
  return async function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = data.user;
    next();
  };
}
