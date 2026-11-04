const $ = (s) => document.querySelector(s);

const video = $("#camera");
const statusEl = $("#status");
const previewEl = $("#preview");
const soundBtn = $("#sound");
const scanView = $("#scan");
const orderView = $("#order");
const trainView = $("#train");
const itemsEl = $("#items");
const nowEl = $("#now");
const visionEl = $("#vision");
const classesEl = $("#classes");

let orders = [];   // [{ id, items: [{ qty, name, mods, done, steps: [{ name, done }] }] }]
let oi = 0;        // pedido atual
let fi = 0;        // produto atual

/* ---------- guardar preferências (opcional) ---------- */
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

let soundOn = store.get("sound", "1") === "1";
soundBtn.classList.toggle("off", !soundOn);

/* ---------- câmara ---------- */
async function startCamera() {
  try {
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    setStatus("Aponta para o pedido…");
  } catch {
    setStatus("Sem acesso à câmara. Dá permissão e recarrega.", "err");
  }
}

/* Recebe RGBA (Uint8ClampedArray), devolve RGBA limpo: texto preto em fundo branco, sem linhas */
function cleanPixels(d, w, h) {
  const N = w * h;
  const g = new Float32Array(N);
  for (let i = 0, p = 0; p < N; i += 4, p++) g[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

  // imagem integral para limiar adaptativo (aguenta sombras e reflexos)
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += g[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(8, Math.round(Math.min(w, h) / 12));
  const dark = new Uint8Array(N);
  let darkCount = 0;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      const mean = s / ((x1 - x0) * (y1 - y0));
      const v = g[y * w + x];
      if (v < mean - 12) { dark[y * w + x] = 1; darkCount++; }
    }
  }

  // ecrã escuro com letras claras → repete com a lógica invertida
  if (darkCount > N * 0.5) for (let p = 0; p < N; p++) dark[p] ^= 1;

  // apagar o que não é letra: linhas, bordas e pontinhos (componentes ligados)
  const label = new Int32Array(N);
  const stack = new Int32Array(N);
  const minArea = Math.max(6, Math.round(N * 0.00002));
  let cur = 0;
  const comps = [];
  for (let p0 = 0; p0 < N; p0++) {
    if (!dark[p0] || label[p0]) continue;
    cur++;
    let sp = 0, area = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    stack[sp++] = p0; label[p0] = cur;
    const pix = [];
    while (sp) {
      const p = stack[--sp];
      pix.push(p);
      const x = p % w, y = (p / w) | 0;
      area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && dark[p - 1] && !label[p - 1]) { label[p - 1] = cur; stack[sp++] = p - 1; }
      if (x < w - 1 && dark[p + 1] && !label[p + 1]) { label[p + 1] = cur; stack[sp++] = p + 1; }
      if (y > 0 && dark[p - w] && !label[p - w]) { label[p - w] = cur; stack[sp++] = p - w; }
      if (y < h - 1 && dark[p + w] && !label[p + w]) { label[p + w] = cur; stack[sp++] = p + w; }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const fill = area / (bw * bh);
    const touchesEdge = x0 === 0 || y0 === 0 || x1 === w - 1 || y1 === h - 1;
    const isLine = bw > 5 * bh || (bw > 2.5 * bh && fill < 0.25) || bh > 6 * bw && fill > 0.6;
    const isBig = bw > w * 0.5 || bh > h * 0.3;
    comps.push({ pix, bh, drop: touchesEdge || isLine || isBig || area < minArea });
  }
  // altura típica de uma letra → tira o que for muito mais pequeno (riscos, pó, reflexos)
  const hs = comps.filter((c) => !c.drop).map((c) => c.bh).sort((a, b) => a - b);
  const letterH = hs.length ? hs[Math.floor(hs.length * 0.6)] : 0;
  for (const c of comps) {
    if (c.drop || c.bh < letterH * 0.45) for (const p of c.pix) dark[p] = 0;
  }

  const out = new Uint8ClampedArray(N * 4);
  for (let p = 0; p < N; p++) {
    const v = dark[p] ? 0 : 255;
    out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = v;
    out[p * 4 + 3] = 255;
  }
  return out;
}

