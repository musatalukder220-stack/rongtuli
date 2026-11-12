'use strict';
/* 01-icons.js : our own line icons (24x24 grid). I.svg('name') returns an <svg> string. */
const I = {};
(function () {
  const T = (txt, x, y, size, extra) =>
    '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="currentColor" stroke="none" ' + (extra || '') + '>' + txt + '</text>';
  const P = {
    /* ---- general UI ---- */
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.500a5.5 5.5 0 0 0 0 11H13"/>',
    download: '<path d="M12 3v12"/><path d="M7 10.500l5 5 5-5"/><path d="M4 16v2.500A2.500 2.500 0 0 0 6.500 21h11a2.500 2.500 0 0 0 2.500-2.500V16"/>',
    more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
    next: '<path d="M4 12h16"/><path d="M14 6l6 6-6 6"/>',
    back: '<path d="M20 12H4"/><path d="M10 6l-6 6 6 6"/>',
    chevL: '<path d="M14.500 5.500L8 12l6.500 6.500"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    layers: '<path d="M12 3.500l9 4.800-9 4.800-9-4.800 9-4.800z"/><path d="M3.500 12.500l8.500 4.500 8.500-4.500"/><path d="M3.500 16.500L12 21l8.500-4.500"/>',
    eye: '<path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M4 4l16 16"/><path d="M9.500 5.900A9.700 9.700 0 0 1 12 5.500c6 0 9.500 6.500 9.500 6.500a17 17 0 0 1-2.700 3.500M6.200 7.700A16.500 16.500 0 0 0 2.500 12S6 18.500 12 18.500a9 9 0 0 0 3.700-.800"/>',
    lock: '<rect x="5" y="10.500" width="14" height="10" rx="2"/><path d="M8 10.500v-3a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="10.500" width="14" height="10" rx="2"/><path d="M8 10.500v-3a4 4 0 0 1 7.600-1.700"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4.500h6V7"/><path d="M6.500 7l1 13h9l1-13"/><path d="M10 11v5.500M14 11v5.500"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    up: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
    /* the owner's two PixelLab tools: Position (arrows out from a square) and Relative position */
    position: '<path d="M4 9V5.500A1.500 1.500 0 0 1 5.500 4H9M15 4h3.500A1.500 1.500 0 0 1 20 5.500V9M20 15v3.500a1.500 1.500 0 0 1-1.500 1.500H15M9 20H5.500A1.500 1.500 0 0 1 4 18.500V15"/><path d="M12 8.500v7M8.500 12h7"/>',
    relpos: '<rect x="8.500" y="8.500" width="7" height="7" rx="1.400"/><path d="M2.500 3v18M21.500 3v18M3 2.500h18M3 21.500h18" opacity=".55"/>',
    front: '<path d="M5 4h14"/><path d="M12 20V9"/><path d="M7 13.500l5-5 5 5"/>',
    backward: '<path d="M5 20h14"/><path d="M12 4v11"/><path d="M7 10.500l5 5 5-5"/>',
    edit: '<path d="M4 20l1-4.500L16.500 4a2.100 2.100 0 0 1 3 3L8 18.500 4 20z"/><path d="M14.500 6l3 3"/>',
    image: '<rect x="3.500" y="4.500" width="17" height="15" rx="2.500"/><circle cx="9" cy="10" r="1.600"/><path d="M4 17l5-4.500 4 3.500 3-2.500 4.500 4"/>',
    canvas: '<rect x="4.500" y="3.500" width="15" height="17" rx="2"/><path d="M12 9v6M9 12h6"/>',
    folder: '<path d="M3.500 7a2 2 0 0 1 2-2h4l2 2.500h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7z"/>',
    save: '<path d="M5 4h11l4 4v10.500A1.500 1.500 0 0 1 18.500 20h-13A1.500 1.500 0 0 1 4 18.500v-13A1.500 1.500 0 0 1 5.500 4z"/><path d="M8 4v5h7V4"/><rect x="7.500" y="13" width="9" height="7" rx="1"/>',
    moveto: '<path d="M3.500 7a2 2 0 0 1 2-2h4l2 2.500h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7z"/><path d="M9 13.500h6"/><path d="M12.500 11l2.500 2.500-2.500 2.500"/>',
    share: '<path d="M12 15V3.500"/><path d="M8 7l4-4 4 4"/><path d="M5 12v6.500A1.500 1.500 0 0 0 6.500 20h11a1.500 1.500 0 0 0 1.500-1.500V12"/>',
    reset: '<path d="M4.500 12a7.500 7.500 0 1 0 2.200-5.300"/><path d="M4 4.500V8h3.500"/>',
    compare: '<rect x="3.500" y="5" width="17" height="14" rx="2"/><path d="M12 3v18"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9.500h12V10"/>',
    fitscreen: '<path d="M4 9V5.500A1.500 1.500 0 0 1 5.500 4H9M15 4h3.500A1.500 1.500 0 0 1 20 5.500V9M20 15v3.500a1.500 1.500 0 0 1-1.500 1.500H15M9 20H5.500A1.500 1.500 0 0 1 4 18.500V15"/>',
    sparkle: '<path d="M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800L12 3z"/><path d="M19 15v4M17 17h4"/>',
    emoji: '<circle cx="12" cy="12" r="8.500"/><path d="M9 10h.010M15 10h.010M8.500 14c1.800 2 5.200 2 7 0"/>',
    heart: '<path d="M12 20s-7-4.400-7-10a4 4 0 0 1 7-2.500A4 4 0 0 1 19 10c0 5.600-7 10-7 10z"/>',
    star: '<path d="M12 3.500l2.600 5.400 5.900.800-4.300 4.100 1 5.800-5.200-2.800-5.200 2.800 1-5.800-4.300-4.100 5.900-.800L12 3.500z"/>',

    /* ---- main toolbar ---- */
    tools: '<path d="M7 3v14h14"/><path d="M3 7h14v14"/>',
    effects: T('fx', 3.5, 17, 15.5, 'font-style="italic" font-family="Georgia,Times,serif"'),
    retouch: '<circle cx="11" cy="13" r="7"/><path d="M8.500 12h.010M13.500 12h.010M8.800 15.500c1.300 1 3.100 1 4.400 0"/><path d="M19 2.500v4M17 4.500h4"/>',
    removebg: '<rect x="3.500" y="3.500" width="17" height="17" rx="2.500" stroke-dasharray="3 2.600"/><circle cx="12" cy="10" r="2.500"/><path d="M7.500 17.500c.500-3 2.200-4.500 4.500-4.500s4 1.500 4.500 4.500"/>',
    sticker: '<path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6l-7 7H7a3 3 0 0 1-3-3V7z"/><path d="M20 13h-4a3 3 0 0 0-3 3v4"/><path d="M9 9.500h.010M14 9.500h.010M9 12.800c.900.800 2.100.800 3 0"/>',
    cutout: '<circle cx="7" cy="17.500" r="2.700"/><circle cx="17" cy="17.500" r="2.700"/><path d="M8.500 15.200L16 4M15.500 15.200L8 4"/>',
    text: '<rect x="3.500" y="3.500" width="17" height="17" rx="3"/><path d="M8.500 9.300V8h7v1.300M12 8v8.500M10.500 16.500h3"/>',
    addphoto: '<rect x="3" y="7" width="13.500" height="13.500" rx="2.500"/><path d="M3.500 17l3.800-3.800 3.500 3.500 2.200-2 3.300 3"/><path d="M19.500 2.500v6M16.500 5.500h6"/>',
    replay: '<path d="M5 12a7 7 0 1 1 2 4.900"/><path d="M5 18v-4h4"/><path d="M10.500 9.500v5l4-2.500-4-2.500z"/>',
    fit: '<rect x="3.500" y="3.500" width="17" height="17" rx="2.500"/><rect x="8" y="8.500" width="8" height="7" rx="1"/>',
    brushes: '<path d="M4 20L15 9"/><path d="M13.500 7.500l3 3"/><path d="M18.500 3v3M17 4.500h3M20 10.500v2M19 11.500h2M10.500 3v2M9.500 4h2"/>',
    border: '<rect x="3.500" y="3.500" width="17" height="17" rx="2.500"/><rect x="6.800" y="6.800" width="10.400" height="10.400" rx="1"/><path d="M7 15l3-3 2.500 2.500 2-1.800 2.700 2.500"/>',
    shape: '<rect x="3.500" y="9.500" width="11" height="11" rx="2"/><circle cx="15" cy="9" r="5.500"/>',
    mask: '<rect x="3.500" y="3.500" width="17" height="17" rx="2.500"/><path d="M7 20.500L20.500 7M3.500 14L14 3.500M12 20.500l8.500-8.500"/>',
    draw: '<path d="M19.600 3.400c1 1 1 2.200 0 3.200L11 15.200l-3.200-3.200 8.600-8.600c1-1 2.200-1 3.200 0z"/><path d="M7.800 12c-2 .300-3.300 1.800-3.300 3.800 0 1.500-.800 2.500-2 3.200 3.500 1.200 7.500 0 8.500-3.800"/>',
    lensflare: '<path d="M12 6.500l1.500 4 4 1.500-4 1.500-1.500 4-1.500-4-4-1.500 4-1.500 1.500-4z"/><path d="M12 2v1.500M12 20.500V22M2 12h1.500M20.500 12H22M5 5l1 1M18 18l1 1M19 5l-1 1M6 18l-1 1"/>',
    shapemask: '<rect x="3.500" y="3.500" width="17" height="17" rx="4"/><circle cx="12" cy="12" r="5"/><path d="M8.500 15.500l7-7M9 12.500l3.500-3.500M11.500 15l3.500-3.500"/>',
    frame: '<rect x="5.500" y="5.500" width="13" height="13" rx="1"/><path d="M5.500 2.500v3h-3M18.500 2.500v3h3M5.500 21.500v-3h-3M18.500 21.500v-3h3"/>',
    callout: '<path d="M4 6.500A2.500 2.500 0 0 1 6.500 4h11A2.500 2.500 0 0 1 20 6.500v8a2.500 2.500 0 0 1-2.500 2.500H11l-4.500 3.500V17A2.500 2.500 0 0 1 4 14.500v-8z"/><path d="M9 8.500h6M12 8.500v5"/>',
    apps: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
    myfolders: '<path d="M3.500 7a2 2 0 0 1 2-2h4l2 2.500h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7z"/>',

    /* ---- Tools grid ---- */
    crop: '<path d="M7 3v14h14"/><path d="M3 7h14v14"/>',
    freecrop: '<path d="M5 13c-2-5 3-9 8-8s8 5 6 9-8 4-11 2" stroke-dasharray="2.500 2.500"/><path d="M8 16c-1 2-1 3.500-3 4.500"/>',
    shapecrop: '<path d="M12 4.500l8.500 15h-17L12 4.500z" stroke-dasharray="2.500 2.500"/>',
    dispersion: '<path d="M4 5h7l-3.500 6L4 5z"/><path d="M13.500 5H20l-3.200 5.500L13.500 5z"/><path d="M8.500 13.500h7l-3.500 6-3.500-6z"/>',
    clone: '<circle cx="14.500" cy="9.500" r="6"/><path d="M4 20l5.500-5.500"/><path d="M4 15.500V20h4.500"/>',
    stretch: '<rect x="3.500" y="3.500" width="17" height="17" rx="2.500"/><path d="M3.500 9.500c5 1.500 12-1.500 17 0M3.500 14.500c5-1.500 12 1.500 17 0M9.500 3.500c1.500 5-1.500 12 0 17M14.500 3.500c-1.500 5 1.500 12 0 17"/>',
    motion: '<circle cx="15" cy="12" r="5.500"/><path d="M3 8.500h5M2 12h5M3 15.500h5"/>',
    selection: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2.600"/>',
    curves: '<rect x="3.500" y="3.500" width="17" height="17" rx="2.500"/><path d="M6.500 17.500c5.500 0 4.500-11 11-11"/>',
    adjust: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h9M17 18h3"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="18" r="2"/>',
    enhance: '<path d="M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800L12 3z"/><path d="M19 15v4M17 17h4"/>',
    tiltshift: '<path d="M3.500 5h17M3.500 19h17"/><path d="M3.500 8.500h17M3.500 15.500h17" stroke-dasharray="1 3"/><circle cx="12" cy="12" r="2.500"/>',
    perspective: '<path d="M5 6.500l14-2.500v16L5 17.500v-11z"/><path d="M5 12h14M12 5.200v13.600"/>',
    resize: '<rect x="3.500" y="3.500" width="17" height="17" rx="2.500"/><path d="M8.500 15.500l7-7"/><path d="M11.500 8.500h4v4"/><path d="M8.500 11.500v4h4"/>',
    fliprotate: '<path d="M12 5.500l6.500 6.500-6.500 6.500L5.500 12 12 5.500z"/><path d="M18.500 4a9.500 9.500 0 0 1 2.500 5"/><path d="M5.500 20A9.500 9.500 0 0 1 3 15"/>',

    /* ---- adjust ---- */
    brightness: '<circle cx="12" cy="12" r="4"/><path d="M12 2.500V5M12 19v2.500M2.500 12H5M19 12h2.500M5.300 5.300l1.800 1.800M16.900 16.900l1.800 1.800M5.300 18.700l1.800-1.800M16.900 7.100l1.800-1.800"/>',
    contrast: '<circle cx="12" cy="12" r="8.500"/><path d="M12 3.500a8.500 8.500 0 0 1 0 17z" fill="currentColor"/>',
    clarity: '<path d="M12 4l8.500 15h-17L12 4z"/><path d="M12 10l3.500 6h-7l3.500-6z"/>',
    saturation: '<path d="M12 3.500s6.500 6.600 6.500 11a6.500 6.500 0 0 1-13 0c0-4.400 6.500-11 6.500-11z"/><path d="M5.800 15.500h12.400"/>',
    hue: '<circle cx="12" cy="12" r="8.500"/><circle cx="12" cy="12" r="3"/><path d="M12 3.500V9M19.400 16.200l-4.800-2.700M4.600 16.200l4.800-2.700"/>',
    shadows: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M5 19L19 5v12a2 2 0 0 1-2 2H5z" fill="currentColor" stroke="none"/>',
    highlights: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M19 5L5 19V7a2 2 0 0 1 2-2h12z" fill="currentColor" stroke="none"/>',
    temp: '<path d="M10 13.500V5a2 2 0 0 1 4 0v8.500a4 4 0 1 1-4 0z"/><path d="M12 9v7.500"/>',

    /* ---- object / text options ---- */
    font: T('Aa', 2.2, 17.5, 14.5, 'font-weight="700" font-family="Georgia,Times,serif"'),
    color: '<path d="M12 3.500s6.500 6.600 6.500 11a6.500 6.500 0 0 1-13 0c0-4.400 6.500-11 6.500-11z"/>',
    strokeA: '<path d="M6 19.500L12 4.500l6 15"/><path d="M8.200 14.500h7.600"/>',
    shadow: '<rect x="4" y="4" width="12" height="12" rx="2"/><path d="M8 20h10a2 2 0 0 0 2-2V8"/>',
    highlight: '<rect x="3" y="6" width="18" height="12" rx="2.500"/><path d="M8.500 15l3.500-6.500 3.500 6.500M9.800 12.800h4.400"/>',
    opacity: '<circle cx="12" cy="12" r="8.500"/><path d="M12 3.500v17M12 8h7.500M12 12h8.500M12 16h7.500"/>',
    bend: '<path d="M3.500 16.500c3-9 14-9 17 0"/><path d="M7.500 19.500c2-4 7-4 9 0"/>',
    spacing: '<path d="M4 5v14M20 5v14"/><path d="M8 12h8"/><path d="M10 9.500L7.500 12l2.500 2.500M14 9.500l2.500 2.500-2.500 2.500"/>',
    alignL: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
    alignC: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
    alignR: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
    format: T('B', 3, 17.5, 15, 'font-weight="800" font-family="Georgia,Times,serif"') + T('I', 14.5, 17.5, 15, 'font-style="italic" font-family="Georgia,Times,serif"'),
    blend: '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>',
    flipH: '<path d="M12 3v18" stroke-dasharray="2 2.500"/><path d="M9 7l-5.500 10H9V7z"/><path d="M15 7l5.500 10H15V7z"/>',
    flipV: '<path d="M3 12h18" stroke-dasharray="2 2.500"/><path d="M7 9l10-5.500V9H7z"/><path d="M7 15l10 5.500V15H7z"/>',
    rotL: '<path d="M4.500 9.500A8 8 0 1 1 4 13"/><path d="M4 4.500v5h5"/>',
    rotR: '<path d="M19.500 9.500A8 8 0 1 0 20 13"/><path d="M20 4.500v5h-5"/>',

    /* ---- draw ---- */
    pen: '<path d="M4 20l1.200-4.800L16 4.400a2 2 0 0 1 2.800 0l.800.800a2 2 0 0 1 0 2.800L8.800 18.800 4 20z"/>',
    marker: '<path d="M10 14.500l7-9 3 2.800-7.500 8.700"/><path d="M10 14.500l-3.500 3 .500 2.500h3.500l2-3"/>',
    neon: '<path d="M5 19l8.500-8.500"/><circle cx="16.500" cy="7.500" r="2.500"/><path d="M16.500 2v1.300M16.500 11.700V13M11 7.500h1.300M20.700 7.500H22"/>',
    spray: '<rect x="7.500" y="10" width="7" height="11" rx="1.500"/><path d="M9.500 10V7.500h3V10"/><path d="M16.500 5.500h.010M19 3.500h.010M19 7.500h.010M21 5.500h.010"/>',
    eraser: '<path d="M8 20l-4.500-4.500a1.500 1.500 0 0 1 0-2.100L13 4a1.500 1.500 0 0 1 2.100 0L20 9a1.500 1.500 0 0 1 0 2.100L11 20H8z"/><path d="M8.500 8.500l6.500 6.500"/><path d="M11 20h9"/>',
    size: '<circle cx="6.500" cy="12" r="2"/><circle cx="16" cy="12" r="5"/>',
    /* ---- stage 3 ---- */
    wand: '<path d="M4 20L15 9"/><path d="M13.500 7.500l3 3"/><path d="M19 3v2.500M19 9.500V12M16.500 7.500H14M24 7.500h-2.500"/>',
    dropper: '<path d="M16.500 3.500a2.100 2.100 0 0 1 3 3L17 9l-3-3z"/><path d="M13 7l4 4"/><path d="M14 8.500L5.500 17v2.500H8L16.500 11"/>',
    restore: '<path d="M14 3.500l6 6-6.500 6.500-6-6z"/><path d="M7.500 10L4 17.500l7.500-3.500"/><path d="M18.500 15.500v5M16 18h5"/>',
    lasso: '<ellipse cx="12" cy="9.500" rx="8.500" ry="6" stroke-dasharray="3.200 2.400"/><path d="M7.500 14.500c-1.500 2.500 0 5 2.500 5.500"/>',
    invert: '<circle cx="12" cy="12" r="8.500"/><path d="M12 3.500a8.500 8.500 0 0 0 0 17z" fill="currentColor"/>',
    bucket: '<path d="M11 3.500l8 8-7 7a2 2 0 0 1-2.800 0L4 13.300a2 2 0 0 1 0-2.800z"/><path d="M4.500 12h13.500"/><path d="M20.500 15.500c1.200 1.800 1.200 3 0 3.800-1.200-.800-1.200-2 0-3.800z"/>',
    ratio: '<rect x="3.500" y="6" width="17" height="12" rx="2"/><path d="M8 10v4M16 10v4"/>',
    blurdot: '<circle cx="12" cy="12" r="3.500"/><circle cx="12" cy="12" r="7.500" stroke-dasharray="1.500 3"/>',
    angle: '<path d="M4 19h16"/><path d="M4 19L16 6"/><path d="M11 19a7 7 0 0 0-2.200-5"/>',
    tail: '<path d="M5 5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
    target: '<circle cx="12" cy="12" r="7"/><path d="M12 2.500v5M12 16.500v5M2.500 12h5M16.500 12h5"/>',
    swirl: '<path d="M12 12a2.500 2.500 0 1 1 2.500 2.500A5 5 0 1 1 17 9a7.500 7.500 0 1 0 2 5"/>',
    pinch: '<path d="M4 4l5 5M9 5.500V9H5.500"/><path d="M20 4l-5 5M15 5.500V9h3.500"/><path d="M4 20l5-5M9 18.500V15H5.500"/><path d="M20 20l-5-5M15 18.500V15h3.500"/>',
    bloat: '<path d="M9 9L4 4M4 7.500V4h3.500"/><path d="M15 9l5-5M20 7.500V4h-3.500"/><path d="M9 15l-5 5M4 16.500V20h3.500"/><path d="M15 15l5 5M20 16.500V20h-3.500"/>',
    push: '<path d="M8 13V5.500a1.500 1.500 0 0 1 3 0V11l5.200 1.200a2 2 0 0 1 1.500 2.300L17 19.500H9.500L6 15a1.500 1.500 0 0 1 2-2z"/>',
    rect: '<rect x="4" y="5.500" width="16" height="13" rx="1" stroke-dasharray="3.200 2.400"/>',
    oval: '<ellipse cx="12" cy="12" rx="8.500" ry="6.500" stroke-dasharray="3.200 2.400"/>',
    play: '<path d="M8 5.500v13l10.500-6.500z"/>'
  };
  I.has = (name) => !!P[name];
  I.add = (name, body) => { P[name] = body; };
  I.add('paint', '<path d="M5 19c-1.2-1.2-1.4-3.2-.2-4.6L14 5.2a2 2 0 0 1 2.8 0l2 2a2 2 0 0 1 0 2.8L9.6 19.2C8.2 20.4 6.2 20.2 5 19z"/><path d="M12 7l5 5"/><path d="M5 19l2.4-.4"/>');
  /* Style: three sliders (the Font / Style panel had no symbol at all) */
  I.add('styletext', '<path d="M4 7h10"/><path d="M4 12h16"/><path d="M4 17h7"/><circle cx="17" cy="7" r="2"/><circle cx="9.5" cy="17" r="2"/>');
  I.add('preset', '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h6M7 12.5h4"/><circle cx="16.5" cy="13" r="2.2"/>');
  I.add('removeobj', '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 16l4.5-4.5 3.5 3.5"/><circle cx="16.5" cy="9" r="2"/><path d="M9.5 20.5L19 3.5"/><path d="M17.5 15.5l1.2 2.6 2.6 1.2-2.6 1.2-1.2 2.6-1.2-2.6-2.6-1.2 2.6-1.2z"/>');
  I.svg = function (name, size) {
    const s = size || 24;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  };
  I.el = function (name, size) {
    const span = document.createElement('span');
    span.className = 'ic';
    span.innerHTML = I.svg(name, size);
    return span;
  };
  /* the app mark: a rounded tile with a brush stroke.
     `round` = a true circle right to the edge (for a round frame: no square/white corners peeking out) */
  let logoN = 0;                       // every drawn logo gets its OWN gradient id
  I.logo = function (size, round) {
    const s = size || 56;
    /* (the id must be unique: two cards on the screen with the same id, and the second one turns
       black the moment the first is taken away — that is the "colour, then black" the owner saw) */
    const id = 'rtlg' + (++logoN);
    return '<svg viewBox="0 0 64 64" width="' + s + '" height="' + s + '" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5fa2"/><stop offset=".55" stop-color="#c04bf2"/><stop offset="1" stop-color="#6a5cff"/></linearGradient></defs>' +
      (round
        ? '<circle cx="32" cy="32" r="32" fill="url(#' + id + ')"/>'
        : '<rect x="2" y="2" width="60" height="60" rx="16" fill="url(#' + id + ')"/>') +
      '<path d="M18 44c6-1 9-5 10-10l5 5c-2 6-8 9-15 5z" fill="#fff"/>' +
      '<path d="M30 32L46 14c2-2 5 1 3 3L35 37z" fill="#fff"/>' +
      '<circle cx="45" cy="45" r="4" fill="#fff" opacity=".85"/></svg>';
  };
})();
