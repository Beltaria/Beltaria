// Beltaria Studio — menu « Outils » commun : passer d'un outil à l'autre depuis n'importe quelle page.
// Chaque outil charge <script src="studio-nav.js" defer></script> ; le menu s'insère juste après
// le lien retour (.st-header .st-back). La liste ci-dessous est la seule à tenir à jour avec les
// cartes de index.html (tests/smoke.spec.js vérifie qu'elles concordent).
(function () {
  'use strict';

  const SECTIONS = [
    { title: 'Textures & animations', tools: [
      { href: 'animforge.html', name: 'MC AnimForge', hint: 'Animations pixel art + .mcmeta' },
      { href: 'pixelpalette_studio.html', name: 'PixelPalette Studio', hint: 'Recoloriage intelligent' },
      { href: 'armor_and_ingot_fusion.html', name: 'Fusion armure & lingot', hint: 'Recolorer une armure' },
      { href: 'gif_to_spritesheet.html', name: 'GIF vers spritesheet', hint: 'Découper un GIF' },
    ] },
    { title: 'Armures & modèles 3D', tools: [
      { href: 'armor_layer_preview.html', name: "Aperçu d'armure 3D", hint: 'Couches 1.8, HD, enchantement' },
      { href: 'item-3d-maker.html', name: "Items 3D & réglage d'entrée", hint: 'Relief, animations, pack.json' },
    ] },
    { title: 'Icônes du texte', tools: [
      { href: 'rank-generator.html', name: 'Générateur de grades', hint: 'Badges de grade et de niveau' },
      { href: 'glyph-checker.html', name: "Vérificateur d'icônes", hint: 'Comme BeltariaContent les assemble' },
    ] },
    { title: 'Configuration BeltariaContent', tools: [
      { href: 'ores-editor.html', name: 'Minerais', hint: 'ores.yml : hôtes, butin, génération' },
    ] },
  ];

  const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  function build() {
    const back = document.querySelector('.st-header .st-back');
    if (!back || document.getElementById('stNavToggle')) return;

    const wrap = document.createElement('div');
    wrap.className = 'st-nav';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'stNavToggle';
    toggle.className = 'st-nav-toggle';
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'stNavMenu');
    toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16"/></svg><span class="st-nav-toggle-label">Outils</span>';

    const menu = document.createElement('nav');
    menu.id = 'stNavMenu';
    menu.className = 'st-nav-menu';
    menu.setAttribute('aria-label', 'Outils Beltaria Studio');
    menu.hidden = true;

    const home = document.createElement('a');
    home.href = 'index.html';
    home.className = 'st-nav-home';
    home.textContent = 'Tous les outils — Beltaria Studio';
    menu.appendChild(home);

    for (const section of SECTIONS) {
      const h = document.createElement('p');
      h.className = 'st-nav-section';
      h.textContent = section.title;
      menu.appendChild(h);
      for (const tool of section.tools) {
        const a = document.createElement('a');
        a.href = tool.href;
        a.className = 'st-nav-item';
        if (tool.href.toLowerCase() === current) a.setAttribute('aria-current', 'page');
        const name = document.createElement('span');
        name.className = 'st-nav-name';
        name.textContent = tool.name;
        const hint = document.createElement('span');
        hint.className = 'st-nav-hint';
        hint.textContent = tool.hint;
        a.append(name, hint);
        menu.appendChild(a);
      }
    }

    wrap.append(toggle, menu);
    back.insertAdjacentElement('afterend', wrap);

    const items = () => Array.from(menu.querySelectorAll('a'));
    function open() {
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      const here = menu.querySelector('[aria-current="page"]') || items()[0];
      here.focus();
    }
    function close(refocus) {
      if (menu.hidden) return;
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (refocus) toggle.focus();
    }
    toggle.addEventListener('click', () => (menu.hidden ? open() : close(false)));
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(false); });
    document.addEventListener('keydown', e => {
      if (menu.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = items();
        const i = list.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
        list[next].focus();
      }
    });
    menu.addEventListener('focusout', e => { if (!wrap.contains(e.relatedTarget)) close(false); });
  }

  window.StudioNav = { SECTIONS };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
