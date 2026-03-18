import { escHtml, escAttr, handleSubmit, computeTurnstileTheme } from './worker-utils.js';

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
        const pathname = url.pathname.replace(/\/+$/, '') || '/';

        const [contentRes, imagesRes] = await Promise.all([
            env.ASSETS.fetch(new Request(new URL('/content.json', url.origin).href)),
            env.ASSETS.fetch(new Request(new URL('/images.json', url.origin).href)).catch(() => null),
        ]);

        if (!contentRes.ok) return new Response('Not found', { status: 404 });
        const content = await contentRes.json();

        let siteImages = [];
        if (imagesRes && imagesRes.ok) {
            try { siteImages = await imagesRes.json(); } catch { /* no images */ }
        }

        const biz          = content.business     || {};
        const formCfg      = content.form         || {};
        const integrations = content.integrations || {};
        const logo         = content.logo         || {};
        const footer       = content.footer       || {};

        if (!formCfg.thankYouSub && formCfg.thankYouSubtext) formCfg.thankYouSub = formCfg.thankYouSubtext;
        if (!formCfg.thankYouSubtext && formCfg.thankYouSub) formCfg.thankYouSubtext = formCfg.thankYouSub;

        const reservationsUrl = (integrations.reservations_url || '').trim();
        const orderUrl        = (integrations.order_url        || '').trim();
        const hasReservations = !!reservationsUrl;
        const hasOrder        = !!orderUrl;

        const phone     = biz.phone     || '';
        const phoneHref = biz.phoneHref || (phone ? `tel:${phone.replace(/\D/g, '')}` : '#');
        const email     = biz.email     || '';
        const emailHref = email ? `mailto:${email}` : '#';
        const address   = biz.address   || '';

        const rawNav = Array.isArray(content.nav) ? content.nav : [];

        const eventsItems = (
            content.pages &&
            content.pages.events &&
            Array.isArray(content.pages.events.items) &&
            content.pages.events.items.length > 0
        ) ? content.pages.events.items : null;

        if (pathname === '/events' && !eventsItems) {
            return new Response('Page not found', { status: 404 });
        }

        const nav = rawNav.filter(item =>
            !((item.href || '').replace(/\/+$/, '') === '/events' && !eventsItems)
        );

        const logoName = escHtml(logo.name || biz.name || '');
        const logoTld  = escHtml(logo.tld || '');

        const bodyClasses = [
            'content-loaded',
            hasReservations ? 'has-reserve-integration' : '',
            hasOrder        ? 'has-order-integration'   : '',
        ].filter(Boolean).join(' ');

        let integNavHtml = '';
        if (hasOrder)        integNavHtml += `<a class="integration-btn integration-btn--order" href="${escAttr(orderUrl)}" target="_blank" rel="noopener">Order Online</a>`;
        if (hasReservations) integNavHtml += `<a class="integration-btn integration-btn--reserve" href="${escAttr(reservationsUrl)}" target="_blank" rel="noopener">Reserve</a>`;

        const navHtml = nav.map(item =>
            `<li><a class="nav-link" href="${escAttr(item.href || '#')}">${escHtml(item.label || '')}</a></li>`
        ).join('');

        const hours     = (content.contact && content.contact.hours) || [];
        const hoursHtml = `<strong>Hours</strong>${hours.map(h => `<span>${escHtml(h)}</span>`).join('')}`;

        const tsTheme = computeTurnstileTheme(content.theme);

        const shared = {
            content, biz, formCfg, siteImages, nav, navHtml,
            logoName, logoTld, bodyClasses, integNavHtml, footer,
            hasReservations, hasOrder, reservationsUrl, orderUrl,
            phone, phoneHref, email, emailHref, address, hoursHtml, tsTheme, url,
        };

        let html;
        if (pathname === '/' || pathname === '/home') {
            html = buildIndexPage(shared);
        } else if (pathname === '/menu') {
            html = buildMenuPage(shared);
        } else if (pathname === '/contact') {
            html = buildContactPage(shared);
        } else if (pathname === '/events') {
            html = buildEventsPage({ ...shared, eventsItems });
        } else {
            return new Response('Page not found', { status: 404 });
        }

        return new Response(html, {
            status: 200,
            headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
        });

    } catch (e) {
        console.error('renderPage error:', e);
        return new Response('Internal server error', { status: 500 });
    }
}

// ── Shared builder helpers ─────────────────────────────────────────────────────

