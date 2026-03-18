/**
 * Shared Cloudflare Worker utilities for vibefly templates.
 *
 * This is the CANONICAL source. Copies live at:
 *   plans/one-pager/template/src/worker-utils.js
 *   plans/vibefly-landing/template/src/worker-utils.js
 *   plans/restaurant/template/src/worker-utils.js
 *
 * To propagate changes, run: scripts/sync-worker-utils.sh
 */

// ── Escaping ────────────────────────────────────────────────────────────────

export function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// ── JSON responses ──────────────────────────────────────────────────────────

export function jsonOk() {
    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

export function jsonError(message, status) {
    return new Response(JSON.stringify({ ok: false, error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

// ── Content fetching ────────────────────────────────────────────────────────

export async function fetchContent(env, request) {
    try {
        const url = new URL('/content.json', new URL(request.url).origin);
        const res = await env.ASSETS.fetch(new Request(url.href));
        return await res.json();
    } catch {
        return null;
    }
}

// ── Cloudflare Turnstile ────────────────────────────────────────────────────

export async function verifyTurnstile(token, secretKey) {
    if (!token) return false;
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
    });
    const data = await res.json();
    return data.success === true;
}

export function computeTurnstileTheme(theme) {
    if (!theme) return 'light';
    const hex = ((theme.bg || theme.bgDark) || '#ffffff').replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.5 ? 'light' : 'dark';
}

// ── Email (Resend) ──────────────────────────────────────────────────────────

export async function sendEmail(env, { from, to, subject, body }) {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: [to], subject, text: body }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Resend ${res.status}: ${text}`);
    }
}

// ── Form submission handler ─────────────────────────────────────────────────

export async function handleSubmit(request, env) {
    try {
        const formData = await request.formData();

        const systemFields = new Set(['_gotcha', 'cf-turnstile-response', 'first_name', 'last_name']);
        const firstName = (formData.get('first_name') || '').trim();
        const lastName  = (formData.get('last_name')  || '').trim();
        const name = (formData.get('name') || [firstName, lastName].filter(Boolean).join(' ')).trim();

        const fields = [];
        if (name) fields.push({ name: 'Name', value: name });
        for (const [key, val] of formData.entries()) {
            if (!systemFields.has(key) && key !== 'name') {
                fields.push({ name: key.charAt(0).toUpperCase() + key.slice(1), value: val.toString().trim() });
            }
        }

        if (env.TURNSTILE_SECRET_KEY) {
            const token = formData.get('cf-turnstile-response');
            const valid = await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY);
            if (!valid) return jsonError('CAPTCHA verification failed.', 400);
        }

        const content = await fetchContent(env, request);
        const ownerEmail = (content && content.business && content.business.email) || env.OWNER_EMAIL;

        if (!ownerEmail) {
            console.error('No owner email configured');
            return jsonError('Server configuration error.', 500);
        }

        const fromEmail = env.FROM_EMAIL || 'noreply@vibefly.ai';
        const site = fromEmail.split('@')[1] || '';

        const notifLines = fields.map(f => `${f.name}: ${f.value || '(not provided)'}`);
        await sendEmail(env, {
            from:    fromEmail,
            to:      ownerEmail,
            subject: `${site ? '[' + site + '] ' : ''}New inquiry${name ? ' from ' + name : ''}`,
            body:    notifLines.join('\n'),
        });

        return jsonOk();

    } catch (err) {
        console.error('Form submission error:', err);
        return jsonError('Server error. Please try again.', 500);
    }
}
