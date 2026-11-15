/* HOOD 405 · Catálogo público. Lee las prendas con foto del Apps Script (solo lectura), arma el pedido y lo manda por WhatsApp. */
(function () {
  'use strict';
  const C = window.HOOD_CATALOGO || {};
  const $ = id => document.getElementById(id);
  const LS_CARRITO = 'hood405.cat.carrito', LS_DATOS = 'hood405.cat.datos';
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const fmt = n => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = n => '$' + fmt(n);
  const moneyCorto = n => '$' + (Number.isInteger(n) ? n.toLocaleString('es-MX') : fmt(n));
  const fotoUrl = f => 'fotos/' + encodeURIComponent(f) + '.jpg';

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    kids.flat(Infinity).forEach(c => { if (c != null && c !== false) el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return el;
  }
  const vaciar = el => { while (el.firstChild) el.removeChild(el.firstChild); };

  /* ---------- estado ---------- */
  let items = [], prendas = [], cat = 'todo', q = '', cargando = true, ultimaCarga = 0, abiertaId = null;
  let carrito = (() => { try { const c = JSON.parse(localStorage.getItem(LS_CARRITO)); return Array.isArray(c) ? c.filter(x => x && x.c && x.q > 0) : []; } catch (e) { return []; } })();
  const guardarCarrito = () => { try { localStorage.setItem(LS_CARRITO, JSON.stringify(carrito)); } catch (e) { /* sin almacenamiento */ } };
  const LS_ENTREGA = 'hood405.cat.entrega';
  let entrega = (() => { try { const e = JSON.parse(localStorage.getItem(LS_ENTREGA)); return { modo: e && (e.modo === 'tienda' || e.modo === 'domicilio') ? e.modo : '', cp: e && /^\d{0,5}$/.test(e.cp || '') ? (e.cp || '') : '' }; } catch (e) { return { modo: '', cp: '' }; } })();
  const guardarEntrega = () => { try { localStorage.setItem(LS_ENTREGA, JSON.stringify(entrega)); } catch (e) { /* sin almacenamiento */ } };
  /** Zonas con entrega a domicilio (opcional, en config.js → cpCubiertos). Vacío = no se valida. Acepta C.P. completos ('93650') o inicios ('936'). */
  const cpsCubiertos = () => (Array.isArray(C.cpCubiertos) ? C.cpCubiertos : []).map(x => String(x).replace(/\D/g, '')).filter(Boolean);
  const cpEstado = cp => { const l = cpsCubiertos(); if (!l.length || !/^\d{5}$/.test(cp)) return ''; return l.some(x => cp.indexOf(x) === 0) ? 'si' : 'no'; };
  const entregaLista = () => entrega.modo === 'tienda' || (entrega.modo === 'domicilio' && /^\d{5}$/.test(entrega.cp) && cpEstado(entrega.cp) !== 'no');
  const porCodigo = c => items.find(i => i.c === c) || null;
  const enCarrito = c => { const l = carrito.find(x => x.c === c); return l ? l.q : 0; };

  /* ---------- datos ---------- */
  const ORDEN_TALLA = ['xxs', 'xs', 'ch', 's', 'm', 'g', 'l', 'xl', 'xxl', '2xl', '3xl', '4xl', 'unica', 'única'];
  function ordenTalla(a, b) {
    const x = norm(a).trim(), y = norm(b).trim(), i = ORDEN_TALLA.indexOf(x), j = ORDEN_TALLA.indexOf(y);
    if (i >= 0 && j >= 0) return i - j;
    if (i >= 0) return -1; if (j >= 0) return 1;
    const nx = parseFloat(x), ny = parseFloat(y);
    if (isFinite(nx) && isFinite(ny)) return nx - ny;
    return x.localeCompare(y, 'es', { numeric: true });
  }
  /** "Playeras", "playera" y "PLAYERAS " son la misma categoría. */
  const claveCat = s => norm(s).trim().replace(/\s+/g, ' ').split(' ').map(w => (w.length > 3 ? w.replace(/s$/, '') : w)).join(' ');
  /** Orden de las pestañas: primero las de config.js; "Playeras de diseñador" va justo después de "Playeras" aunque config.js no la liste. */
  function ordenPestañas() {
    const lista = (C.categorias || []).map(c => c[0]), k = 'playera de disenador';
    if (!lista.some(t => claveCat(t) === k)) {
      const i = lista.findIndex(t => claveCat(t) === 'playera');
      lista.splice(i >= 0 ? i + 1 : lista.length, 0, 'Playeras de diseñador');
    }
    return lista;
  }
  const idxOrden = (orden, label) => { const i = orden.findIndex(t => claveCat(t) === claveCat(label)); return i >= 0 ? i : 99; };
  /** La pestaña es la categoría tal como está en el inventario (se une sin importar mayúsculas, acentos o plural). */
  function etiquetaCategoria(c) {
    const raw = String(c || '').trim().replace(/\s+/g, ' ');
    if (!raw) return 'Más';
    const k = claveCat(raw), conf = (C.categorias || []).find(x => claveCat(x[0]) === k);
    return conf ? conf[0] : raw;
  }
  function agrupar(lista) {
    const g = {};
    lista.forEach(i => {
      const k = norm(i.n).trim() + '|' + norm(i.col).trim();
      const x = g[k] || (g[k] = { id: k, n: i.n, col: i.col, cat: etiquetaCategoria(i.cat), f: i.f, f2: '', vars: [] });
      if (!x.f2 && i.f2 && i.f === x.f) x.f2 = i.f2;
      x.vars.push({ c: i.c, t: i.t || 'Única', d: i.d, p: i.p, ag: i.ag });
    });
    // Tallas del mismo producto con el nombre escrito distinto en el inventario: si comparten la foto, se muestran como una sola prenda.
    const padre = {}, raiz = k => { while (padre[k] !== k) k = padre[k] = padre[padre[k]]; return k; }, dueno = {};
    Object.keys(g).forEach(k => { padre[k] = k; });
    Object.keys(g).forEach(k => { const f = g[k].f; if (!f) return; if (dueno[f] === undefined) dueno[f] = k; else padre[raiz(k)] = raiz(dueno[f]); });
    Object.keys(g).forEach(k => { const r = raiz(k); if (r !== k) { g[r].vars = g[r].vars.concat(g[k].vars); if (!g[r].f2 && g[k].f2) g[r].f2 = g[k].f2; delete g[k]; } });
    const orden = ordenPestañas();
    return Object.keys(g).map(k => {
      const x = g[k];
      x.vars.sort((a, b) => ordenTalla(a.t, b.t));
      const ps = x.vars.map(v => v.p);
      x.p = Math.min.apply(null, ps); x.variaP = Math.max.apply(null, ps) > x.p;
      x.disp = x.vars.reduce((s, v) => s + v.d, 0);
      x.agotada = x.disp <= 0;
      const ultimas = x.vars.filter(v => v.d > 0).reduce((s, v) => s + v.d, 0);
      x.pocas = !x.agotada && ultimas <= 2;
      return x;
    }).sort((a, b) => (a.agotada - b.agotada) || (idxOrden(orden, a.cat) - idxOrden(orden, b.cat)) || a.n.localeCompare(b.n, 'es') || a.col.localeCompare(b.col, 'es'));
  }

  async function cargar(forzar) {
    if (!C.api) { cargando = false; pintar(); return false; }
    try {
      const r = await fetch(C.api + (C.api.indexOf('?') >= 0 ? '&' : '?') + 'a=catalogo', { cache: 'no-store' });
      const j = await r.json();
      if (!j || j.ok !== true || !Array.isArray(j.items)) throw new Error('respuesta inválida');
      items = j.items; prendas = agrupar(items); ultimaCarga = Date.now(); cargando = false;
      try { localStorage.setItem(LS_DATOS, JSON.stringify({ t: ultimaCarga, items })); } catch (e) { /* sin almacenamiento */ }
      pintar(); pintarCarrito();
      return true;
    } catch (e) {
      cargando = false; pintar();
      if (forzar) aviso('No pude actualizar el catálogo. Revisa tu internet.');
      return false;
    }
  }
  function cargarGuardado() {
    try { const d = JSON.parse(localStorage.getItem(LS_DATOS)); if (d && Array.isArray(d.items)) { items = d.items; prendas = agrupar(items); } } catch (e) { /* nada guardado */ }
  }

  /* ---------- avisos ---------- */
  let tToast = null;
  function aviso(t) { const el = $('toast'); el.textContent = t; el.classList.add('ver'); clearTimeout(tToast); tToast = setTimeout(() => el.classList.remove('ver'), 3200); }

  /* ---------- pantalla principal ---------- */
  function categoriasDisponibles() {
    const orden = ordenPestañas(), presentes = {};
    prendas.forEach(p => { presentes[p.cat] = true; });
    const lista = Object.keys(presentes).sort((a, b) => (idxOrden(orden, a) - idxOrden(orden, b)) || a.localeCompare(b, 'es'));
    return lista;
  }
  function filtradas() {
    const palabras = norm(q).trim().split(/\s+/).filter(Boolean);
    return prendas.filter(p => {
      if (cat !== 'todo' && p.cat !== cat) return false;
      if (!palabras.length) return true;
      const texto = norm(p.n + ' ' + p.col + ' ' + p.cat + ' ' + p.vars.map(v => v.c + ' ' + v.t).join(' '));
      return palabras.every(w => texto.indexOf(w) >= 0);
    });
  }
  function foto(src, alt) {
    return h('img', { src, alt: alt || '', loading: 'lazy', decoding: 'async', onerror: ev => { ev.currentTarget.style.visibility = 'hidden'; } });
  }
  /** Foto del producto: una sola, o un carrusel (deslizar o flechas) cuando la prenda tiene 2 fotos. */
  function galeria(p) {
    if (!p.f2) return h('div', { class: 'gr' }, foto(fotoUrl(p.f), p.n));
    const fotos = [p.f, p.f2];
    const pista = h('div', { class: 'gal-pista' }, fotos.map((f, i) => h('div', { class: 'gal-it' }, foto(fotoUrl(f), p.n + ' (foto ' + (i + 1) + ' de 2)'))));
    const puntos = fotos.map((f, i) => h('button', { type: 'button', class: 'gal-p' + (i ? '' : ' on'), 'aria-label': 'Ver foto ' + (i + 1), onclick: () => ir(i) }));
    const ir = i => pista.scrollTo({ left: i * pista.clientWidth, behavior: 'smooth' });
    const actual = () => Math.round(pista.scrollLeft / (pista.clientWidth || 1));
    pista.addEventListener('scroll', () => { const a = actual(); puntos.forEach((d, k) => d.classList.toggle('on', k === a)); });
    return h('div', { class: 'gr gal' }, pista,
      h('button', { type: 'button', class: 'gal-flecha ant', 'aria-label': 'Foto anterior', onclick: () => ir(Math.max(0, actual() - 1)) }, '‹'),
      h('button', { type: 'button', class: 'gal-flecha sig', 'aria-label': 'Foto siguiente', onclick: () => ir(Math.min(1, actual() + 1)) }, '›'),
      h('div', { class: 'gal-puntos' }, puntos));
  }
  /** "Disponible en talla M" / "Disponible en tallas M y L" / "…M, L y XL". */
  function dispTallas(p) {
    const t = p.vars.filter(v => v.d > 0).map(v => v.t);
    if (!t.length || (t.length === 1 && t[0] === 'Única')) return null;
    const lista = t.length === 1 ? t[0] : t.slice(0, -1).join(', ') + ' y ' + t[t.length - 1];
    return h('div', { class: 'disp-tallas' }, 'Disponible en ' + (t.length === 1 ? 'talla ' : 'tallas ') + lista);
  }
  function tarjeta(p) {
    const etiqueta = p.agotada ? h('span', { class: 'etq' }, 'Agotado') : null;
    return h('button', { class: 'tarjeta' + (p.agotada ? ' agotada' : ''), type: 'button', onclick: () => abrirProducto(p.id), 'aria-label': p.n + (p.col ? ' ' + p.col : '') },
      h('div', { class: 'foto' }, foto(fotoUrl(p.f), p.n), etiqueta),
      h('div', { class: 'nombre' }, p.n),
      p.col ? h('div', { class: 'color' }, p.col) : null,
      h('div', { class: 'precio' }, (p.variaP ? 'Desde ' : '') + money(p.p) + ' ', h('small', null, 'MXN')),
      p.vars.length > 1 || p.vars[0].t !== 'Única' ? h('div', { class: 'tallas' }, p.vars.map(v => h('span', { class: v.d > 0 ? '' : 'no' }, v.t))) : null);
  }
  /** Franja en movimiento (portada): solo la 2.ª foto de cada prenda con existencia. Dos filas, en sentidos contrarios. */
  function pintarFranja(cats) {
    const fr = $('franja'); vaciar(fr);
    const fotos = [];
    const porCat = cats.map(c => prendas.filter(p => p.cat === c && !p.agotada && p.f2));
    for (let k = 0; fotos.length < 24 && porCat.some(l => k < l.length); k++) porCat.forEach(l => { if (k < l.length && fotos.length < 24) fotos.push(l[k]); });
    if (cat !== 'todo' || q || fotos.length < 3) { fr.hidden = true; return; }
    const A = fotos.filter((p, i) => i % 2 === 0), B = fotos.filter((p, i) => i % 2 === 1);
    const hasta6 = l => { const r = []; while (r.length < 10 || r.length % l.length) r.push(l[r.length % l.length]); return r; };
    const fila = (lista, der) => {
      const base = hasta6(lista);
      const it = (p, dup) => h('button', { class: 'it', type: 'button', onclick: () => abrirProducto(p.id), 'aria-label': p.n + (p.col ? ' ' + p.col : ''), tabindex: dup ? '-1' : '0', 'aria-hidden': dup ? 'true' : null },
        h('img', { src: fotoUrl(p.f2), alt: '', loading: 'lazy', draggable: 'false', onerror: ev => { const b = ev.currentTarget.parentNode; if (b && b.parentNode) b.parentNode.removeChild(b); } }));
      const pista = h('div', { class: 'pista', style: '--dur:' + Math.max(40, base.length * 7) + 's' }, base.map(p => it(p, false)).concat(base.map(p => { const e = it(p, true); e.classList.add('dup'); return e; })));
      return h('div', { class: 'fila' + (der ? ' der' : '') }, pista);
    };
    fr.appendChild(h('div', { class: 'tit' }, 'Lo nuevo en HOOD'));
    fr.appendChild(fila(A, false));
    if (B.length) fr.appendChild(fila(B, true));
    const pausa = on => fr.classList.toggle('pausa', on); let t = 0;
    fr.addEventListener('touchstart', () => { clearTimeout(t); pausa(true); }, { passive: true });
    fr.addEventListener('touchend', () => { clearTimeout(t); t = setTimeout(() => pausa(false), 1500); }, { passive: true });
    fr.hidden = false;
  }
  function pintar() {
    const cats = categoriasDisponibles();
    if (cat !== 'todo' && cats.indexOf(cat) < 0) cat = 'todo';
    const nav = $('cats'); vaciar(nav);
    if (cats.length > 1) [['todo', 'Todo']].concat(cats.map(c => [c, c])).forEach(([id, t]) => nav.appendChild(h('button', { type: 'button', class: id === cat ? 'on' : '', onclick: () => { cat = id; $('q').value = ''; q = ''; pintar(); window.scrollTo({ top: 0 }); } }, t)));
    const rej = $('rejilla'), vacio = $('vacio'); vaciar(rej); vacio.hidden = true;
    $('portada').hidden = !(cat === 'todo' && !q && prendas.length);
    pintarFranja(cats);
    if (cargando && !prendas.length) {
      for (let i = 0; i < 8; i++) rej.appendChild(h('div', { class: 'tarjeta esq' }, h('div', { class: 'foto' }), h('div', { class: 'l' }), h('div', { class: 'l c' })));
      $('cuenta').textContent = 'Cargando catálogo…'; return;
    }
    if (!C.api) { $('cuenta').textContent = ''; mostrarVacio('Falta conectar el catálogo', 'Escribe la dirección del Google Sheet en config.js (campo api).'); return; }
    const lista = filtradas();
    $('cuenta').textContent = lista.length ? lista.length + (lista.length === 1 ? ' modelo' : ' modelos') + (q ? ' para “' + q.trim() + '”' : (cat !== 'todo' ? ' en ' + cat : '')) : '';
    if (!lista.length) { mostrarVacio(q ? 'No encontramos “' + q.trim() + '”' : 'Aún no hay prendas disponibles', q ? 'Prueba con otra palabra o mira todas las categorías.' : 'Vuelve pronto: estamos subiendo novedades.'); return; }
    lista.forEach(p => rej.appendChild(tarjeta(p)));
  }
  function mostrarVacio(t, s) { const v = $('vacio'); vaciar(v); v.appendChild(h('strong', null, t)); v.appendChild(document.createTextNode(s)); v.hidden = false; }

  /* ---------- ventana de producto ---------- */
  function abrirProducto(id, codigoPreferido) {
    const p = prendas.find(x => x.id === id); if (!p) return;
    abiertaId = id;
    let sel = null;
    if (codigoPreferido) sel = p.vars.find(v => v.c === codigoPreferido && v.d > 0) || null;
    const disponibles = p.vars.filter(v => v.d > 0);
    if (!sel && disponibles.length === 1) sel = disponibles[0];
    let cant = 1;
    const caja = $('modalCaja'); vaciar(caja);
    const msg = h('div', { class: 'msg', role: 'alert' });
    const chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Talla' });
    const cantEl = h('div', { class: 'cant' });
    const btnAgregar = h('button', { class: 'btn primario ancho', type: 'button' }, 'Agregar al pedido');
    const precioEl = h('div', { class: 'pp' });
    const tope = () => sel ? Math.max(0, sel.d - enCarrito(sel.c)) : 0;
    function refrescar() {
      vaciar(chips);
      p.vars.forEach(v => {
        const agot = v.d <= 0;
        chips.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': sel === v ? 'true' : 'false', class: 'chip' + (sel === v ? ' on' : '') + (agot ? ' no' : ''), disabled: agot,
          onclick: () => { sel = v; cant = 1; msg.textContent = ''; refrescar(); } }, v.t));
      });
      precioEl.textContent = money(sel ? sel.p : p.p) + ' MXN';
      const max = tope(); if (cant > max) cant = Math.max(1, max);
      vaciar(cantEl);
      cantEl.appendChild(h('button', { type: 'button', 'aria-label': 'Menos', disabled: !sel || cant <= 1, onclick: () => { cant--; refrescar(); } }, '−'));
      cantEl.appendChild(h('output', null, String(cant)));
      cantEl.appendChild(h('button', { type: 'button', 'aria-label': 'Más', disabled: !sel || cant >= max, onclick: () => { cant++; refrescar(); } }, '+'));
      btnAgregar.disabled = p.agotada || !sel || max < 1;
      btnAgregar.textContent = p.agotada ? 'Agotado' : (!sel ? 'Elige tu talla' : (max < 1 ? 'Ya tienes todas las piezas disponibles' : 'Agregar al pedido'));
    }
    btnAgregar.addEventListener('click', () => {
      if (!sel) { msg.textContent = 'Elige tu talla.'; return; }
      agregar(sel.c, cant);
      cerrarProducto(); abrirCarrito();
    });
    caja.appendChild(h('button', { class: 'x', type: 'button', 'aria-label': 'Cerrar', onclick: cerrarProducto }, '×'));
    caja.appendChild(h('div', { class: 'prod' },
      galeria(p),
      h('div', { class: 'info' },
        h('div', null, h('h2', null, p.n), p.col ? h('div', { class: 'pc' }, p.col) : null),
        precioEl,
        p.agotada ? h('div', { class: 'aviso-cambio' }, 'Esta prenda se agotó por ahora.') : null,
        h('div', null, h('div', { class: 'et' }, 'Talla'), dispTallas(p), chips),
        h('div', null, h('div', { class: 'et' }, 'Cantidad'), cantEl),
        msg, btnAgregar,
        h('button', { class: 'btn ancho', type: 'button', onclick: () => compartir(p, sel) }, 'Compartir'),
        h('div', { class: 'nota-envio' }, (C.avisoEntrega || '') + ' Tu pedido se confirma por WhatsApp.'))));
    refrescar();
    $('modal').hidden = false; document.body.classList.add('fijo');
    try { history.replaceState(null, '', '?p=' + encodeURIComponent((sel || p.vars[0]).c)); } catch (e) { /* sin historial */ }
  }
  function cerrarProducto() {
    $('modal').hidden = true; abiertaId = null;
    if (!$('carrito').hidden) return;
    document.body.classList.remove('fijo');
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* sin historial */ }
  }
  async function compartir(p, sel) {
    const url = location.origin + location.pathname + '?p=' + encodeURIComponent((sel || p.vars[0]).c);
    try {
      if (navigator.share) { await navigator.share({ title: p.n + ' · HOOD 405', text: p.n + (p.col ? ' ' + p.col : '') + ' · ' + money(p.p), url }); return; }
      await navigator.clipboard.writeText(url); aviso('Enlace copiado');
    } catch (e) { /* cancelado */ }
  }

  /* ---------- carrito ---------- */
  function agregar(codigo, n) {
    const i = porCodigo(codigo); if (!i) return;
    const l = carrito.find(x => x.c === codigo), max = i.d;
    if (l) l.q = Math.min(max, l.q + n); else carrito.push({ c: codigo, q: Math.min(max, n) });
    guardarCarrito(); pintarCarrito();
  }
  function lineasValidas() { return carrito.map(l => ({ l, i: porCodigo(l.c) })).filter(x => x.i && x.i.d > 0).map(x => ({ c: x.l.c, q: Math.min(x.l.q, x.i.d), i: x.i })); }
  const totalCarrito = () => lineasValidas().reduce((s, x) => s + x.q * x.i.p, 0);
  let notaCambio = '';
  function pintarCarrito() {
    const n = carrito.reduce((s, l) => s + l.q, 0), badge = $('nCarrito');
    badge.textContent = String(n); badge.hidden = n === 0;
    const cuerpo = $('carritoCuerpo'), pie = $('carritoPie'); vaciar(cuerpo); vaciar(pie);
    if (!carrito.length) {
      cuerpo.appendChild(h('div', { class: 'carrito-vacio' }, h('strong', null, 'Tu pedido está vacío'), h('div', null, 'Elige una prenda y agrégala.')));
      pie.appendChild(h('button', { class: 'btn ancho', type: 'button', onclick: cerrarCarrito }, 'Seguir viendo'));
      return;
    }
    if (notaCambio) cuerpo.appendChild(h('div', { class: 'aviso-cambio', style: 'margin-top:12px' }, notaCambio));
    carrito.forEach(l => {
      const i = porCodigo(l.c), baja = !i || i.d <= 0, p = i && prendas.find(x => x.vars.some(v => v.c === l.c));
      const max = i ? i.d : 0;
      cuerpo.appendChild(h('div', { class: 'linea' + (baja ? ' baja' : '') },
        h('div', { class: 'mini' }, i ? foto(fotoUrl(i.f), '') : null),
        h('div', null,
          h('div', { class: 't' }, i ? i.n : 'Prenda ' + l.c),
          h('div', { class: 's' }, i ? [i.col, i.t ? 'Talla ' + i.t : '', l.c].filter(Boolean).join(' · ') : l.c),
          baja ? h('div', { class: 's', style: 'color:var(--warn);font-weight:700' }, 'Ya no está disponible') : null,
          h('div', { class: 'acc' },
            baja ? null : h('div', { class: 'cant' },
              h('button', { type: 'button', 'aria-label': 'Menos', onclick: () => { l.q = Math.max(1, l.q - 1); guardarCarrito(); notaCambio = ''; pintarCarrito(); } }, '−'),
              h('output', null, String(Math.min(l.q, max))),
              h('button', { type: 'button', 'aria-label': 'Más', disabled: l.q >= max, onclick: () => { l.q = Math.min(max, l.q + 1); guardarCarrito(); notaCambio = ''; pintarCarrito(); } }, '+')),
            h('button', { class: 'quitar', type: 'button', onclick: () => { carrito = carrito.filter(x => x !== l); guardarCarrito(); notaCambio = ''; pintarCarrito(); } }, 'Quitar'))),
        h('div', { class: 'm' }, baja ? '' : money(i.p * Math.min(l.q, max)))));
      void p;
    });
    const validas = lineasValidas(), total = totalCarrito();
    pie.appendChild(h('div', { class: 'total' }, h('span', null, 'Total'), h('span', null, money(total) + ' MXN')));
    pie.appendChild(h('div', { class: 'nota-envio' }, (C.avisoEntrega || '') + ' Te confirmamos disponibilidad y forma de pago por WhatsApp.'));
    const pista = h('div', { class: 'pista-entrega', role: 'status' });
    const actualizarBoton = () => {
      const b = $('btnComprar'), listaE = entregaLista();
      if (b) b.disabled = !validas.length || !listaE;
      const ce = $('cpEstado'), est = entrega.modo === 'domicilio' ? cpEstado(entrega.cp) : '';
      if (ce) { ce.className = 'cp-estado' + (est ? ' ' + est : ''); ce.textContent = est === 'si' ? '✓ Tu código postal es válido para entregas a domicilio. Confirmamos el costo por WhatsApp.' : est === 'no' ? 'Lo sentimos, de momento no cubrimos tu zona. Por favor selecciona "Recoger en tienda" para continuar.' : 'Te confirmamos por WhatsApp si hay entrega en tu zona.'; }
      pista.textContent = !validas.length ? '' : (listaE || (entrega.modo === 'domicilio' && cpEstado(entrega.cp) === 'no') ? '' : (entrega.modo === 'domicilio' ? 'Escribe tu código postal de 5 dígitos para consultar la entrega.' : 'Elige cómo lo quieres: recoger en tienda o entrega a domicilio.'));
    };
    const opcion = (valor, texto) => h('label', { class: 'op' + (entrega.modo === valor ? ' on' : '') },
      h('input', { type: 'radio', name: 'entrega', value: valor, checked: entrega.modo === valor, onchange: () => { entrega.modo = valor; guardarEntrega(); pintarCarrito(); if (valor === 'domicilio') { const c = $('cp'); if (c) c.focus(); } } }), h('span', null, texto));
    pie.appendChild(h('div', { class: 'entrega' },
      h('div', { class: 'et' }, '¿Cómo lo quieres?'),
      opcion('tienda', 'Recoger en tienda'),
      opcion('domicilio', 'Entrega a domicilio (consultar)'),
      entrega.modo === 'domicilio' ? h('div', { class: 'cp' },
        h('input', { id: 'cp', type: 'text', inputmode: 'numeric', autocomplete: 'postal-code', maxlength: '5', placeholder: 'Código postal (5 dígitos)', 'aria-label': 'Código postal', value: entrega.cp,
          oninput: ev => { ev.target.value = ev.target.value.replace(/\D/g, '').slice(0, 5); entrega.cp = ev.target.value; guardarEntrega(); actualizarBoton(); } }),
        h('small', { id: 'cpEstado', class: 'cp-estado' }, 'Te confirmamos por WhatsApp si hay entrega en tu zona.')) : null));
    pie.appendChild(h('button', { class: 'btn wa ancho', id: 'btnComprar', type: 'button', disabled: !validas.length || !entregaLista(), onclick: comprar },
      h('span', { 'aria-hidden': 'true', style: 'display:inline-flex', html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.600 15.100L2 22l5-1.300A10 10 0 1 0 12 2zm5.200 14.200c-.2.600-1.300 1.200-1.800 1.200-.5.100-1 .2-3.300-.7-2.800-1.200-4.600-4.100-4.700-4.300-.1-.2-1.100-1.500-1.100-2.800s.7-2 1-2.300c.2-.3.500-.3.700-.3h.5c.2 0 .4 0 .6.500l.9 2.100c.1.200.1.400 0 .5l-.4.600-.4.400c-.1.200-.3.300-.1.600.2.300.8 1.300 1.700 2.100 1.200 1 2.200 1.300 2.500 1.500.3.100.5.100.7-.1l.9-1.100c.2-.3.400-.2.700-.1l2 1c.3.100.5.200.5.300.1.200.1.700-.1 1.300z"/></svg>' }), 'Comprar por WhatsApp'));
    pie.appendChild(pista); actualizarBoton();
    pie.appendChild(h('button', { class: 'quitar', type: 'button', style: 'justify-self:center', onclick: () => { carrito = []; guardarCarrito(); notaCambio = ''; pintarCarrito(); } }, 'Vaciar pedido'));
  }
  function abrirCarrito() {
    $('fondo').hidden = false; $('carrito').hidden = false; document.body.classList.add('fijo');
    notaCambio = ''; pintarCarrito();
    if (Date.now() - ultimaCarga > 20000) cargar(false).then(() => { if (!$('carrito').hidden) pintarCarrito(); });
  }
  function cerrarCarrito() {
    $('carrito').hidden = true; $('fondo').hidden = true;
    if ($('modal').hidden) document.body.classList.remove('fijo');
  }

  /* ---------- pedido por WhatsApp ---------- */
  function mensaje(lineas) {
    const total = lineas.reduce((s, x) => s + x.q * x.i.p, 0);
    const filas = lineas.map(x => x.q + 'x ' + x.c + ' · ' + x.i.n + (x.i.col ? ' · ' + x.i.col : '') + (x.i.t && x.i.t !== 'Única' ? ' · Talla ' + x.i.t : '') + ' · ' + moneyCorto(x.i.p));
    return ['Hola ' + (C.tienda || 'HOOD 405') + ', quiero hacer este pedido:', '', filas.join('\n'), '', 'Total: ' + moneyCorto(total) + ' MXN', '',
      'Mi nombre: ', entrega.modo === 'domicilio' ? 'Entrega: a domicilio · C.P. ' + entrega.cp + (cpEstado(entrega.cp) === 'si' ? ' (zona con entrega)' : ' (¿tienen entrega en mi zona?)') : 'Entrega: recoger en tienda', '¿Me confirman disponibilidad? Gracias.'].join('\n');
  }
  const urlWhatsapp = texto => 'https://wa.me/' + String(C.whatsapp || '').replace(/\D+/g, '') + '?text=' + encodeURIComponent(texto);
  async function comprar() {
    const btn = $('btnComprar'); if (!btn || btn.disabled || !entregaLista()) return;
    let ventana = null;
    try { ventana = window.open('', '_blank'); } catch (e) { ventana = null; }   // se abre ya (con el toque) para que el navegador no la bloquee
    const texto0 = btn.lastChild.textContent;
    btn.disabled = true; btn.lastChild.textContent = 'Revisando disponibilidad…';
    if (Date.now() - ultimaCarga > 15000) await cargar(false);
    // ajusta el pedido a lo que realmente hay
    const cambios = [];
    carrito = carrito.filter(l => {
      const i = porCodigo(l.c);
      if (!i || i.d <= 0) { cambios.push('Quitamos ' + (i ? i.n : l.c) + ' porque ya se agotó.'); return false; }
      if (l.q > i.d) { cambios.push('De ' + i.n + (i.t ? ' talla ' + i.t : '') + ' solo quedan ' + i.d + '.'); l.q = i.d; }
      return true;
    });
    guardarCarrito();
    if (cambios.length) {
      notaCambio = 'Actualizamos tu pedido: ' + cambios.join(' ') + ' Revísalo y vuelve a tocar Comprar.';
      if (ventana) try { ventana.close(); } catch (e) { /* nada */ }
      pintarCarrito(); return;
    }
    const lineas = lineasValidas();
    if (!lineas.length) { if (ventana) try { ventana.close(); } catch (e) { /* nada */ } pintarCarrito(); return; }
    const url = urlWhatsapp(mensaje(lineas));
    if (ventana) { try { ventana.location.href = url; } catch (e) { location.href = url; } } else location.href = url;
    btn.disabled = false; btn.lastChild.textContent = texto0;
    if (!C.whatsapp) aviso('Elige el chat de la tienda para enviar tu pedido');
  }

  /* ---------- arranque ---------- */
  function iniciar() {
    $('aviso').textContent = C.avisoEntrega || '';
    $('aviso').hidden = !C.avisoEntrega;
    $('ciudad').textContent = C.ciudad || '';
    $('notaPie').textContent = (C.avisoEntrega || '') + ' Los pedidos se confirman por WhatsApp.';
    $('anio').textContent = String(new Date().getFullYear());
    $('q').addEventListener('input', ev => { q = ev.target.value; pintar(); });
    $('abrirCarrito').addEventListener('click', abrirCarrito);
    $('cerrarCarrito').addEventListener('click', cerrarCarrito);
    $('fondo').addEventListener('click', cerrarCarrito);
    $('modal').addEventListener('mousedown', ev => { if (ev.target === $('modal')) cerrarProducto(); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { if (!$('modal').hidden) cerrarProducto(); else if (!$('carrito').hidden) cerrarCarrito(); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - ultimaCarga > 60000) cargar(false); });
    setInterval(() => { if (!document.hidden) cargar(false); }, 120000);
    cargarGuardado(); cargando = !prendas.length; pintar(); pintarCarrito();
    cargar(false).then(() => {
      const p = new URLSearchParams(location.search).get('p');
      if (p) { const pr = prendas.find(x => x.vars.some(v => v.c === p)); if (pr) abrirProducto(pr.id, p); }
    });
  }
  iniciar();
})();