function buildCommonHead({ titleText, description, canonical, biz, formCfg, siteImages, includeTurnstile = false }) {
    const ogTags = [
        `<meta property="og:type" content="website">`,
        `<meta property="og:url" content="${escAttr(canonical)}">`,
        `<meta property="og:title" content="${escAttr(titleText)}">`,
        `<meta property="og:description" content="${escAttr(description)}">`,
    ].join('\n  ');
    const inlineScripts = `<script>window.__BUSINESS=${JSON.stringify(biz)};window.__FORM_CONFIG=${JSON.stringify(formCfg)};window.__IMAGES=${JSON.stringify(siteImages)};</script>`;
    const turnstileScript = includeTurnstile
        ? `\n  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
        : '';
    return `  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(titleText)}</title>
  <meta name="description" content="${escAttr(description)}" />
  ${ogTags}
  <link rel="stylesheet" href="/styles.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Lato:wght@300;400;700&display=swap" rel="stylesheet" />${turnstileScript}
  ${inlineScripts}`;
}

function buildHeader({ navHtml, logoName, logoTld, solid = false, integNavHtml, ctaHref, ctaText, showCta = true }) {
    const solidClass = solid ? ' site-header--solid' : '';
    const ctaHtml = showCta
        ? `\n    <a class="header-cta btn btn--primary" href="${escAttr(ctaHref)}">${escHtml(ctaText)}</a>`
        : '';
    return `<header class="site-header${solidClass}" id="top">
  <div class="header-inner container">
    <a class="logo" href="/">
      <span class="logo__name">${logoName}</span><span class="logo__tld">${logoTld}</span>
    </a>
    <button class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <nav class="site-nav" aria-label="Main navigation">
      <ul>${navHtml}</ul>
    </nav>
    <div class="header-integrations">${integNavHtml}</div>${ctaHtml}
  </div>
</header>`;
}

function buildFooter({ navHtml, logoName, logoTld, footerAbout, copyright, hoursHtml, phone, phoneHref, email, emailHref, address, showEmail = false }) {
    const emailLi = showEmail && email
        ? `\n          <li><i data-lucide="mail"></i><a href="${escAttr(emailHref)}">${escHtml(email)}</a></li>`
        : '';
    return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-col footer-col--brand">
      <a class="logo logo--footer" href="/">
        <span class="logo__name">${logoName}</span><span class="logo__tld">${logoTld}</span>
      </a>
      <p class="footer-about">${escHtml(footerAbout)}</p>
      <div class="footer-social">
        <a href="#" aria-label="Instagram"><i data-lucide="instagram"></i></a>
        <a href="#" aria-label="Facebook"><i data-lucide="facebook"></i></a>
      </div>
    </div>
    <div class="footer-col">
      <h4 class="footer-col__heading">Navigate</h4>
      <ul class="footer-links">${navHtml}</ul>
    </div>
    <div class="footer-col">
      <h4 class="footer-col__heading">Hours</h4>
      <div class="footer-hours">${hoursHtml}</div>
    </div>
    <div class="footer-col">
      <h4 class="footer-col__heading">Contact</h4>
      <ul class="footer-contact-list">
        <li><i data-lucide="phone"></i><a href="${escAttr(phoneHref)}">${escHtml(phone)}</a></li>${emailLi}
        <li><i data-lucide="map-pin"></i><span>${escHtml(address)}</span></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <div class="container">
      <p>${escHtml(copyright)}</p>
    </div>
  </div>
</footer>`;
}

function buildFormFields(formCfg, tsTheme) {
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
        }).join('\n        ');
    }
    let tsHtml = '';
    if (formCfg.turnstileSiteKey) {
        tsHtml = `\n        <div class="cf-turnstile" data-sitekey="${escAttr(formCfg.turnstileSiteKey)}" data-theme="${tsTheme}"></div>`;
    }
    return fieldsHtml + tsHtml;
}

const NAV_TOGGLE_SCRIPT = `<script>
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      nav.classList.toggle('site-nav--open');
      toggle.classList.toggle('nav-toggle--open');
    });
  }
</script>`;

// ── Page builders ──────────────────────────────────────────────────────────────

