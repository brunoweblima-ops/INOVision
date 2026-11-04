// Vercel Serverless Function: recebe uma foto do ecrã e devolve os pedidos em JSON.
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   ANTHROPIC_API_KEY  (obrigatória)
//   ANTHROPIC_MODEL    (opcional, por defeito claude-haiku-4-5)
//   APP_PIN            (opcional; se definido, a app tem de ser aberta com ?pin=XXXX)

export const config = { maxDuration: 30 };

const PROMPT = `Esta é uma foto de um ecrã de cozinha/balcão com pedidos de clientes.
Lê TODOS os pedidos visíveis e devolve APENAS JSON válido, sem texto à volta, neste formato:

{"orders":[{"id":"123","items":[{"qty":1,"name":"Nome do produto","mods":["sem cebola","+ bacon"]}]}]}

Regras:
- "id" é o número do pedido tal como aparece no ecrã (string). Se não houver, usa "".
- Se um pedido estiver destacado/selecionado/marcado, põe-no em PRIMEIRO lugar.
- "mods" são as alterações por baixo do produto (sem X, extra Y, molho à parte...). Lista vazia se não houver.
- Escreve os nomes exatamente como aparecem, corrigindo só erros óbvios de leitura.
- Ignora horas, totais, preços e botões do ecrã.
- Se não conseguires ler nenhum pedido, devolve {"orders":[]}.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const pin = process.env.APP_PIN;
  if (pin && req.headers["x-pin"] !== pin) {
    return res.status(401).json({ error: "PIN inválido. Abre a app com ?pin=..." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Falta ANTHROPIC_API_KEY no Vercel" });
  }

  const image = req.body?.image;
  const match = typeof image === "string" && image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ error: "Imagem inválida" });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: data?.error?.message || "Erro da IA" });
    }

    const text = (data.content || []).map((c) => c.text || "").join("");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);

    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      return res.status(200).json({ orders: [] });
    }

    // limpar / normalizar
    const orders = (Array.isArray(parsed.orders) ? parsed.orders : []).map((o) => ({
      id: String(o.id ?? ""),
      items: (Array.isArray(o.items) ? o.items : [])
        .filter((i) => i && i.name)
        .map((i) => ({
          qty: Number(i.qty) || 1,
          name: String(i.name),
          mods: Array.isArray(i.mods) ? i.mods.map(String) : [],
        })),
    }));

    return res.status(200).json({ orders });
  } catch (e) {
    return res.status(500).json({ error: "Falha a contactar a IA" });
  }
}
