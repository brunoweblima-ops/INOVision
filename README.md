# pedidos-glasses

Web app para óculos Meta: aponta para o ecrã de pedidos e ele lê sozinho. Vai corrigindo a leitura até ficar estável e depois mostra os pedidos como checklist (e lê-os em voz alta).

100% grátis: o texto é lido no próprio browser com Tesseract.js. Não tem servidor nem chaves de API.

## Ficheiros

```
index.html
style.css
app.js
README.md
```

## Publicar

1. Faz upload destes 4 ficheiros para um repo no GitHub.
2. No Vercel, faz **Add New → Project**, escolhe o repo e carrega em **Deploy**. Não precisas de configurar nada.
3. Abre o link `https://<projeto>.vercel.app` no telemóvel ou nos óculos.

## Controlos

| Ação | Tecla / gesto |
|---|---|
| Ler ecrã | automático (segura quieto 2–3 s) |
| Abrir já o que está a ser lido | Enter |
| Mover entre itens | ↑ ↓ |
| Marcar item | Enter |
| Pedido seguinte/anterior | → ← |
| Voltar à câmara | Esc (ou sozinho quando o pedido fica completo) |
| Som on/off | botão 🔊 |

## Dicas para ler melhor

- Enquadra só o pedido que queres ler e chega-te perto. Quanto menos coisas aparecerem, melhor.
- Evita reflexos no ecrã.
- A primeira leitura é mais lenta porque descarrega o idioma português. As seguintes são mais rápidas.