function buildIndexPage({ content, biz, formCfg, siteImages, navHtml, logoName, logoTld, bodyClasses, integNavHtml, footer, hasReservations, hasOrder, reservationsUrl, orderUrl, phone, phoneHref, hoursHtml, url }) {
    const pageData    = (content.pages && content.pages.home) || {};
    const titleText   = pageData.title       || (content.meta && content.meta.title)       || biz.name || '';
    const description = pageData.description || (content.meta && content.meta.description) || '';
    const canonical   = url.origin + url.pathname;
    const hero        = content.hero  || {};
    const chef        = pageData.chef        || {};
    const events      = pageData.events      || {};
    const catering    = pageData.catering    || {};
    const reservation = pageData.reservation || {};
    const address     = biz.address || '';

    const sections = (pageData.sections || []).map((sec, idx) => renderSection(sec, idx)).join('\n');

    // Hero CTA group
    let heroPrimary, heroSecondary;
    if (hasReservations) {
        heroPrimary = `<a class="btn btn--primary btn--lg integration-btn integration-btn--reserve" href="${escAttr(reservationsUrl)}" target="_blank" rel="noopener">${escHtml(hero.ctaText || 'Reserve a Table')}</a>`;
    } else {
        heroPrimary = `<a class="btn btn--primary btn--lg hero-reserve-btn" href="${escAttr(hero.ctaHref || '/contact')}">${escHtml(hero.ctaText || 'Reserve a Table')}</a>`;
    }
    if (hasOrder) {
        heroSecondary = `<a class="btn btn--ghost btn--lg integration-btn integration-btn--order" href="${escAttr(orderUrl)}" target="_blank" rel="noopener">Order Online</a>`;
    } else {
        heroSecondary = `<a class="btn btn--outline btn--lg" href="${escAttr(hero.ctaSecondaryHref || '/menu')}">${escHtml(hero.ctaSecondaryText || 'View Menu')}</a>`;
    }

    // Catering features list
    const cateringFeatures = (catering.features || []).map(f =>
        `<li><i data-lucide="check-circle"></i><span>${escHtml(f)}</span></li>`
    ).join('');

    // Home page event cards (mini cards)
    const homeEventCards = (events.items || []).map(item => `
    <div class="event-card">
      <div class="event-card__date">
        <span class="event-card__day">${escHtml(item.day || '')}</span>
        <span class="event-card__month">${escHtml(item.month || '')}</span>
      </div>
      <div class="event-card__body">
        <h3 class="event-card__title">${escHtml(item.title || '')}</h3>
        <p class="event-card__desc">${escHtml(item.desc || '')}</p>
        <span class="event-card__tag">${escHtml(item.tag || '')}</span>
      </div>
    </div>`).join('');

    // Reservation CTA button
    let reservationCtaBtn;
    if (hasReservations) {
        reservationCtaBtn = `<a class="btn btn--primary btn--lg integration-btn integration-btn--reserve" href="${escAttr(reservationsUrl)}" target="_blank" rel="noopener">${escHtml(reservation.ctaText || 'Reserve a Table')}</a>`;
    } else {
        reservationCtaBtn = `<a class="btn btn--primary btn--lg" href="/contact">${escHtml(reservation.ctaText || 'Reserve a Table')}</a>`;
    }

    const head = buildCommonHead({ titleText, description, canonical, biz, formCfg, siteImages });
    const headerHtml = buildHeader({ navHtml, logoName, logoTld, solid: false, integNavHtml, ctaHref: hero.ctaHref || '/contact', ctaText: hero.ctaText || 'Reserve', showCta: !hasReservations });
    const footerHtml = buildFooter({ navHtml, logoName, logoTld, footerAbout: footer.about || '', copyright: footer.copyright || '', hoursHtml, phone, phoneHref, address, showEmail: false });

    return `<!DOCTYPE html>
<html lang="en">
<head>
${head}
</head>
<body class="${bodyClasses}">

${headerHtml}

<!-- HERO -->
<section class="hero" id="home">
  <div id="hero-images-slot" class="kb-container"></div>
  <div class="hero__bg-overlay"></div>
  <div class="hero__content container">
    <p class="hero__label">${escHtml(hero.label || '')}</p>
    <h1 class="hero__title">${escHtml(hero.title || '')}</h1>
    <p class="hero__subtext">${escHtml(hero.subtext || '')}</p>
    <div class="hero__cta-group">
      ${heroPrimary}
      ${heroSecondary}
    </div>
  </div>
  <div class="hero__scroll-hint"><span></span></div>
</section>

<!-- DYNAMIC SECTIONS -->
<div id="sections-container">${sections}</div>

<!-- CHEF SECTION -->
<section class="chef-section section section--alt" id="chef">
  <div class="container">
    <div class="chef-layout">
      <div class="chef-image-col">
        <div class="chef-image-frame" id="chef-image-slot">
          <div class="chef-image-placeholder">
            <i data-lucide="chef-hat"></i>
          </div>
        </div>
      </div>
      <div class="chef-text-col">
        <p class="section__label">${escHtml(chef.label || 'Meet the Chef')}</p>
        <h2 class="section-heading">${escHtml(chef.heading || 'A Culinary Vision')}</h2>
        <p class="chef-bio">${escHtml(chef.bio || '')}</p>
        <p class="chef-bio chef-bio--secondary">${escHtml(chef.bio2 || '')}</p>
        <div class="chef-signature">${escHtml(chef.name || '')}</div>
      </div>
    </div>
  </div>
</section>

<!-- EVENTS SECTION -->
<section class="events-section section" id="events">
  <div class="container">
    <div class="section__header">
      <p class="section__label">${escHtml(events.label || 'Special Occasions')}</p>
      <h2 class="section-heading">${escHtml(events.heading || 'Upcoming Events')}</h2>
      <p class="section__subheading">${escHtml(events.subheading || '')}</p>
    </div>
    <div class="events-grid">${homeEventCards}
    </div>
  </div>
</section>

<!-- CATERING SECTION -->
<section class="catering-section section section--alt" id="catering">
  <div class="container">
    <div class="catering-layout">
      <div class="catering-text-col">
        <p class="section__label">${escHtml(catering.label || 'Private Events')}</p>
        <h2 class="section-heading">${escHtml(catering.heading || 'Catering & Private Dining')}</h2>
        <p class="catering-desc">${escHtml(catering.desc || '')}</p>
        <ul class="catering-features">
          ${cateringFeatures}
        </ul>
        <a href="/contact" class="btn btn--primary">${escHtml(catering.cta || 'Inquire About Catering')}</a>
      </div>
      <div class="catering-badges-col">
        <div class="catering-badge">
          <div class="catering-badge__icon"><i data-lucide="users"></i></div>
          <div class="catering-badge__num">${escHtml(catering.stat1Num || '')}</div>
          <div class="catering-badge__label">${escHtml(catering.stat1Label || '')}</div>
        </div>
        <div class="catering-badge">
          <div class="catering-badge__icon"><i data-lucide="star"></i></div>
          <div class="catering-badge__num">${escHtml(catering.stat2Num || '')}</div>
          <div class="catering-badge__label">${escHtml(catering.stat2Label || '')}</div>
        </div>
        <div class="catering-badge">
          <div class="catering-badge__icon"><i data-lucide="calendar"></i></div>
          <div class="catering-badge__num">${escHtml(catering.stat3Num || '')}</div>
          <div class="catering-badge__label">${escHtml(catering.stat3Label || '')}</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- RESERVATION CTA -->
<section class="reservation-cta" id="reservations">
  <div class="reservation-cta__overlay"></div>
  <div class="container reservation-cta__inner">
    <p class="section__label">${escHtml(reservation.label || 'Visit Us')}</p>
    <h2 class="section-heading">${escHtml(reservation.heading || 'Join Us for an Unforgettable Evening')}</h2>
    <p class="reservation-cta__sub">${escHtml(reservation.subtext || '')}</p>
    <div class="reservation-cta__actions">
      ${reservationCtaBtn}
      <a class="btn btn--ghost btn--lg" href="${escAttr(phoneHref)}">${escHtml(phone || 'Call Us')}</a>
    </div>
  </div>
</section>

${footerHtml}

<script src="/js/images.js" defer></script>
<script src="/js/lucide.min.js" defer onload="lucide.createIcons()"></script>
${NAV_TOGGLE_SCRIPT}
<script>
  const header = document.querySelector('.site-header');
  window.addEventListener('scroll', () => {
    header.classList.toggle('site-header--scrolled', window.scrollY > 60);
  });
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in-view'); observer.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.section, .event-card, .catering-badge, .chef-image-frame').forEach(el => observer.observe(el));
</script>
</body>
</html>`;
}

