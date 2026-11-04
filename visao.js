// =====================================================================
//  VISÃO — reconhece o que estás a fazer (carne, molho, alface…)
//
//  Grátis e 100% no browser: MobileNet (TensorFlow.js) transforma cada
//  imagem num "resumo" de números e um classificador k-NN compara-o com
//  os exemplos que gravaste no ecrã "Treinar".
//
//  Os exemplos ficam guardados no próprio browser. Para os passar para
//  outro aparelho, usa "Exportar" e põe o modelo.json no GitHub (ao lado
//  do index.html): a app carrega-o sozinha quando não tem treino local.
// =====================================================================

const Visao = (() => {
  const MODEL_URL =
    "https://storage.googleapis.com/teachable-machine-models/mobilenet_v2_weights_tf_dim_ordering_tf_kernels_0.35_224_no_top/model.json";
  const MAX_PER_CLASS = 80;   // exemplos por classe
  const K = 7;                // vizinhos a consultar
  const STORE_KEY = "visao-v1";

  let model = null;           // MobileNet cortado (imagem → 1280 números)
  let loading = null;
  const data = {};            // { classe: [Int8Array, ...] }
  let mem = null;             // cache: { labels: [], vecs: [Float32Array] }

  /* ---------- modelo ---------- */
  function load() {
    loading ??= (async () => {
      const mobilenet = await tf.loadLayersModel(MODEL_URL);
      const layer = mobilenet.getLayer("out_relu");
      const truncated = tf.model({ inputs: mobilenet.inputs, outputs: layer.output });
      model = tf.sequential();
      model.add(truncated);
      model.add(tf.layers.globalAveragePooling2d({}));
      tf.tidy(() => model.predict(tf.zeros([1, 224, 224, 3]))); // aquece
      return model;
    })();
    return loading;
  }

  // imagem da câmara → vetor normalizado (Float32Array de 1280)
  function embed(video) {
    return tf.tidy(() => {
      const px = tf.browser.fromPixels(video);
      const [h, w] = px.shape;
      const s = Math.min(h, w); // quadrado central
      const crop = px.slice([Math.floor((h - s) / 2), Math.floor((w - s) / 2), 0], [s, s, 3]);
      const img = tf.image.resizeBilinear(crop, [224, 224]).toFloat().div(127).sub(1).expandDims(0);
      const v = model.predict(img).squeeze();
      return v.div(v.norm().add(1e-6));
    }).dataSync();
  }

  /* ---------- guardar (int8 para caber no browser) ---------- */
  const toI8 = (f) => {
    const q = new Int8Array(f.length);
    for (let i = 0; i < f.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(f[i] * 127 * 4)));
    return q;
  };
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
  const unb64 = (s) => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

  function serialize() {
    const out = { v: 1, classes: {} };
    for (const [k, arr] of Object.entries(data)) out.classes[k] = arr.map((q) => b64(new Uint8Array(q.buffer)));
    return out;
  }

  function deserialize(json) {
    if (!json || !json.classes) throw new Error("Ficheiro inválido");
    for (const k of Object.keys(data)) delete data[k];
    for (const [k, arr] of Object.entries(json.classes)) data[k] = arr.map((s) => new Int8Array(unb64(s).buffer));
    mem = null;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(serialize())); return true; }
    catch { return false; } // cheio ou bloqueado: continua a funcionar até fechar
  }

  async function restore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return deserialize(JSON.parse(raw));
    } catch {}
    // sem treino local → tenta o modelo.json do repositório
    try {
      const r = await fetch("/modelo.json", { cache: "no-store" });
      if (r.ok) deserialize(await r.json());
    } catch {}
  }

  /* ---------- k-NN ---------- */
  function buildMem() {
    const labels = [], vecs = [];
    for (const [k, arr] of Object.entries(data)) {
      for (const q of arr) {
        const f = new Float32Array(q.length);
        for (let i = 0; i < q.length; i++) f[i] = q[i] / (127 * 4);
        labels.push(k);
        vecs.push(f);
      }
    }
    mem = { labels, vecs };
  }

  function classify(vec) {
    if (!mem) buildMem();
    const n = mem.vecs.length;
    if (!n) return null;
    const sims = new Array(n);
    for (let j = 0; j < n; j++) {
      const f = mem.vecs[j];
      let dot = 0;
      for (let i = 0; i < f.length; i++) dot += f[i] * vec[i];
      sims[j] = [dot, mem.labels[j]];
    }
    sims.sort((a, b) => b[0] - a[0]);
    const k = Math.min(K, n);
    const votes = {};
    for (let i = 0; i < k; i++) votes[sims[i][1]] = (votes[sims[i][1]] || 0) + 1;
    const [label, v] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    return { label, conf: v / k };
  }

  /* ---------- API ---------- */
  let recTimer = null;

  return {
    async init() { await restore(); return load(); },
    get ready() { return !!model; },
    count: (label) => (data[label] || []).length,
    labels: () => Object.keys(data).filter((k) => data[k].length),
    trained() { return this.labels().length >= 2; },

    // grava exemplos enquanto "on" for true (≈4 por segundo)
    record(video, label, on, onTick) {
      clearInterval(recTimer);
      recTimer = null;
      if (!on) { save(); return; }
      recTimer = setInterval(() => {
        if (!model || !video.videoWidth) return;
        const arr = (data[label] ??= []);
        arr.push(toI8(embed(video)));
        if (arr.length > MAX_PER_CLASS) arr.shift();
        mem = null;
        onTick?.(arr.length);
      }, 250);
    },

    clear(label) { delete data[label]; mem = null; save(); },

    predict(video) {
      if (!model || !video.videoWidth) return null;
      return classify(embed(video));
    },

    exportJSON: () => JSON.stringify(serialize()),
    importJSON(text) { deserialize(JSON.parse(text)); save(); },
  };
})();
