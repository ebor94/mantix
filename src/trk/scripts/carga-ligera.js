/**
 * Prueba de carga ligera (RNF-3) contra el servidor E2E.
 * 1) Cabina da de alta N participantes y sube su foto (→ PRESENTE).
 * 2) Conecta K clientes Socket.IO (3 jurados, comentarista, pantallas).
 * 3) El comentarista hace L llamadas a pasarela; se mide cuánto tarda cada cambio en llegar a TODOS.
 * 4) Los 3 jurados califican a cada mascota llamada.
 */
const sharp = require('sharp');
const { io } = require('socket.io-client');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const URL_BASE = arg('url', 'http://localhost:3021');
const N = Number(arg('participantes', 150));
const K = Number(arg('clientes', 10));
const L = Number(arg('llamadas', 30));
const API = `${URL_BASE}/api/trk/v1`;

const percentil = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const resumen = (nombre, xs) => console.log(`${nombre}: n=${xs.length} p50=${percentil(xs, 50)}ms p95=${percentil(xs, 95)}ms max=${Math.max(...xs)}ms`);

async function json(url, opciones = {}) {
  const r = await fetch(url, opciones);
  const cuerpo = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${cuerpo.error} ${cuerpo.message}`);
  return cuerpo.data;
}

async function login(nombre, pin) {
  const usuarios = await json(`${API}/auth/usuarios-pin`);
  const u = usuarios.find((x) => x.nombre === nombre);
  const { token } = await json(`${API}/auth/pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario_id: u.id, pin }) });
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, token };
}

(async () => {
  const errores = [];
  const cabina = await login('Cabina E2E', '111111');
  const comentarista = await login('Comentarista E2E', '222222');
  const jurados = [await login('Jurado E2E 1', '333331'), await login('Jurado E2E 2', '333332'), await login('Jurado E2E 3', '333333')];
  const categorias = await json(`${API}/categorias`, { headers: cabina });
  const peq = categorias.find((c) => c.codigo === 'PEQUENOS');
  const foto = await sharp({ create: { width: 1200, height: 1500, channels: 3, background: '#E8711A' } }).jpeg({ quality: 80 }).toBuffer();

  const tiemposAlta = [];
  const ids = [];
  for (let i = 0; i < N; i += 1) {
    const t0 = Date.now();
    try {
      const p = await json(`${API}/participantes`, { method: 'POST', headers: cabina, body: JSON.stringify({
        responsable_nombre: `Carga ${i}`, responsable_telefono: '3000000000', responsable_documento: String(900000 + i),
        mascota_nombre: `Carga ${i}`, especie: 'PERRO', categoria_id: peq.id
      }) });
      const form = new FormData();
      form.append('foto', new Blob([foto], { type: 'image/jpeg' }), 'f.jpg');
      await json(`${API}/participantes/${p.id}/foto`, { method: 'POST', headers: { Authorization: cabina.Authorization }, body: form });
      ids.push(p.id);
    } catch (e) { errores.push(`alta ${i}: ${e.message}`); }
    tiemposAlta.push(Date.now() - t0);
  }
  resumen('Alta + foto (cabina)', tiemposAlta);

  const tokens = [...jurados.map((j) => j.token), comentarista.token, ...Array(Math.max(0, K - 4)).fill(null)];
  const clientes = await Promise.all(tokens.map((token) => new Promise((resolve, reject) => {
    const s = io(`${URL_BASE}/trk`, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  })));

  const propagacion = [];
  const tiemposCalificacion = [];
  for (let i = 0; i < Math.min(L, ids.length); i += 1) {
    const id = ids[i];
    const llegadas = clientes.map((s) => new Promise((resolve) => {
      const h = (m) => { if (m.participante && m.participante.id === id) { s.off('pasarela:cambio', h); resolve(Date.now()); } };
      s.on('pasarela:cambio', h);
    }));
    const t0 = Date.now();
    await json(`${API}/pasarela/${id}`, { method: 'POST', headers: comentarista });
    const tiempos = await Promise.race([Promise.all(llegadas), new Promise((r) => setTimeout(() => r(null), 5000))]);
    if (!tiempos) errores.push(`pasarela ${i}: no llegó a todos en 5 s`);
    else propagacion.push(Math.max(...tiempos) - t0);

    const rubrica = await json(`${API}/rubricas/${peq.id}`, { headers: jurados[0] });
    await Promise.all(jurados.map(async (j) => {
      const t1 = Date.now();
      try {
        await json(`${API}/calificaciones/${id}`, { method: 'PUT', headers: j, body: JSON.stringify({ puntajes: rubrica.criterios.map((c) => ({ criterio_id: c.id, puntaje: Math.floor(c.puntaje_max / 2) })) }) });
      } catch (e) { errores.push(`calificación ${i}: ${e.message}`); }
      tiemposCalificacion.push(Date.now() - t1);
    }));
  }
  resumen(`Propagación pasarela:cambio a ${clientes.length} clientes`, propagacion);
  resumen('Envío de calificación', tiemposCalificacion);
  clientes.forEach((s) => s.close());

  const p95 = percentil(propagacion, 95);
  if (errores.length) console.error(`❌ ${errores.length} errores:\n${errores.slice(0, 10).join('\n')}`);
  if (p95 >= 2000) console.error(`❌ p95 de propagación ${p95} ms ≥ 2000 ms`);
  process.exit(errores.length || p95 >= 2000 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