function buildMenuPage({ content, biz, formCfg, siteImages, navHtml, logoName, logoTld, bodyClasses, integNavHtml, footer, hasReservations, hasOrder, orderUrl, phone, phoneHref, email, emailHref, hoursHtml, url }) {
    const pageData    = (content.pages && content.pages.menu) || {};
    const titleText   = pageData.title       || (content.meta && content.meta.title) || biz.name || '';
    const description = pageData.description || (content.meta && content.meta.description) || '';
    const canonical   = url.origin + url.pathname;
    const hero        = content.hero || {};
    const address     = biz.address || '';

    const menus         = pageData.menus || [];
    const menuTabsHtml  = renderMenuTabs(menus);
    const menuPanelsHtml = renderMenuPanels(menus);

    let pageIntegHtml = '';
    if (hasOrder) {
        pageIntegHtml = `<a class="integration-btn integration-btn--order" href="${escAttr(orderUrl)}" target="_blank" rel="noopener">Order Online</a>`;
    }

    const head = buildCommonHead({ titleText, description, canonical, biz, formCfg, siteImages });
    const headerHtml = buildHeader({ navHtml, logoName, logoTld, solid: true, integNavHtml, ctaHref: hero.ctaHref || '/contact', ctaText: hero.ctaText || 'Reserve', showCta: !hasReservations });
    const footerHtml = buildFooter({ navHtml, logoName, logoTld, footerAbout: footer.about || '', copyright: footer.copyright || '', hoursHtml, phone, phoneHref, email, emailHref, address, showEmail: true });

    return `<!DOCTYPE html>
<html lang="en">
<head>
${head}
</head>
<body class="${bodyClasses}">

${headerHtml}

<!-- PAGE HERO -->
<section class="page-hero">
  <div id="page-hero-images-slot" class="kb-container" data-slot="hero"></div>
  <div class="page-hero__overlay"></div>
  <div class="container page-hero__content">
    <p class="hero__label">${escHtml(pageData.label || 'Our Offerings')}</p>
    <h1 class="page-hero__title">${escHtml(pageData.title || 'The Menu')}</h1>
    <p class="page-hero__sub">${escHtml(pageData.subtitle || '')}</p>
    <div class="page-hero__integrations">${pageIntegHtml}</div>
  </div>
</section>

<!-- MENU SECTION -->
<section class="menu-section">
  <div class="container">
    <div class="menu-tabs" role="tablist" id="menu-tabs-container">${menuTabsHtml}</div>
    <div id="menu-panels-container">${menuPanelsHtml}</div>
    <div class="menu-notice">
      <p>${escHtml(pageData.notice || '')}</p>
    </div>
  </div>
</section>

${footerHtml}

<script src="/js/images.js"></script>
<script src="/js/lucide.min.js" defer onload="lucide.createIcons()"></script>
${NAV_TOGGLE_SCRIPT}
<script>
  const menuTabsContainer   = document.getElementById('menu-tabs-container');
  const menuPanelsContainer = document.getElementById('menu-panels-container');
  if (menuTabsContainer && menuPanelsContainer) {
    menuTabsContainer.addEventListener('click', (e) => {
      const tab = e.target.closest('.menu-tab');
      if (!tab) return;
      const target = tab.dataset.tab;
      menuTabsContainer.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      menuPanelsContainer.querySelectorAll('.menu-panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById('menu-panel-' + target);
      if (panel) panel.classList.add('active');
    });
  }
</script>
</body>
</html>`;
}

