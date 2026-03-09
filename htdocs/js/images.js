/**
 * images.js — render window.__IMAGES into the restaurant template.
 *
 * Injected by the worker as:
 *   window.__IMAGES = [{ id, tag, description, src, filename, uploaded_at }]
 *
 * Slot behaviour:
 *   hero    — Ken Burns slideshow behind hero section
 *   chef    — single photo in chef-image-frame (zoom on hover via CSS)
 *   gallery — photo grid injected before the footer
 *   event   — images cycled on event cards (future)
 *
 * Ken Burns (CSS-driven):
 *   Each .kb-slide gets --n (total slides) and --i (index) as inline CSS vars.
 *   A single @keyframes kb-cycle in styles.css handles all N values.
 *   Duration per slide = 8s; total cycle = 8s × N.
 */

(function () {
  const images = window.__IMAGES;
  if (!images || !images.length) return;

  const KB_DUR = 8; // seconds per slide

  function byTag(tag) {
    return images.filter(img => img.tag === tag);
  }

  /* ── Hero: Ken Burns ───────────────────────────────────────────────── */
  function initHero() {
    const container = document.getElementById('hero-images-slot');
    if (!container) return;

    const heroImages = byTag('hero');
    if (!heroImages.length) return;

    const n = heroImages.length;
    const animate = n > 1;
    if (animate) {
      container.style.setProperty('--n', n);
      container.style.setProperty('--kb-dur', KB_DUR + 's');
    }

    heroImages.forEach((img, i) => {
      const slide = document.createElement('div');
      slide.className = animate ? 'kb-slide' : 'kb-slide kb-slide--static';
      slide.style.backgroundImage = `url(${img.src})`;
      slide.style.setProperty('--n', n);
      slide.style.setProperty('--i', i);
      container.appendChild(slide);
    });

    container.closest('.hero')?.classList.add('hero--has-bg');
  }

  /* ── Chef: single photo ────────────────────────────────────────────── */
  function initChef() {
    const frame = document.getElementById('chef-image-slot');
    if (!frame) return;

    const chefImages = byTag('chef');
    if (!chefImages.length) return;

    // Use first chef image; hide the placeholder
    const placeholder = frame.querySelector('.chef-image-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    const photo = document.createElement('img');
    photo.className = 'chef-photo';
    photo.src = chefImages[0].src;
    photo.alt = chefImages[0].description || 'Chef';
    frame.appendChild(photo);
  }

  /* ── Gallery: grid before footer ───────────────────────────────────── */
  function initGallery() {
    const galleryImages = byTag('gallery');
    if (!galleryImages.length) return;

    const footer = document.querySelector('.site-footer');
    if (!footer) return;

    const section = document.createElement('section');
    section.className = 'site-gallery';
    section.innerHTML = `
      <div class="container">
        <div class="site-gallery__grid">
          ${galleryImages.map(img => `
            <div class="site-gallery__item">
              <img src="${escAttr(img.src)}" alt="${escAttr(img.description || 'Gallery photo')}" loading="lazy">
            </div>
          `).join('')}
        </div>
      </div>`;

    footer.parentNode.insertBefore(section, footer);
  }

  function escAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  /* ── Sub-page hero: menu.html / contact.html / events.html ────────── */
  function initPageHero() {
    const container = document.getElementById('page-hero-images-slot');
    if (!container) return;

    // data-slot="event" on events page, "hero" on others
    const preferredTag = container.dataset.slot || 'hero';
    const candidates   = byTag(preferredTag).length
        ? byTag(preferredTag)
        : byTag('hero');   // fallback to hero images if slot has none
    if (!candidates.length) return;

    const n = candidates.length;
    container.style.setProperty('--kb-dur', KB_DUR + 's');

    candidates.forEach((img, i) => {
      const slide = document.createElement('div');
      slide.className = 'kb-slide';
      slide.style.backgroundImage = `url(${img.src})`;
      slide.style.setProperty('--n', n);
      slide.style.setProperty('--i', i);
      container.appendChild(slide);
    });
  }

  /* ── Init on DOM ready ─────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  function run() {
    initHero();
    initPageHero();
    initChef();
    initGallery();
  }
})();