/* Foto tratada para o OCR: preto e branco, sem linhas, bordas nem reflexos */
function snapshot() {
  const w = video.videoWidth, h = video.videoHeight;
  const scale = Math.min(2, 1800 / Math.max(w, h)); // aumenta imagens pequenas
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  img.data.set(cleanPixels(img.data, c.width, c.height));
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ---------- OCR grátis no próprio browser (Tesseract) ---------- */
let workerPromise = null;
function getWorker() {
  // carrega uma vez só e fica pronto para as próximas leituras
  workerPromise ??= Tesseract.createWorker("por").then(async (w) => {
    await w.setParameters({
      tessedit_pageseg_mode: "6",       // bloco de texto (lista de linhas)
      preserve_interword_spaces: "1",   // não colar palavras
    });
    return w;
  });
  return workerPromise;
}

/* Junta as palavras de cada linha, deitando fora as que o OCR não tem certeza */
function cleanText(data) {
  return (data.lines || [])
    .map((line) =>
      line.words
        .filter((wd) => wd.confidence >= 50)
        .map((wd) => wd.text.replace(/^[^\p{L}\p{N}(+#-]+|[^\p{L}\p{N})]+$/gu, ""))
        .filter((t) => t.length)
        .join(" ")
    )
    .filter((l) => l.length)
    .join("\n");
}

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/* Transforma o texto lido em pedidos/itens/alterações */
function parseOrders(text) {
  const result = [];
  let order = null;
  let last = null;

  const newOrder = (id = "") => {
    order = { id, items: [] };
    result.push(order);
    last = null;
  };

  for (let raw of text.split(/\r?\n/)) {
    let line = raw.replace(/[|_~=*»«]/g, " ").replace(/\s+/g, " ").trim();
    const n = norm(line);

    // número do pedido: "#123", "Pedido 123", "Nº 123", "Order 123"
    const id = n.match(/^(?:#|pedido|n[ºo°.]?|order|ordem)\s*:?\s*(\d{1,5})\b/);
    if (id || /^#?\s*\d{2,4}$/.test(n)) {
      newOrder((id ? id[1] : n.replace(/\D/g, "")));
      continue;
    }

    if ((n.match(/[a-z]/g) || []).length < 2) continue; // lixo
    if (/\d{1,2}:\d{2}/.test(n) && n.length < 12) continue;   // horas
    if (/€|eur\b|total|subtotal|iva\b/.test(n)) continue;      // preços/totais

    if (!order) newOrder();

    // alteração: "- sem cebola", "+ bacon", "sem ...", "extra ...", "com ..."
    if (/^[-+>•·]/.test(line) || /^(sem|extra|mais|menos|com|s\/|c\/|so|apenas|molho a parte|a parte)\b/.test(n)) {
      const mod = line.replace(/^[->•·]\s*/, "").trim();
      if (last) last.mods.push(mod);
      else order.items.push((last = { qty: 1, name: mod, mods: [] }));
      continue;
    }

    // item: "2 Big Mac", "2x Big Mac", "Big Mac x2"
    let qty = 1;
    let name = line;
    const front = line.match(/^(\d{1,2})\s*[xX]?\s+(.+)/);
    const back = line.match(/^(.+?)\s+[xX]\s*(\d{1,2})$/);
    if (front) { qty = +front[1]; name = front[2]; }
    else if (back) { qty = +back[2]; name = back[1]; }

    order.items.push((last = { qty, name: name.trim(), mods: [] }));
  }

  return result.filter((o) => o.items.length).slice(0, 10);
}

/* ---------- leitura automática ---------- */
// Lê sem parar enquanto a imagem está quieta. Quando a mesma leitura aparece
// CONFIRM vezes nas últimas HISTORY leituras, considera o pedido estável e abre-o.
const CONFIRM = 2;
const HISTORY = 4;
const MOTION_LIMIT = 8;   // acima disto a câmara está a mexer (0–255)

let history = [];         // assinaturas das últimas leituras
let lastFound = [];       // última leitura (para o preview e o Enter)
let lastSig = "";
let lastLockedSig = "";   // último pedido aberto (para não abrir o mesmo outra vez)
let prevFrame = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "impressão digital" de uma leitura, para comparar leituras entre si
function sigOf(list) {
  return list
    .map((o) => o.id + ":" + o.items
      .map((i) => i.qty + norm(i.name).replace(/[^a-z0-9]/g, "") + "|" + i.mods.map((m) => norm(m).replace(/[^a-z0-9]/g, "")).join(","))
      .join(";"))
    .join("/");
}

// quanto a imagem mudou desde a última vez (miniatura em cinzento)
const tiny = document.createElement("canvas");
tiny.width = 48;
tiny.height = 27;
const tctx = tiny.getContext("2d", { willReadFrequently: true });
function motion() {
  tctx.drawImage(video, 0, 0, tiny.width, tiny.height);
  const d = tctx.getImageData(0, 0, tiny.width, tiny.height).data;
  const g = new Float32Array(d.length / 4);
  for (let i = 0, p = 0; p < g.length; i += 4, p++) g[p] = (d[i] + d[i + 1] + d[i + 2]) / 3;
  let diff = 255;
  if (prevFrame) {
    diff = 0;
    for (let p = 0; p < g.length; p++) diff += Math.abs(g[p] - prevFrame[p]);
    diff /= g.length;
  }
  prevFrame = g;
  return diff;
}

async function scanLoop() {
  let worker;
  try {
    worker = await getWorker();
  } catch {
    return setStatus("Erro a carregar o leitor de texto. Recarrega a página.", "err");
  }

  for (;;) {
    if (!scanView.classList.contains("active") || !video.videoWidth || document.hidden) {
      await sleep(300);
      continue;
    }

    // 1) esperar que a imagem fique quieta
    if (motion() > MOTION_LIMIT) {
      history = [];
      scanView.classList.remove("busy");
      setStatus("Segura quieto em frente ao pedido…");
      await sleep(150);
      continue;
    }

    // 2) ler
    scanView.classList.add("busy");
    let found = [];
    try {
      const { data } = await worker.recognize(snapshot());
      found = parseOrders(cleanText(data));
    } catch {
      await sleep(500);
      continue;
    }
    if (!scanView.classList.contains("active")) continue; // entretanto saiu deste ecrã

    // a imagem mexeu durante a leitura? deita fora e recomeça
    if (motion() > MOTION_LIMIT) { history = []; continue; }

    const sig = sigOf(found);
    lastFound = found;
    lastSig = sig;
    renderPreview(found);

    if (!found.length) {
      history = [];
      setStatus("À procura de um pedido…");
      await sleep(250);
      continue;
    }

    // 3) ir corrigindo até estabilizar
    history.push(sig);
    if (history.length > HISTORY) history.shift();
    const hits = history.filter((h) => h === sig).length;

    if (hits < CONFIRM) {
      setStatus(`A confirmar leitura… ${hits}/${CONFIRM}`, "busy");
      continue;
    }

    if (sig === lastLockedSig) {
      setStatus("Este pedido já foi aberto. Aponta para o próximo (Enter abre de novo).");
      await sleep(400);
      continue;
    }

    lock(found, sig);
  }
}

/* ---------- receitas ---------- */
const RECEITAS = window.RECEITAS || {};
const NADA = window.CLASSE_NADA || "Nada";
const nkey = (s) => norm(String(s)).replace(/[^a-z0-9]+/g, " ").trim();

function allIngredients() {
  const set = new Map();
  for (const list of Object.values(RECEITAS)) for (const x of list) if (!set.has(nkey(x))) set.set(nkey(x), x);
  return [...set.values()];
}

// passos de um produto, ajustados pelas alterações ("sem cebola", "+ bacon")
function recipeFor(item) {
  const name = nkey(item.name);
  let best = null;
  for (const key of Object.keys(RECEITAS)) {
    const k = nkey(key);
    if (k && name.includes(k) && (!best || k.length > nkey(best).length)) best = key;
  }
  if (!best) return [];

  let steps = [...RECEITAS[best]];
  const known = allIngredients();
  for (const mod of item.mods || []) {
    const m = nkey(mod);
    const ing = known.find((x) => m.includes(nkey(x)));
    if (!ing) continue;
    if (/^(sem|s|menos)\b/.test(m)) steps = steps.filter((s) => nkey(s) !== nkey(ing));
    else if (/^(extra|mais|com|c)\b/.test(m) || mod.trim().startsWith("+")) steps.push(ing);
  }
  return steps.map((name) => ({ name, done: false }));
}

const nextStep = (item) => item.steps.findIndex((s) => !s.done);
const itemDone = (item) => (item.steps.length ? item.steps.every((s) => s.done) : item.done);

function lock(found, sig) {
  orders = found.map((o) => ({
    ...o,
    items: o.items.map((i) => ({ ...i, done: false, steps: recipeFor(i) })),
  }));
  lastLockedSig = sig;
  history = [];
  oi = 0;
  fi = 0;
  lastFired = null;
  scanView.classList.remove("busy");
  navigator.vibrate?.(80);
  show(orderView);
  render();
  speakOrder();
}

// mostra por baixo da câmara o que está a ser lido (vai-se corrigindo sozinho)
function renderPreview(found) {
  const items = found.flatMap((o) => o.items);
  previewEl.innerHTML = items
    .slice(0, 8)
    .map((i) => `<li><b>${esc(i.qty)}</b> ${esc(i.name)}${i.mods.length ? ` <span>${i.mods.map(esc).join(" · ")}</span>` : ""}</li>`)
    .join("");
}

/* ---------- desenhar o pedido ---------- */
function render() {
  const order = orders[oi];
  const total = order.items.length;
  const done = order.items.filter(itemDone).length;

  $("#orderTitle").textContent = order.id ? `Pedido ${order.id}` : "Pedido";
  $("#orderNav").textContent = orders.length > 1 ? `${oi + 1} de ${orders.length} pedidos` : "";
  $("#progress").textContent = `${done}/${total}`;
  $("#barFill").style.width = `${(done / total) * 100}%`;

  // produto atual, com os passos que a câmara vai confirmando
  const cur = order.items[fi];
  const k = nextStep(cur);
  nowEl.className = itemDone(cur) ? "done" : "";
  nowEl.innerHTML = `
    <div class="nowName"><span class="qty">${itemDone(cur) ? "✓" : esc(cur.qty)}</span><span>${esc(cur.name)}</span></div>
    ${cur.mods.length ? `<div class="mods">${cur.mods.map(esc).join(" · ")}</div>` : ""}
    ${cur.steps.length
      ? `<div class="steps">${cur.steps.map((s, i) =>
          `<span class="step ${s.done ? "done" : i === k ? "next" : ""}">${s.done ? "✓ " : ""}${esc(s.name)}</span>`).join("")}</div>`
      : `<div class="muted">Sem receita — Enter para marcar</div>`}`;

  // lista de todos os produtos
  itemsEl.innerHTML = "";
  order.items.forEach((item, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "item" + (itemDone(item) ? " done" : "") + (i === fi ? " focused" : "");
    const prog = item.steps.length ? `${item.steps.filter((s) => s.done).length}/${item.steps.length}` : "";
    btn.innerHTML = `
      <span class="qty">${itemDone(item) ? "✓" : esc(item.qty ?? 1)}</span>
      <span class="txt"><div class="name">${esc(item.name)}</div></span>
      <span class="prog">${prog}</span>`;
    btn.addEventListener("click", () => {
      if (fi === i) markNext();
      else { fi = i; render(); }
    });
    li.appendChild(btn);
    itemsEl.appendChild(li);
  });

  if (done === total) {
    const li = document.createElement("li");
    li.className = "complete";
    li.textContent = "Pedido completo ✓";
    itemsEl.appendChild(li);
  }

  itemsEl.querySelectorAll(".item")[fi]?.scrollIntoView({ block: "nearest" });
}

// Enter: marca o próximo passo (ou o produto, se não tiver receita)
function markNext() {
  const item = orders[oi].items[fi];
  if (item.steps.length) {
    const k = nextStep(item);
    if (k === -1) item.steps.forEach((s) => (s.done = false)); // já estava pronto → recomeça
    else item.steps[k].done = true;
  } else {
    item.done = !item.done;
  }
  afterChange(item);
}

// Backspace: desfaz o último passo (para corrigir um engano da câmara)
function undoStep() {
  const item = orders[oi].items[fi];
  if (item.steps.length) {
    const last = item.steps.map((s) => s.done).lastIndexOf(true);
    if (last !== -1) item.steps[last].done = false;
  } else item.done = false;
  render();
}

function afterChange(item) {
  const items = orders[oi].items;

  if (itemDone(item)) {
    beep(880, 0.12);
    // salta para o próximo produto por fazer
    let next = items.findIndex((it, i) => i > fi && !itemDone(it));
    if (next === -1) next = items.findIndex((it) => !itemDone(it));
    if (next !== -1) {
      fi = next; // (lastFired fica: o que está à frente da câmara não conta para o produto seguinte)
      speak(`Próximo: ${items[fi].name}`);
    }
  }

  if (items.every(itemDone)) {
    speak("Pedido completo");
    navigator.vibrate?.(200);
    // volta sozinho à câmara para o próximo pedido
    const current = orders;
    setTimeout(() => {
      if (orders === current && orderView.classList.contains("active") && current[oi].items.every(itemDone)) back();
    }, 2500);
  }
  render();
}

/* ---------- visão: ver o que estás a meter ---------- */
const MIN_CONF = 0.7;   // certeza mínima (0–1)
const STEADY = 3;       // nº de imagens seguidas a ver a mesma coisa
let streak = { label: null, n: 0 };
let lastFired = null;   // última coisa confirmada (só volta a contar depois de ver outra)
let msgUntil = 0;

async function visionLoop() {
  try {
    await Visao.init();
  } catch {
    visionEl.textContent = "Visão indisponível (modelo não carregou).";
    return;
  }

  for (;;) {
    if (!orderView.classList.contains("active") || !Visao.trained() || document.hidden) {
      if (orderView.classList.contains("active") && !Visao.trained() && Date.now() > msgUntil) {
        visionEl.className = "muted";
        visionEl.textContent = "👁 Câmara por treinar (🧠 no ecrã inicial)";
      }
      await sleep(400);
      continue;
    }

    const p = Visao.predict(video);
    await sleep(150);
    if (!p || !orderView.classList.contains("active")) continue;

    streak = p.label === streak.label ? { label: p.label, n: streak.n + 1 } : { label: p.label, n: 1 };

    if (Date.now() > msgUntil) {
      visionEl.className = "muted";
      visionEl.textContent = p.label === NADA ? "👁 …" : `👁 ${p.label} ${Math.round(p.conf * 100)}%`;
    }

    if (streak.n >= STEADY && p.conf >= MIN_CONF && p.label !== lastFired) {
      lastFired = p.label;
      if (p.label !== NADA) onDetect(p.label);
    }
  }
}

function visionMsg(text, type) {
  visionEl.className = type;
  visionEl.textContent = text;
  msgUntil = Date.now() + 3000;
}

function onDetect(label) {
  const item = orders[oi].items[fi];
  const L = nkey(label);

  if (!item.steps.length) return visionMsg(`👁 ${label}`, "muted");

  const k = nextStep(item);
  if (k === -1) return visionMsg(`${item.name} já está pronto`, "warn");

  // era mesmo o próximo passo
  if (nkey(item.steps[k].name) === L) {
    item.steps[k].done = true;
    visionMsg(`✓ ${label}`, "ok");
    beep(660, 0.08);
    return afterChange(item);
  }

  // leva isto, mas ainda não é a vez
  const later = item.steps.findIndex((s, i) => i > k && !s.done && nkey(s.name) === L);
  if (later !== -1) {
    item.steps[later].done = true;
    visionMsg(`⚠ Fora de ordem: falta ${item.steps[k].name}`, "warn");
    speak(`Atenção, falta ${item.steps[k].name}`);
    navigator.vibrate?.([120, 80, 120]);
    return afterChange(item);
  }

  // já tinha sido posto → ignora
  if (item.steps.some((s) => nkey(s.name) === L)) return;

  // não leva isto!
  visionMsg(`✖ ${item.name} NÃO leva ${label}`, "err");
  speak(`Atenção! Não leva ${label}`);
  navigator.vibrate?.([250, 100, 250]);
  beep(220, 0.3);
}

/* ---------- treino ---------- */
let ci = 0;              // classe escolhida
let recording = false;
let clearArmed = 0;

const trainClasses = () => [NADA, ...allIngredients().filter((x) => nkey(x) !== nkey(NADA))];

function renderTrain() {
  const cls = trainClasses();
  ci = Math.min(ci, cls.length - 1);
  $("#trainInfo").textContent = Visao.ready
    ? (recording ? "● a gravar…" : `${Visao.labels().length} treinadas`)
    : "A carregar modelo…";

  classesEl.innerHTML = cls
    .map((c, i) => {
      const n = Visao.count(c);
      const cls2 = ["cls", i === ci && "focused", recording && i === ci && "rec", n >= 30 && "ok"].filter(Boolean).join(" ");
      return `<li><button type="button" class="${cls2}" data-i="${i}"><span>${esc(c)}${c === NADA ? " <small>(nada a acontecer)</small>" : ""}</span><b>${n}</b></button></li>`;
    })
    .join("");
  classesEl.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      const i = +b.dataset.i;
      if (i !== ci && recording) toggleRec();
      ci = i;
      toggleRec();
    })
  );
  classesEl.querySelectorAll(".cls")[ci]?.scrollIntoView({ block: "nearest" });
}

function toggleRec() {
  if (!Visao.ready) return;
  recording = !recording;
  Visao.record(video, trainClasses()[ci], recording, renderTrain);
  if (!recording) beep(440, 0.08);
  renderTrain();
}

function stopRec() {
  if (recording) toggleRec();
}

function clearClass() {
  const btn = $("#clearBtn");
  if (Date.now() < clearArmed) {
    Visao.clear(trainClasses()[ci]);
    clearArmed = 0;
    btn.textContent = "Apagar";
    renderTrain();
  } else {
    clearArmed = Date.now() + 3000;
    btn.textContent = "Outra vez p/ apagar";
    setTimeout(() => { if (Date.now() >= clearArmed) btn.textContent = "Apagar"; }, 3100);
  }
}

function openTrain() {
  show(trainView);
  renderTrain();
  Visao.init().then(renderTrain).catch(() => ($("#trainInfo").textContent = "Modelo não carregou"));
}

$("#trainBtn").addEventListener("click", openTrain);
$("#clearBtn").addEventListener("click", clearClass);
$("#exportBtn").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([Visao.exportJSON()], { type: "application/json" }));
  a.download = "modelo.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("#importFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    Visao.importJSON(await f.text());
    $("#trainInfo").textContent = "Importado ✓";
  } catch {
    $("#trainInfo").textContent = "Ficheiro inválido";
  }
  e.target.value = "";
  setTimeout(renderTrain, 1200);
});