function buildContactPage({ content, biz, formCfg, siteImages, navHtml, logoName, logoTld, bodyClasses, integNavHtml, footer, hasReservations, reservationsUrl, phone, phoneHref, hoursHtml, tsTheme, url }) {
    const pageData    = (content.pages && content.pages.contact) || {};
    const contactCfg  = content.contact || {};
    const titleText   = pageData.title       || (content.meta && content.meta.title) || biz.name || '';
    const description = pageData.description || (content.meta && content.meta.description) || '';
    const canonical   = url.origin + url.pathname;
    const hero        = content.hero || {};
    const address     = biz.address || '';

    const fieldsHtml = buildFormFields(formCfg, tsTheme);
    const submitLabel = escHtml(formCfg.submitLabel || 'Send Message');

    // Reservations block in contact info
    let reservationsBlock = '';
    if (hasReservations) {
        reservationsBlock = `
          <div class="contact-info-block contact-reservations-block">
            <h3 class="contact-info__heading">Reservations</h3>
            <p class="contact-private-text">Book your table quickly and easily through our online reservation system.</p>
            <a class="btn btn--primary" href="${escAttr(reservationsUrl)}" target="_blank" rel="noopener">Reserve a Table</a>
          </div>`;
    }

    let pageIntegHtml = '';
    if (hasReservations) {
        pageIntegHtml = `<a class="integration-btn integration-btn--reserve" href="${escAttr(reservationsUrl)}" target="_blank" rel="noopener">Reserve a Table</a>`;
    }

    const head = buildCommonHead({ titleText, description, canonical, biz, formCfg, siteImages, includeTurnstile: !!formCfg.turnstileSiteKey });
    const headerHtml = buildHeader({ navHtml, logoName, logoTld, solid: true, integNavHtml, ctaHref: hero.ctaHref || '/contact', ctaText: hero.ctaText || 'Reserve', showCta: !hasReservations });
    const footerHtml = buildFooter({ navHtml, logoName, logoTld, footerAbout: footer.about || '', copyright: footer.copyright || '', hoursHtml, phone, phoneHref, address, showEmail: false });

    return `<!DOCTYPE html>
<html lang="en">
<head>
${head}
</head>
<body class="${bodyClasses}">

${headerHtml}

<!-- PAGE HERO -->
<section class="page-hero">
  <div id="page-hero-images-slot" class="kb-container" data-slot="hero"></div>
  <div class="page-hero__overlay"></div>
  <div class="container page-hero__content">
    <p class="hero__label">${escHtml(pageData.label || 'Get in Touch')}</p>
    <h1 class="page-hero__title">${escHtml(pageData.title || 'Contact Us')}</h1>
    <p class="page-hero__sub">${escHtml(pageData.subtitle || '')}</p>
    <div class="page-hero__integrations">${pageIntegHtml}</div>
  </div>
</section>

<!-- CONTACT SECTION -->
<section class="contact-section">
  <div class="container">
    <div class="contact-layout">

      <!-- FORM -->
      <div class="contact-form-col">
        <div class="contact-form-card" id="contact-form-wrapper">
          <h2 class="contact-form__heading">${escHtml(contactCfg.heading || 'Send Us a Message')}</h2>
          <p class="contact-form__sub">${escHtml(contactCfg.subheading || '')}</p>

          <form class="contact-form" id="contact-form" novalidate>
            ${fieldsHtml}
            <button type="submit" class="btn btn--primary btn--block">${submitLabel}</button>
          </form>

          <div class="form-thankyou" id="form-thankyou" hidden>
            <div class="form-thankyou__icon"><i data-lucide="check-circle"></i></div>
            <h3>${escHtml(formCfg.thankYouHeading || 'Message Received!')}</h3>
            <p>${escHtml(formCfg.thankYouMessage || 'Thank you for reaching out.')}</p>
            <p class="form-thankyou__sub">${escHtml(formCfg.thankYouSubtext || '')}</p>
          </div>
        </div>
      </div>

      <!-- INFO -->
      <div class="contact-info-col">
        <div class="contact-info-block">
          <h3 class="contact-info__heading">Find Us</h3>
          <div class="contact-info-item">
            <i data-lucide="map-pin"></i>
            <div>
              <strong>Address</strong>
              <span>${escHtml(address)}</span>
            </div>
          </div>
          <div class="contact-info-item">
            <i data-lucide="phone"></i>
            <div>
              <strong>Phone</strong>
              <a href="${escAttr(phoneHref)}">${escHtml(phone)}</a>
            </div>
          </div>
        </div>

        <div class="contact-info-block">
          <h3 class="contact-info__heading">Hours</h3>
          <div class="contact-hours">${hoursHtml}</div>
        </div>
        ${reservationsBlock}
        <div class="contact-info-block">
          <h3 class="contact-info__heading">Private Events</h3>
          <p class="contact-private-text">${escHtml(pageData.privateText || '')}</p>
          <a class="btn btn--outline" href="/#catering">${escHtml(pageData.privateCtaText || 'Explore Catering')}</a>
        </div>
      </div>

    </div>
  </div>
</section>

${footerHtml}

<script src="/js/images.js"></script>
<script src="/js/lucide.min.js" defer onload="lucide.createIcons()"></script>
${NAV_TOGGLE_SCRIPT}
<script>
  const form = document.getElementById('contact-form');
  const thankYou = document.getElementById('form-thankyou');
  const cfg = window.__FORM_CONFIG || {};

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Sending\u2026';
      try {
        const data = new FormData(form);
        const res = await fetch('/api/submit', { method: 'POST', body: data });
        const json = await res.json();
        if (json.ok) {
          form.style.display = 'none';
          if (thankYou) { thankYou.hidden = false; lucide.createIcons(); }
        } else {
          btn.disabled = false;
          btn.textContent = cfg.submitLabel || 'Send Message';
          alert(json.error || cfg.errorMessage || 'Something went wrong. Please try again.');
        }
      } catch {
        btn.disabled = false;
        btn.textContent = cfg.submitLabel || 'Send Message';
        alert(cfg.errorMessage || 'Network error. Please try again.');
      }
    });
  }
</script>
</body>
</html>`;
}

