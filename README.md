# pedidos-glasses

Web app para óculos Meta: aponta para o ecrã de pedidos, carrega em **Ler**, e a IA lê os pedidos e mostra-os como checklist (e lê em voz alta).

## Estrutura

```
index.html     ← interface (600x600, feito para os óculos)
style.css
app.js         ← câmara, checklist, navegação, voz
api/read.js    ← função do Vercel que manda a foto à IA (a chave fica no servidor)
package.json
```

## Publicar

1. Cria um repo novo no GitHub (ex.: `pedidos-glasses`) e faz upload destes ficheiros (mantém a pasta `api/`).
2. No [Vercel](https://vercel.com): **Add New → Project** → escolhe o repo → **Deploy** (sem configurar nada, Framework = Other).
3. Em **Settings → Environment Variables** adiciona:
   - `ANTHROPIC_API_KEY` = a tua chave de https://console.anthropic.com
   - `APP_PIN` = um código qualquer (opcional, mas recomendado para ninguém gastar a tua chave)
4. **Deployments → Redeploy** para aplicar as variáveis.
5. Abre nos óculos/telemóvel: `https://<o-teu-projeto>.vercel.app/?pin=<o-teu-pin>` (o PIN fica guardado, só precisas de o pôr uma vez).

## Controlos

| Ação | Tecla / gesto |
|---|---|
| Ler ecrã | Enter, ou tocar no vídeo/botão |
| Mover entre itens | ↑ ↓ |
| Marcar item | Enter |
| Pedido seguinte/anterior | → ← |
| Voltar à câmara | Esc |
| Som on/off | botão 🔊 |

## Notas

- Precisa de HTTPS para a câmara funcionar (o Vercel já dá).
- Para mais precisão, muda o modelo em `ANTHROPIC_MODEL` (ex.: um modelo Sonnet).