/* ---------- som e voz ---------- */
let audio;
function beep(freq, dur) {
  if (!soundOn) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.15, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + dur);
  } catch {}
}

function speak(text) {
  if (!soundOn || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-PT";
  u.rate = 1.05;
  speechSynthesis.speak(u);
}

function speakOrder() {
  const o = orders[oi];
  const parts = o.items.map((i) => {
    const mods = i.mods?.length ? `, ${i.mods.join(", ")}` : "";
    return `${i.qty ?? 1} ${i.name}${mods}`;
  });
  speak(`${o.id ? "Pedido " + o.id + ". " : ""}${parts.join(". ")}`);
}

/* ---------- navegação (teclado / gestos dos óculos) ---------- */
document.addEventListener("keydown", (e) => {
  const view = [scanView, orderView, trainView].find((v) => v.classList.contains("active"));
  let keys = {};

  if (view === scanView) {
    keys = {
      Enter: () => lastFound.length && lock(lastFound, lastSig),
      t: openTrain,
      T: openTrain,
    };
  } else if (view === orderView) {
    const n = orders[oi].items.length;
    keys = {
      ArrowDown: () => { fi = Math.min(fi + 1, n - 1); lastFired = null; render(); },
      ArrowUp: () => { fi = Math.max(fi - 1, 0); lastFired = null; render(); },
      Enter: markNext,
      " ": markNext,
      Backspace: undoStep,
      ArrowRight: () => switchOrder(1),
      ArrowLeft: () => switchOrder(-1),
      Escape: back,
    };
  } else if (view === trainView) {
    const n = trainClasses().length;
    keys = {
      ArrowDown: () => { stopRec(); ci = Math.min(ci + 1, n - 1); renderTrain(); },
      ArrowUp: () => { stopRec(); ci = Math.max(ci - 1, 0); renderTrain(); },
      Enter: toggleRec,
      " ": toggleRec,
      Delete: clearClass,
      Backspace: clearClass,
      Escape: back,
    };
  }

  if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
});

function switchOrder(dir) {
  const next = oi + dir;
  if (next < 0 || next >= orders.length) return;
  oi = next;
  fi = 0;
  lastFired = null;
  render();
  speakOrder();
}

function back() {
  stopRec();
  speechSynthesis?.cancel();
  history = [];
  prevFrame = null;
  previewEl.innerHTML = "";
  show(scanView);
}

/* ---------- util ---------- */
function show(view) {
  for (const v of [scanView, orderView, trainView]) v.classList.toggle("active", v === view);
  // o vídeo muda para o ecrã ativo; no pedido fica escondido (só para a câmara ver)
  const slot = view.querySelector("[data-slot]");
  if (slot) {
    slot.prepend(video);
    video.classList.remove("parked");
  } else {
    document.body.appendChild(video);
    video.classList.add("parked");
  }
  video.play?.().catch(() => {});
}

function setStatus(text, type = "") {
  statusEl.textContent = text;
  statusEl.className = type;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

soundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  store.set("sound", soundOn ? "1" : "0");
  soundBtn.classList.toggle("off", !soundOn);
  if (!soundOn) speechSynthesis?.cancel();
});

show(scanView);
startCamera();
scanLoop();
visionLoop();