function buildEventsPage({ content, biz, formCfg, siteImages, navHtml, logoName, logoTld, bodyClasses, integNavHtml, footer, hasReservations, reservationsUrl, eventsItems, phone, phoneHref, hoursHtml, url }) {
    const pageData    = (content.pages && content.pages.events) || {};
    const titleText   = pageData.title       || (content.meta && content.meta.title) || biz.name || '';
    const description = pageData.description || (content.meta && content.meta.description) || '';
    const canonical   = url.origin + url.pathname;
    const hero        = content.hero || {};
    const address     = biz.address || '';
    const email       = biz.email || '';
    const emailHref   = email ? `mailto:${email}` : '#';

    const eventsListingHtml = renderEventsListing(eventsItems || [], phone, phoneHref);

    let pageIntegHtml = '';
    if (hasReservations) {
        pageIntegHtml = `<a class="integration-btn integration-btn--reserve" href="${escAttr(reservationsUrl)}" target="_blank" rel="noopener">Reserve a Table</a>`;
    }

    const head = buildCommonHead({ titleText, description, canonical, biz, formCfg, siteImages });
    const headerHtml = buildHeader({ navHtml, logoName, logoTld, solid: true, integNavHtml, ctaHref: hero.ctaHref || '/contact', ctaText: hero.ctaText || 'Reserve', showCta: !hasReservations });
    const footerHtml = buildFooter({ navHtml, logoName, logoTld, footerAbout: footer.about || '', copyright: footer.copyright || '', hoursHtml, phone, phoneHref, email, emailHref, address, showEmail: true });

    return `<!DOCTYPE html>
<html lang="en">
<head>
${head}
</head>
<body class="${bodyClasses}">

${headerHtml}

<!-- PAGE HERO -->
<section class="page-hero">
  <div id="page-hero-images-slot" class="kb-container" data-slot="event"></div>
  <div class="page-hero__overlay"></div>
  <div class="container page-hero__content">
    <p class="hero__label">${escHtml(pageData.label || 'Special Occasions')}</p>
    <h1 class="page-hero__title">${escHtml(pageData.title || 'Upcoming Events')}</h1>
    <p class="page-hero__sub">${escHtml(pageData.subtitle || '')}</p>
    <div class="page-hero__integrations">${pageIntegHtml}</div>
  </div>
</section>

<!-- EVENTS LISTING -->
<section class="events-page-section">
  <div class="container">
    <div class="events-page-grid" id="events-list">
      ${eventsListingHtml}
    </div>
  </div>
</section>

<!-- PRIVATE EVENTS CTA -->
<section class="events-private-cta section section--alt">
  <div class="container events-private-cta__inner">
    <div class="events-private-cta__text">
      <p class="section__label">${escHtml(pageData.privateLabel || 'Private Events')}</p>
      <h2 class="section-heading">${escHtml(pageData.privateHeading || 'Host Your Own Event')}</h2>
      <p class="events-private-cta__sub">${escHtml(pageData.privateSubtext || '')}</p>
      <a class="btn btn--primary" href="/contact">${escHtml(pageData.privateCtaText || 'Enquire Now')}</a>
    </div>
    <div class="events-private-cta__badges">
      <div class="events-private-cta__badge"><i data-lucide="users"></i><span>Private Hire</span></div>
      <div class="events-private-cta__badge"><i data-lucide="utensils"></i><span>Bespoke Menus</span></div>
      <div class="events-private-cta__badge"><i data-lucide="music"></i><span>Entertainment</span></div>
      <div class="events-private-cta__badge"><i data-lucide="star"></i><span>5-Star Service</span></div>
    </div>
  </div>
</section>

${footerHtml}

<script src="/js/images.js"></script>
<script src="/js/lucide.min.js" defer onload="lucide.createIcons()"></script>
${NAV_TOGGLE_SCRIPT}
<script>
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in-view'); observer.unobserve(e.target); }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.event-page-card, .events-private-cta__badge').forEach(el => observer.observe(el));
</script>
</body>
</html>`;
}

