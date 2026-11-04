const $ = (s) => document.querySelector(s);

const video = $("#camera");
const statusEl = $("#status");
const captureBtn = $("#capture");
const soundBtn = $("#sound");
const scanView = $("#scan");
const orderView = $("#order");
const itemsEl = $("#items");

let orders = [];   // [{ id, items: [{ qty, name, mods, done }] }]
let oi = 0;        // pedido atual
let fi = 0;        // item focado
let busy = false;

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
    setStatus("Aponta para o ecrã e carrega em Ler.");
  } catch {
    setStatus("Sem acesso à câmara. Dá permissão e recarrega.", "err");
  }
}

/* Foto tratada para o OCR: cinzento, mais contraste, texto escuro em fundo claro */
function snapshot() {
  const w = video.videoWidth, h = video.videoHeight;
  const scale = Math.min(2, 2000 / Math.max(w, h)); // aumenta imagens pequenas
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, c.width, c.height);

  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    sum += g;
  }
  const mean = sum / (d.length / 4);
  const invert = mean < 110; // ecrã escuro com letras claras → inverte
  for (let i = 0; i < d.length; i += 4) {
    let g = d[i];
    if (invert) g = 255 - g;
    g = (g - 128) * 1.6 + 128; // contraste
    g = Math.max(0, Math.min(255, g));
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ---------- OCR grátis no próprio browser (Tesseract) ---------- */
let workerPromise = null;
function getWorker() {
  // carrega uma vez só e fica pronto para as próximas leituras
  workerPromise ??= Tesseract.createWorker("por");
  return workerPromise;
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

/* ---------- ler o ecrã ---------- */
async function readScreen() {
  if (busy) return;
  if (!video.videoWidth) return setStatus("A câmara ainda não está pronta.", "err");

  busy = true;
  captureBtn.disabled = true;
  scanView.classList.add("busy");
  setStatus("A ler…", "busy");

  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(snapshot());

    orders = parseOrders(data.text).map((o) => ({
      ...o,
      items: o.items.map((i) => ({ ...i, done: false })),
    }));

    if (!orders.length) {
      setStatus("Não vi nenhum pedido. Aproxima-te do ecrã.", "err");
      speak("Não vi nenhum pedido");
      return;
    }

    oi = 0;
    fi = 0;
    show(orderView);
    render();
    speakOrder();
    setStatus("Aponta para o ecrã e carrega em Ler.");
  } catch (e) {
    setStatus(e.message || "Erro ao ler.", "err");
  } finally {
    busy = false;
    captureBtn.disabled = false;
    scanView.classList.remove("busy");
  }
}

/* ---------- desenhar ---------- */
function render() {
  const order = orders[oi];
  const total = order.items.length;
  const done = order.items.filter((i) => i.done).length;

  $("#orderTitle").textContent = order.id ? `Pedido ${order.id}` : "Pedido";
  $("#orderNav").textContent = orders.length > 1 ? `${oi + 1} de ${orders.length} pedidos` : "";
  $("#progress").textContent = `${done}/${total}`;
  $("#barFill").style.width = `${(done / total) * 100}%`;

  itemsEl.innerHTML = "";
  order.items.forEach((item, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "item" + (item.done ? " done" : "") + (i === fi ? " focused" : "");
    btn.innerHTML = `
      <span class="qty">${item.done ? "✓" : esc(item.qty ?? 1)}</span>
      <span class="txt">
        <div class="name">${esc(item.name)}</div>
        ${item.mods?.length ? `<div class="mods">${item.mods.map(esc).join(" · ")}</div>` : ""}
      </span>`;
    btn.addEventListener("click", () => { fi = i; toggle(); });
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

function toggle() {
  const items = orders[oi].items;
  items[fi].done = !items[fi].done;

  if (items[fi].done) {
    // salta para o próximo item por marcar
    const next = items.findIndex((it, i) => i > fi && !it.done);
    if (next !== -1) fi = next;
    if (items.every((it) => it.done)) {
      speak("Pedido completo");
      navigator.vibrate?.(200);
    }
  }
  render();
}

/* ---------- voz ---------- */
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
  if (scanView.classList.contains("active")) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); readScreen(); }
    return;
  }

  const n = orders[oi].items.length;
  const keys = {
    ArrowDown: () => { fi = Math.min(fi + 1, n - 1); render(); },
    ArrowUp: () => { fi = Math.max(fi - 1, 0); render(); },
    Enter: () => toggle(),
    " ": () => toggle(),
    ArrowRight: () => switchOrder(1),
    ArrowLeft: () => switchOrder(-1),
    Escape: () => back(),
    Backspace: () => back(),
  };
  if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
});

function switchOrder(dir) {
  const next = oi + dir;
  if (next < 0 || next >= orders.length) return;
  oi = next;
  fi = 0;
  render();
  speakOrder();
}

function back() {
  speechSynthesis?.cancel();
  show(scanView);
  captureBtn.focus();
}

/* ---------- util ---------- */
function show(view) {
  scanView.classList.toggle("active", view === scanView);
  orderView.classList.toggle("active", view === orderView);
}

function setStatus(text, type = "") {
  statusEl.textContent = text;
  statusEl.className = type;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

captureBtn.addEventListener("click", readScreen);
video.addEventListener("click", readScreen);
soundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  store.set("sound", soundOn ? "1" : "0");
  soundBtn.classList.toggle("off", !soundOn);
  if (!soundOn) speechSynthesis?.cancel();
});

startCamera();
getWorker().catch(() => setStatus("Erro a carregar o leitor de texto.", "err")); // pré-carrega
captureBtn.focus();
