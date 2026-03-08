export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === 'POST' && url.pathname === '/api/submit') {
            return handleSubmit(request, env);
        }

        if (request.method === 'GET') {
            if (/\.(css|js|json|ico|png|jpg|jpeg|svg|webp|woff2?)$/i.test(url.pathname)) {
                return env.ASSETS.fetch(request);
            }
            return renderPage(env, url);
        }

        return env.ASSETS.fetch(request);
    }
};

async function renderPage(env, url) {
    try {
        // Determine which HTML file to serve
        const pathname = url.pathname.replace(/\/+$/, '') || '/';
        let htmlPath;
        if (pathname === '/' || pathname === '/home') {
            htmlPath = '/index.html';
        } else if (pathname === '/menu') {
            htmlPath = '/menu.html';
        } else if (pathname === '/contact') {
            htmlPath = '/contact.html';
        } else {
            return new Response('Page not found', { status: 404 });
        }

        const htmlUrl  = new URL(htmlPath, url.origin).href;
        const jsonUrl  = new URL('/content.json', url.origin).href;

        const [htmlRes, contentRes] = await Promise.all([
            env.ASSETS.fetch(new Request(htmlUrl)),
            env.ASSETS.fetch(new Request(jsonUrl)),
        ]);

        if (!htmlRes.ok || !contentRes.ok) return env.ASSETS.fetch(new Request(url.href));

        const [html, content] = await Promise.all([htmlRes.text(), contentRes.json()]);

        const biz         = content.business     || {};
        const formCfg     = content.form         || {};
        const integrations = content.integrations || {};

        if (!formCfg.thankYouSub && formCfg.thankYouSubtext) formCfg.thankYouSub = formCfg.thankYouSubtext;
        if (!formCfg.thankYouSubtext && formCfg.thankYouSub) formCfg.thankYouSubtext = formCfg.thankYouSub;

        // Integration URLs — only treat as set when non-empty after trimming
        const reservationsUrl = (integrations.reservations_url || '').trim();
        const orderUrl        = (integrations.order_url        || '').trim();
        const hasReservations = !!reservationsUrl;
        const hasOrder        = !!orderUrl;

        // Slug for per-page data
        const slug = pathname === '/' ? 'home' : pathname.slice(1);
        const pageData = (content.pages && content.pages[slug]) || null;
        const sections = (pageData && pageData.sections) || [];

        const nav = Array.isArray(content.nav) ? content.nav : [];
        const phone     = biz.phone     || '';
        const phoneHref = biz.phoneHref || (phone ? `tel:${phone.replace(/\D/g, '')}` : '#');

        function resolve(path) {
            return path.split('.').reduce((o, k) => (o != null ? o[k] : undefined), content);
        }

        // Head replacements
        const titleText   = (pageData && pageData.title)       || (content.meta && content.meta.title) || biz.name || '';
        const description = (pageData && pageData.description) || (content.meta && content.meta.description) || '';
        const canonical   = url.origin + url.pathname;

        const ogTags = [
            `<meta property="og:type" content="website">`,
            `<meta property="og:url" content="${escAttr(canonical)}">`,
            `<meta property="og:title" content="${escAttr(titleText)}">`,
            `<meta property="og:description" content="${escAttr(description)}">`,
        ].join('\n');

        const inlineScripts = `<script>window.__BUSINESS=${JSON.stringify(biz)};window.__FORM_CONFIG=${JSON.stringify(formCfg)};</script>`;

        let modifiedHtml = html;
        modifiedHtml = modifiedHtml.replace(/<title>[^<]*<\/title>/, `<title>${escHtml(titleText)}</title>`);
        modifiedHtml = modifiedHtml.replace(/(<meta name="description" content=")[^"]*(")/,
            `$1${escAttr(description)}$2`);
        modifiedHtml = modifiedHtml.replace(/<script id="content-fetch">[\s\S]*?<\/script>\n?/, '');
        modifiedHtml = modifiedHtml.replace('</head>', `${ogTags}\n${inlineScripts}\n</head>`);

        // ── Integration HTML fragments ───────────────────────────────────────────

        // Header nav: integration buttons only when URLs are set
        let integNavHtml = '';
        if (hasOrder) {
            integNavHtml += `<a class="integration-btn integration-btn--order" href="${escAttr(orderUrl)}" target="_blank" rel="noopener">Order Online</a>`;
        }
        if (hasReservations) {
            integNavHtml += `<a class="integration-btn integration-btn--reserve" href="${escAttr(reservationsUrl)}" target="_blank" rel="noopener">Reserve</a>`;
        }

        // Hero CTA group: integration buttons injected when reservations_url is set.
        // When hasReservations is TRUE these replace the static .hero-reserve-btn (which is removed below).
        // When hasReservations is FALSE the static button is also removed (no reservation CTAs shown).
        let integHeroHtml = '';
        if (hasReservations) {
            integHeroHtml += `<a class="btn btn--primary btn--lg integration-btn integration-btn--reserve" href="${escAttr(reservationsUrl)}" target="_blank" rel="noopener">${escHtml(content.hero && content.hero.ctaText ? content.hero.ctaText : 'Reserve a Table')}</a>`;
        }
        if (hasOrder) {
            integHeroHtml += `<a class="btn btn--ghost btn--lg integration-btn integration-btn--order" href="${escAttr(orderUrl)}" target="_blank" rel="noopener">Order Online</a>`;
        }

        // Page-level hero (contact/menu): integration buttons only when URLs are set
        let integPageHtml = '';
        if (hasReservations && pathname === '/contact') {
            integPageHtml += `<a class="integration-btn integration-btn--reserve" href="${escAttr(reservationsUrl)}" target="_blank" rel="noopener">Reserve a Table</a>`;
        }
        if (hasOrder && pathname === '/menu') {
            integPageHtml += `<a class="integration-btn integration-btn--order" href="${escAttr(orderUrl)}" target="_blank" rel="noopener">Order Online</a>`;
        }

        // Reservation CTA section:
        // When hasReservations is TRUE: inject integration button AND remove static fallback.
        // When hasReservations is FALSE: remove static fallback too — no reservation CTA shown at all.
        let integCtaHtml = '';
        if (hasReservations) {
            const ctaLabel = escHtml(
                (content.pages && content.pages.home && content.pages.home.reservation && content.pages.home.reservation.ctaText)
                || 'Reserve a Table'
            );
            integCtaHtml = `<a class="btn btn--primary btn--lg integration-btn integration-btn--reserve" href="${escAttr(reservationsUrl)}" target="_blank" rel="noopener">${ctaLabel}</a>`;
        }

        // Contact page: reservations info block
        // Only rendered when reservations_url is set
        let reservationsBlockHtml = '';
        if (hasReservations) {
            reservationsBlockHtml = `<h3 class="contact-info__heading">Reservations</h3><p class="contact-private-text">Book your table quickly and easily through our online reservation system.</p><a class="btn btn--primary" href="${escAttr(reservationsUrl)}" target="_blank" rel="noopener">Reserve a Table</a>`;
        }

        // Build nav HTML
        const navHtml = nav.map(item =>
            `<li><a class="nav-link" href="${escAttr(item.href || '#')}">${escHtml(item.label || '')}</a></li>`
        ).join('');

        const sectionsHtml = sections.map((sec, idx) => renderSection(sec, idx)).join('\n');

        // Form fields
        let fieldsHtml = '';
        if (formCfg.fields) {
            fieldsHtml = formCfg.fields.map(field => {
                const id  = `contact-${field.name}`;
                const req = field.required ? ' required' : '';
                let inputHtml;
                if (field.type === 'textarea') {
                    inputHtml = `<textarea id="${id}" name="${escAttr(field.name)}" rows="${field.rows || 4}" placeholder="${escAttr(field.placeholder || '')}"${req}></textarea>`;
                } else if (field.type === 'select') {
                    const opts = (field.options || []).map(o =>
                        `<option value="${escAttr(String(o.value))}">${escHtml(String(o.label))}</option>`
                    ).join('');
                    inputHtml = `<select id="${id}" name="${escAttr(field.name)}"${req}><option value="">${escHtml(field.placeholder || 'Select\u2026')}</option>${opts}</select>`;
                } else {
                    inputHtml = `<input type="${escAttr(field.type || 'text')}" id="${id}" name="${escAttr(field.name)}" placeholder="${escAttr(field.placeholder || '')}"${req}>`;
                }
                return `<label for="${id}">${escHtml(field.label || '')}</label>${inputHtml}`;
            }).join('\n');
        }

        let tsHtml = '';
        if (formCfg.turnstileSiteKey) {
            const tsTheme = computeTurnstileTheme(content.theme);
            tsHtml = `<div id="cf-turnstile" data-sitekey="${escAttr(formCfg.turnstileSiteKey)}" data-theme="${tsTheme}"></div>`;
        }

        const serviceAreas   = (content.contact && content.contact.serviceAreas) || [];
        const areasText      = serviceAreas.join(', ');
        const areasListHtml  = serviceAreas.map(a => `<li>${escHtml(a)}</li>`).join('');

        const hours      = (content.contact && content.contact.hours) || [];
        const hoursHtml  = `<strong>Hours</strong>${hours.map(h => `<span>${escHtml(h)}</span>`).join('')}`;

        // Footer service links (from first section with non-testimonial items)
        const footerSvc = sections.find(s => s.items && s.items.length > 0 && !s.items[0].quote);
        const footerSvcHtml = footerSvc ? footerSvc.items.map(item =>
            `<li><a href="#${escAttr(footerSvc.id || 'services')}">${escHtml(item.title || '')}</a></li>`
        ).join('') : '';

        const rewriter = new HTMLRewriter()
            .on('body', {
                element(el) {
                    const cls = el.getAttribute('class') || '';
                    // Add has-reserve-integration class when reservations_url is set
                    // so CSS can hide the default header-cta link
                    const extra = hasReservations ? ' has-reserve-integration' : '';
                    el.setAttribute('class', (cls + ' content-loaded' + extra).trim());
                }
            })
            .on('[data-content]', {
                element(el) {
                    const val = resolve(el.getAttribute('data-content'));
                    if (val != null) el.setInnerContent(String(val));
                }
            })
            .on('[data-content-attr-href]', {
                element(el) {
                    const val = resolve(el.getAttribute('data-content-attr-href'));
                    if (val) el.setAttribute('href', String(val));
                }
            })
            .on('[data-content-nav]', {
                element(el) { el.setInnerContent(navHtml, { html: true }); }
            })
            .on('[data-content-phone]', {
                element(el) {
                    el.setInnerContent(phone);
                    if (el.tagName === 'a') el.setAttribute('href', phoneHref);
                }
            })
            .on('[data-phone-href]', {
                element(el) {
                    if (el.tagName === 'a') el.setAttribute('href', phoneHref);
                }
            })
            .on('[data-content-email]', {
                element(el) {
                    el.setInnerContent(biz.email || '');
                    if (el.tagName === 'a' && biz.email) el.setAttribute('href', `mailto:${biz.email}`);
                }
            })
            .on('[data-content-list="contact.hours"]', {
                element(el) { el.setInnerContent(hoursHtml, { html: true }); }
            })
            .on('[data-content-areas-text]', {
                element(el) { el.setInnerContent(areasText); }
            })
            .on('[data-content-areas-list]', {
                element(el) { el.setInnerContent(areasListHtml, { html: true }); }
            })
            .on('#sections-container', {
                element(el) { el.setInnerContent(sectionsHtml, { html: true }); }
            })
            .on('#form-fields-placeholder', {
                element(el) { el.replace(fieldsHtml + (tsHtml ? '\n' + tsHtml : ''), { html: true }); }
            })
            .on('button[type="submit"]', {
                element(el) {
                    if (formCfg.submitLabel) el.setInnerContent(formCfg.submitLabel);
                }
            })
            .on('[data-content-footer-services]', {
                element(el) { el.setInnerContent(footerSvcHtml, { html: true }); }
            })
            .on('[data-content-footer-credit]', {
                element(el) {
                    if (content.footer && content.footer.creditName) el.setInnerContent(content.footer.creditName);
                    if (content.footer && content.footer.creditUrl)  el.setAttribute('href', content.footer.creditUrl);
                }
            })
            .on('[data-content-copyright]', {
                element(el) {
                    if (content.footer && content.footer.copyright) el.setInnerContent(content.footer.copyright);
                }
            })
            // ── Integration injection points ──────────────────────────────────────
            .on('[data-content-integrations-nav]', {
                element(el) { el.setInnerContent(integNavHtml, { html: true }); }
            })
            .on('[data-content-integrations-hero]', {
                element(el) { el.setInnerContent(integHeroHtml, { html: true }); }
            })
            .on('[data-content-integrations-page]', {
                element(el) { el.setInnerContent(integPageHtml, { html: true }); }
            })
            .on('[data-content-integrations-cta]', {
                element(el) {
                    if (integCtaHtml) {
                        // Integration URL is set: inject the integration button
                        el.replace(integCtaHtml, { html: true });
                    } else {
                        // No integration URL: remove the span entirely
                        el.remove();
                    }
                }
            })
            .on('[data-content-reservations-block]', {
                element(el) {
                    if (reservationsBlockHtml) {
                        el.setInnerContent(reservationsBlockHtml, { html: true });
                    } else {
                        // Remove the empty block entirely so it takes no space
                        el.remove();
                    }
                }
            })
            // ── Static reservation elements ───────────────────────────────────────
            // These are always removed. When hasReservations is TRUE they are replaced
            // by the integration buttons injected above. When hasReservations is FALSE
            // there should be no reservation CTAs on the page at all.
            .on('.hero-reserve-btn', {
                element(el) { el.remove(); }
            })
            .on('.header-cta', {
                element(el) { el.remove(); }
            })
            .on('.reservation-cta-fallback', {
                element(el) { el.remove(); }
            });

        return rewriter.transform(new Response(modifiedHtml, {
            status: 200,
            headers: {
                'Content-Type': 'text/html;charset=UTF-8',
                'Cache-Control': 'no-store',
            },
        }));

    } catch (e) {
        console.error('renderPage error:', e);
        return env.ASSETS.fetch(new Request(url.href));
    }
}

function renderSection(sec, idx) {
    const isTestimonial = sec.items && sec.items.length > 0 && sec.items[0].quote !== undefined;
    const useAlt  = idx % 2 === 1;
    const idAttr  = sec.id ? ` id="${escAttr(sec.id)}"` : '';

    let headerHtml = '';
    if (sec.label)      headerHtml += `<p class="section__label">${escHtml(sec.label)}</p>`;
    if (sec.heading)    headerHtml += `<h2 class="section-heading">${escHtml(sec.heading)}</h2>`;
    if (sec.subheading) headerHtml += `<p class="section__subheading">${escHtml(sec.subheading)}</p>`;

    let gridHtml = '';
    if (sec.items && sec.items.length > 0) {
        if (isTestimonial) {
            const cards = sec.items.map(item => {
                const stars = Array(item.stars || 5).fill(
                    `<svg width="20" height="20" viewBox="0 0 20 20" fill="var(--color-star,#c9943a)"><path d="M10 1l2.5 5.5H18l-4.5 3.5 1.5 5.5L10 13l-5 2.5 1.5-5.5L2 6.5h5.5z"/></svg>`
                ).join('');
                return `<div class="testimonial-card"><div class="testimonial-card__stars">${stars}</div><blockquote class="testimonial-card__quote">"${escHtml(item.quote || '')}"</blockquote><div class="testimonial-card__author"><strong>${escHtml(item.author || '')}</strong><span>${escHtml(item.role || '')}</span></div></div>`;
            }).join('');
            gridHtml = `<div class="testimonials-grid">${cards}</div>`;
        } else {
            const cards = sec.items.map(item => {
                let inner = '';
                if (item.icon)   inner += `<div class="card__icon"><i data-lucide="${escAttr(item.icon)}"></i></div>`;
                if (item.number) inner += `<div class="card__number">${escHtml(String(item.number))}</div>`;
                if (item.title)  inner += `<h3 class="card__title">${escHtml(item.title)}</h3>`;
                if (item.text)   inner += `<p class="card__text">${escHtml(item.text)}</p>`;
                return `<div class="card">${inner}</div>`;
            }).join('');
            gridHtml = `<div class="cards-grid">${cards}</div>`;
        }
    }

    return `<section${idAttr} class="section section-visible${useAlt ? ' section--alt' : ''}"><div class="container"><div class="section__header">${headerHtml}</div>${gridHtml}</div></section>`;
}

function computeTurnstileTheme(theme) {
    if (!theme) return 'light';
    const hex = ((theme.bg || theme.bgDark) || '#ffffff').replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.5 ? 'light' : 'dark';
}

function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

async function handleSubmit(request, env) {
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

async function fetchContent(env, request) {
    try {
        const url = new URL('/content.json', new URL(request.url).origin);
        const res = await env.ASSETS.fetch(new Request(url.href));
        return await res.json();
    } catch {
        return null;
    }
}

async function verifyTurnstile(token, secretKey) {
    if (!token) return false;
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
    });
    const data = await res.json();
    return data.success === true;
}

async function sendEmail(env, { from, to, subject, body }) {
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

function jsonOk() {
    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function jsonError(message, status) {
    return new Response(JSON.stringify({ ok: false, error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}