// ── Home page section rendering ────────────────────────────────────────────────

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

// ── Events listing renderer ────────────────────────────────────────────────────

function renderEventsListing(items, phone, phoneHref) {
    if (!items || items.length === 0) return '';

    return items.map(item => {
        const tagHtml = item.tag
            ? `<span class="event-page-card__tag">${escHtml(item.tag)}</span>`
            : '';

        const metaItems = [
            item.date  ? `<span class="event-page-card__meta-item"><i data-lucide="calendar"></i>${escHtml(item.date)}</span>`  : '',
            item.time  ? `<span class="event-page-card__meta-item"><i data-lucide="clock"></i>${escHtml(item.time)}</span>`    : '',
            item.price ? `<span class="event-page-card__meta-item"><i data-lucide="ticket"></i>${escHtml(item.price)}</span>` : '',
        ].filter(Boolean).join('');

        const metaHtml = metaItems ? `<div class="event-page-card__meta">${metaItems}</div>` : '';

        let ctaHtml;
        if (item.url && item.url.trim()) {
            const btnLabel = (item.url_label && item.url_label.trim()) ? item.url_label.trim() : 'Get Tickets';
            ctaHtml = `<a class="btn btn--primary" href="${escAttr(item.url.trim())}" target="_blank" rel="noopener">${escHtml(btnLabel)}</a>`;
        } else {
            const phoneDisplay = phone ? ` \u2014 ${escHtml(phone)}` : '';
            ctaHtml = `<a class="btn btn--outline event-page-card__phone-cta" href="${escAttr(phoneHref)}"><i data-lucide="phone"></i>Call to Reserve${phoneDisplay}</a>`;
        }

        return `<article class="event-page-card">
  <div class="event-page-card__date-badge">
    <span class="event-page-card__day">${escHtml(item.day || '')}</span>
    <span class="event-page-card__month">${escHtml(item.month || '')}</span>
  </div>
  <div class="event-page-card__body">
    <div class="event-page-card__top">
      <h2 class="event-page-card__title">${escHtml(item.title || '')}</h2>
      ${tagHtml}
    </div>
    ${metaHtml}
    <p class="event-page-card__desc">${escHtml(item.desc || '')}</p>
    ${ctaHtml}
  </div>
</article>`;
    }).join('\n');
}

