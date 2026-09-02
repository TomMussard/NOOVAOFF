/**
 * NOOVA — bibliothèque d'icônes SVG partagée (app.html, noova_dashboard.html, noova_admin.html).
 * Convention : trait fin monochrome, viewBox 24x24, fill="none" stroke="currentColor".
 * Chargé en <script src="icons.js"> classique, aucun bundler.
 */
(function () {
  const S = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  const NOOVA_ICONS = {
    // ── Chrome / navigation ──────────────────────────────────────────────
    home: `<svg ${S}><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"/></svg>`,
    community: `<svg ${S}><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M15 14.3c2.4.3 4 2 4 4.7"/></svg>`,
    rewards: `<svg ${S}><rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M4 13h16"/><path d="M12 9v11"/><path d="M12 9c-1.8 0-3.4-1.2-3.4-3S9.2 3.5 10.5 3.5 12 5 12 6.5"/><path d="M12 9c1.8 0 3.4-1.2 3.4-3S14.8 3.5 13.5 3.5 12 5 12 6.5"/></svg>`,
    profile: `<svg ${S}><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2"/></svg>`,
    check: `<svg ${S}><path d="M4 12.5 9.5 18 20 6"/></svg>`,
    close: `<svg ${S}><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    'arrow-right': `<svg ${S}><path d="M4 12h16"/><path d="M13 5l7 7-7 7"/></svg>`,
    'arrow-left': `<svg ${S}><path d="M20 12H4"/><path d="M11 5l-7 7 7 7"/></svg>`,
    search: `<svg ${S}><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-5-5"/></svg>`,
    edit: `<svg ${S}><path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19z"/><path d="M13.5 6.5 17.5 10.5"/></svg>`,
    delete: `<svg ${S}><path d="M5 7h14"/><path d="M9 7V4.5h6V7"/><path d="M7 7l1 13h8l1-13"/><path d="M10 11v6M14 11v6"/></svg>`,
    bell: `<svg ${S}><path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0"/></svg>`,
    chat: `<svg ${S}><path d="M4 5h16v11H9l-4 4V5z"/><path d="M8 9h8M8 12.5h5"/></svg>`,
    export: `<svg ${S}><path d="M12 3v11"/><path d="M8 7l4-4 4 4"/><path d="M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4"/></svg>`,
    lock: `<svg ${S}><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>`,
    info: `<svg ${S}><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.01"/></svg>`,
    warning: `<svg ${S}><path d="M12 4 21.5 20h-19z"/><path d="M12 10v4.5"/><path d="M12 17.7v.01"/></svg>`,
    success: `<svg ${S}><circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.7 2.7L16.3 9"/></svg>`,
    error: `<svg ${S}><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/></svg>`,
    clock: `<svg ${S}><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.2 2"/></svg>`,
    pause: `<svg ${S}><rect x="7" y="5.5" width="4" height="13" rx="1"/><rect x="13" y="5.5" width="4" height="13" rx="1"/></svg>`,
    play: `<svg ${S}><path d="M8 5.5v13l11-6.5z"/></svg>`,
    mail: `<svg ${S}><rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="M4 6.5l8 6.5 8-6.5"/></svg>`,
    image: `<svg ${S}><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5.5-5.5 3 3L18 9l2.5 2.5"/></svg>`,
    document: `<svg ${S}><path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5V8h4"/><path d="M9.5 12.5h5M9.5 15.5h5"/></svg>`,
    'credit-card': `<svg ${S}><rect x="3" y="6" width="18" height="12" rx="1.6"/><path d="M3 10h18"/><path d="M6.5 14.5h3"/></svg>`,
    star: `<svg ${S}><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 6-5.2-2.8-5.2 2.8 1-6-4.3-4.2 5.9-.8z"/></svg>`,
    'gift-generic': `<svg ${S}><rect x="4" y="10" width="16" height="10" rx="1"/><path d="M4 10h16v3.5H4z"/><path d="M12 10v10"/><path d="M12 10c-1-2.7-2.8-4-4.2-4S5.5 7 6.3 8.4C7 9.6 8.7 10 12 10z"/><path d="M12 10c1-2.7 2.8-4 4.2-4S18.5 7 17.7 8.4C17 9.6 15.3 10 12 10z"/></svg>`,
    rocket: `<svg ${S}><path d="M12 3c3 1 5 4 5 8 0 3-2 6-5 9-3-3-5-6-5-9 0-4 2-7 5-8z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16.5 6.5 19M15 16.5 17.5 19"/></svg>`,
    broadcast: `<svg ${S}><path d="M4 10v4h3l5 4V6l-5 4z"/><path d="M15 9c1 .8 1.6 1.8 1.6 3s-.6 2.2-1.6 3"/><path d="M17.5 6.5c1.8 1.4 2.8 3.3 2.8 5.5s-1 4.1-2.8 5.5"/></svg>`,
    logout: `<svg ${S}><path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9"/><path d="M20 12H10"/><path d="M16 8l4 4-4 4"/></svg>`,
    pin: `<svg ${S}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg>`,
    gaming: `<svg ${S}><rect x="2.5" y="8" width="19" height="9.5" rx="4"/><path d="M7 10.5v4.5M4.7 12.75h4.6"/><circle cx="16" cy="11.5" r="1"/><circle cx="18.2" cy="14" r="1"/></svg>`,
    music: `<svg ${S}><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/><path d="M9 17.5V5.5l10-2v10"/></svg>`,
    shopping: `<svg ${S}><path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>`,
    store: `<svg ${S}><path d="M4 9.5 5 4h14l1 5.5"/><path d="M4 9.5a2.3 2.3 0 0 0 4.5.6 2.3 2.3 0 0 0 4.5 0 2.3 2.3 0 0 0 4.5 0 2.3 2.3 0 0 0 4.5-.6"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M10 20v-5h4v5"/></svg>`,
    smile: `<svg ${S}><circle cx="12" cy="12" r="9"/><path d="M8 13.5c1 1.4 2.4 2 4 2s3-.6 4-2"/><path d="M9 9.5v.01M15 9.5v.01"/></svg>`,
    idea: `<svg ${S}><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5a2.6 2.6 0 0 1 1.1-2.2A6 6 0 0 0 12 3z"/></svg>`,
    scale: `<svg ${S}><path d="M12 3v18"/><path d="M5 8h6M13 8h6"/><path d="M5 8 2.5 13a2.6 2.6 0 0 0 5 0z"/><path d="M19 8l-2.5 5a2.6 2.6 0 0 0 5 0z"/></svg>`,
    rank: `<svg ${S}><path d="M8 5h11M8 12h11M8 19h11"/><path d="M4 4.5v3M4 4.5 3 5.3M4 11.5v3M3 15l1-.5 1 .5M4 18.5v3"/></svg>`,
    chart: `<svg ${S}><path d="M4 20V9M10 20V4M16 20v-7M21 20H3"/></svg>`,
    package: `<svg ${S}><path d="M3.5 8 12 3.5 20.5 8 12 12.5z"/><path d="M3.5 8v8.5L12 21l8.5-4.5V8"/><path d="M12 12.5V21"/></svg>`,
    phone: `<svg ${S}><rect x="7" y="2.5" width="10" height="19" rx="1.8"/><path d="M11 18.5h2"/></svg>`,
    robot: `<svg ${S}><rect x="4" y="9" width="16" height="11" rx="2"/><circle cx="9" cy="14.5" r="1.3"/><circle cx="15" cy="14.5" r="1.3"/><path d="M12 9V5.5"/><circle cx="12" cy="4" r="1.3"/><path d="M2 13v3M22 13v3"/></svg>`,
    key: `<svg ${S}><circle cx="7.5" cy="15.5" r="4"/><path d="M10.5 12.5 20 3"/><path d="M16.5 6.5 19 9M13.5 9.5 15.5 11.5"/></svg>`,
    heart: `<svg ${S}><path d="M12 20.5S3.5 15 3.5 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 8.5 2.8C20.5 15 12 20.5 12 20.5z"/></svg>`,
    'heart-filled': `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.5S3.5 15 3.5 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 8.5 2.8C20.5 15 12 20.5 12 20.5z"/></svg>`,
    handshake: `<svg ${S}><path d="M2 12l4-3 4 3 3-3 2 2"/><path d="M22 12l-4-3-3.5 3-2.5-1"/><path d="M9 12l3 3 2-2"/><path d="M12 15l2 2 2-2"/></svg>`,
    note: `<svg ${S}><path d="M6 4h9l3 3v13H6z"/><path d="M9 10h6M9 13.5h6M9 17h4"/></svg>`,
    ticket: `<svg ${S}><path d="M3 9a2 2 0 0 1 0-4h18a2 2 0 0 1 0 4 2 2 0 0 0 0 6 2 2 0 0 1 0 4H3a2 2 0 0 1 0-4 2 2 0 0 0 0-6z"/><path d="M14 5v14" stroke-dasharray="2 3"/></svg>`,
    help: `<svg ${S}><circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 0 1 4.8.8c0 1.7-2.3 2-2.3 3.5"/><path d="M12 17v.01"/></svg>`,
    globe: `<svg ${S}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.5-4-9s1.5-6.5 4-9z"/></svg>`,
    flag: `<svg ${S}><path d="M6 21V4"/><path d="M6 4h12l-3 4.5L18 13H6"/></svg>`,
    eye: `<svg ${S}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    wrench: `<svg ${S}><path d="M14.5 6.5a4 4 0 0 1-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 1 5.3-5.3l-3 3-2-2z"/></svg>`,
    cake: `<svg ${S}><path d="M4 20v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7"/><path d="M4 20h16"/><path d="M4 15c1.5 1 2.5 1 4 0s2.5-1 4 0 2.5 1 4 0 2.5-1 4 0"/><path d="M12 11V7"/><path d="M12 5.5v.01"/></svg>`,
    launch: `<svg ${S}><path d="M12 3c3 1 5 4 5 8 0 3-2 6-5 9-3-3-5-6-5-9 0-4 2-7 5-8z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16.5 6.5 19M15 16.5 17.5 19"/></svg>`,
    gem: `<svg ${S}><path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18"/><path d="M9 4l3 5 3-5"/><path d="M12 9l-2 11M12 9l2 11"/></svg>`,

    // ── Thèmes commerçants (union résident + dashboard) ──────────────────
    food: `<svg ${S}><path d="M6 3v8a2 2 0 0 0 4 0V3"/><path d="M8 11v10"/><path d="M16 3c-1.4 0-2.5 1.6-2.5 5s1.1 5 2.5 5 2.5-1.6 2.5-5-1.1-5-2.5-5z"/><path d="M16 13v8"/></svg>`,
    cafe: `<svg ${S}><path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M7 5.5c0-1 1-1 1-2M10.5 5.5c0-1 1-1 1-2"/></svg>`,
    sport: `<svg ${S}><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.4 2.3 3.6 5.6 3.6 9s-1.2 6.7-3.6 9c-2.4-2.3-3.6-5.6-3.6-9S9.6 5.3 12 3z"/></svg>`,
    wellness: `<svg ${S}><path d="M12 20s-7-4.4-7-9.8A4.2 4.2 0 0 1 12 7.5a4.2 4.2 0 0 1 7 2.7C19 15.6 12 20 12 20z"/></svg>`,
    culture: `<svg ${S}><path d="M4 8l8-4.5L20 8l-8 4.5z"/><path d="M6.5 9.5v6L12 18l5.5-2.5v-6"/><path d="M20 8v6.5"/></svg>`,
    tech: `<svg ${S}><rect x="4" y="5" width="16" height="11" rx="1.4"/><path d="M9 20h6M12 16v4"/><path d="M8 9l2 2-2 2M13 13h3"/></svg>`,
    fashion: `<svg ${S}><path d="M9 4h6l1 3-3 2-3-2z"/><path d="M9 4 4 7l2.5 3L8 9v11h8V9l1.5-2L20 7l-5-3"/></svg>`,
    travel: `<svg ${S}><path d="M3 13l7-2-3-6 2.5-.7L14 10l6-1.6a1.6 1.6 0 0 1 2 1.5c0 .7-.4 1.3-1 1.5L4.5 17z"/><path d="M9 17.5 7 21M13 17.5l1 3.5"/></svg>`,
    'home-deco': `<svg ${S}><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/><circle cx="12" cy="15" r="2"/></svg>`,
    auto: `<svg ${S}><path d="M4 16V12l2-5h12l2 5v4"/><path d="M4 16h16M7 16v2.5M17 16v2.5"/><circle cx="8" cy="13.5" r="1.1"/><circle cx="16" cy="13.5" r="1.1"/></svg>`,
    books: `<svg ${S}><path d="M4 4.5h6v15H4z"/><path d="M14 4.5h6v15h-6z"/><path d="M10 4.5h4v15h-4z"/></svg>`,
    finance: `<svg ${S}><path d="M4 19V9M10 19V5M16 19v-7M20 19V11"/><path d="M4 19h16"/></svg>`,
    pets: `<svg ${S}><circle cx="7" cy="7.5" r="1.8"/><circle cx="12" cy="5.5" r="1.8"/><circle cx="17" cy="7.5" r="1.8"/><path d="M12 12c-3.3 0-6 2-6 4.6 0 1.9 1.6 2.9 3.1 2.1.9-.5 1.9-.7 2.9-.7s2 .2 2.9.7c1.5.8 3.1-.2 3.1-2.1 0-2.6-2.7-4.6-6-4.6z"/></svg>`,
    photo: `<svg ${S}><rect x="3" y="7" width="18" height="13" rx="1.5"/><path d="M8 7l1.6-2.5h4.8L16 7"/><circle cx="12" cy="13.5" r="3.4"/></svg>`,
    eco: `<svg ${S}><path d="M12 3c5 0 8 3.2 8 8-5 0-8-3.2-8-8z"/><path d="M12 21c0-7 2.5-11 8-13"/><path d="M12 21c0-5-2-8-8-9"/></svg>`,
    'real-estate': `<svg ${S}><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5H18.5V10"/><path d="M10 19.5v-6h4v6"/></svg>`,

    // ── Badges / paliers / rang ───────────────────────────────────────────
    target: `<svg ${S}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>`,
    fire: `<svg ${S}><path d="M12 2c1 3-2 4-2 7a2 2 0 0 0 4 0c1 1 2 2.5 2 4.5A5.5 5.5 0 0 1 6.5 19c0-1 .2-2 1-3-2 .5-3.5 2.3-3.5 4.5A8 8 0 0 0 12 22a8 8 0 0 0 7-11.9c-1 1-2 1.5-3 1.4C17 8 14 6 12 2z"/></svg>`,
    people: `<svg ${S}><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M15 14.3c2.4.3 4 2 4 4.7"/></svg>`,
    sparkle: `<svg ${S}><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>`,
    seed: `<svg ${S}><path d="M12 21c-4.5 0-7-3-7-7 4.5 0 7 2.5 7 7z"/><path d="M12 21c4.5 0 7-3 7-7-4.5 0-7 2.5-7 7z"/><path d="M12 21V9"/><path d="M12 9c0-3.5 2-6 5-6 0 3.5-2 6-5 6z"/></svg>`,
    bolt: `<svg ${S}><path d="M13 3 5 13.5h5.5L11 21l8-10.5h-5.5z"/></svg>`,
    trophy: `<svg ${S}><path d="M7 4h10v6a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 3.5"/><path d="M17 6h2.5A2.5 2.5 0 0 1 17 9.5"/><path d="M12 15v3"/><path d="M8.5 21h7l-1-3h-5z"/></svg>`,
    crown: `<svg ${S}><path d="M4 9l3 2.5L12 5l5 6.5L20 9l-1.5 9h-13z"/><path d="M6.5 20.5h11"/></svg>`,
    'medal-1': `<svg ${S}><circle cx="12" cy="14" r="6"/><path d="M12 11.5v5"/><path d="M9 5l3-2 3 2-2 5h-2z"/></svg>`,
    'medal-2': `<svg ${S}><circle cx="12" cy="14" r="6"/><path d="M10 12.3c0-1 .9-1.8 2-1.8s2 .8 2 1.8c0 1.6-4 2-4 4.2h4"/><path d="M9 5l3-2 3 2-2 5h-2z"/></svg>`,
    'medal-3': `<svg ${S}><circle cx="12" cy="14" r="6"/><path d="M10.3 12c0-1 .8-1.6 1.9-1.6s1.9.7 1.9 1.6c0 .8-.8 1.2-1.4 1.4.6.1 1.6.5 1.6 1.5 0 1-.9 1.8-2 1.8s-2-.6-2-1.6"/><path d="M9 5l3-2 3 2-2 5h-2z"/></svg>`,
  };

  function icon(name, opts) {
    opts = opts || {};
    const size = opts.size || 18;
    const markup = NOOVA_ICONS[name] || NOOVA_ICONS['warning'];
    const cls = 'ic ic-' + name + (opts.class ? ' ' + opts.class : '');
    return '<span class="' + cls + '" style="display:inline-flex;width:' + size + 'px;height:' + size + 'px;flex-shrink:0">' + markup + '</span>';
  }

  window.NOOVA_ICONS = NOOVA_ICONS;
  window.icon = icon;
})();