// ── Menu rendering helpers ─────────────────────────────────────────────────────

function renderMenuTabs(menus) {
    if (!menus || menus.length === 0) return '';
    return menus.map((menu, idx) => {
        const active = idx === 0 ? ' active' : '';
        const id     = escAttr(menu.id || String(idx));
        const label  = escHtml(menu.label || menu.id || `Menu ${idx + 1}`);
        return `<button class="menu-tab${active}" role="tab" data-tab="${id}" aria-controls="menu-panel-${id}" aria-selected="${idx === 0 ? 'true' : 'false'}">${label}</button>`;
    }).join('');
}

function renderMenuPanels(menus) {
    if (!menus || menus.length === 0) return '';
    return menus.map((menu, idx) => {
        const active = idx === 0 ? ' active' : '';
        const id     = escAttr(menu.id || String(idx));
        const sectionsHtml = (menu.sections || []).map(sec => renderMenuSection(sec)).join('');
        return `<div class="menu-panel${active}" id="menu-panel-${id}" role="tabpanel">${sectionsHtml}</div>`;
    }).join('');
}

function renderMenuSection(sec) {
    const nameHtml = sec.name
        ? `<h2 class="menu-section__heading">${escHtml(sec.name)}</h2>`
        : '';

    const items = (sec.items || []).map(item => {
        const tagClass = menuTagClass(item.tag || '');
        const tagHtml  = item.tag
            ? `<div class="menu-item__tags"><span class="menu-tag${tagClass}">${escHtml(item.tag)}</span></div>`
            : `<div class="menu-item__tags"></div>`;

        return `<div class="menu-item">
  <div class="menu-item__header">
    <h3 class="menu-item__name">${escHtml(item.name || '')}</h3>
    <span class="menu-item__price">${escHtml(item.price || '')}</span>
  </div>
  <p class="menu-item__desc">${escHtml(item.desc || '')}</p>
  ${tagHtml}
</div>`;
    }).join('');

    const gridHtml = items ? `<div class="menu-grid">${items}</div>` : '';

    return `<div class="menu-section-group">${nameHtml}${gridHtml}</div>`;
}

function menuTagClass(tag) {
    const dark = ['Signature', 'House Specialty', "Chef's Choice", 'House Cocktail', 'By the Bottle', 'Selection'];
    return dark.includes(tag) ? ' menu-tag--dark' : '';
}
