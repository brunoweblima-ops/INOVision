# pedidos-glasses

Web app para óculos Meta:

1. **Lê o pedido sozinha.** Apontas para o ecrã de pedidos e ela vai corrigindo a leitura até ficar estável.
2. **Vê quem está a fazer o hambúrguer.** Se o pedido diz `sem pickles` e a câmara vê pickles a entrar, dispara logo um **ALARME** a ecrã inteiro, com bip, vibração e voz. Os outros ingredientes da receita vão sendo confirmados pelo caminho.

100% grátis e tudo no browser: o texto é lido com Tesseract.js e a imagem é reconhecida com TensorFlow.js. Não tem servidor nem chaves de API.

## Ficheiros

```
index.html
style.css
app.js        ← leitura automática do pedido, checklist, navegação
visao.js      ← reconhecimento de ingredientes (treinado por ti)
receitas.js   ← o que leva cada produto  ← EDITA ESTE
modelo.json   ← (opcional) o teu treino exportado
README.md
```

## Publicar

1. Faz upload dos ficheiros para um repo no GitHub.
2. No Vercel, faz **Add New → Project**, escolhe o repo e carrega em **Deploy**.
3. Abre o link `https://<projeto>.vercel.app`.

## 1. Receitas

Abre o `receitas.js` e escreve os produtos com os nomes que aparecem no ecrã, e os ingredientes pela ordem de montagem. Os ingredientes passam a ser automaticamente as coisas que a câmara aprende.

As alterações do pedido ajustam a receita: `sem cebola` tira a cebola e `+ bacon` acrescenta bacon (se o bacon existir noutra receita).

**`sem X` funciona mesmo sem receita.** Basta o X estar treinado: se a câmara o vir, dispara o alarme.

## 2. Treinar a câmara

No ecrã inicial, carrega em **🧠** (ou na tecla **T**).

1. Escolhe a classe com ↑↓ e carrega em **Enter** para começar a gravar. Enter outra vez para parar. Grava cerca de 4 imagens por segundo.
2. Grava **com os óculos postos, a olhar como vais olhar a sério**, enquanto o colega mete aquele ingrediente: a mão com os pickles por cima do pão, a carne a cair, o molho a sair. Muda um pouco de ângulo enquanto gravas.
3. Junta **30 a 80 imagens** por classe. O número fica verde aos 30.
4. **Treina sempre o "Nada"**: a bancada parada, sem estares a meter nada. É isto que evita falsos alarmes.

O treino fica guardado no browser. Para o usares noutro aparelho, carrega em **Exportar** e põe o `modelo.json` no GitHub, ao lado do `index.html`. A app carrega-o sozinha quando o aparelho ainda não tem treino.

## Controlos

| Ecrã | Tecla | Ação |
|---|---|---|
| Inicial | (automático) | lê o pedido quando seguras quieto 2–3 s |
| Inicial | Enter | abre já o que está a ser lido |
| Inicial | T / 🧠 | treinar |
| Pedido | ↑ ↓ | mudar de produto |
| Pedido | Enter | marcar o próximo passo à mão |
| Pedido | Backspace | desfazer o último passo (se a câmara se enganou) |
| Pedido | ← → | pedido seguinte/anterior |
| Pedido | Esc | voltar (ou volta sozinho quando o pedido fica completo) |
| Treinar | ↑ ↓ / Enter | escolher / gravar e parar |
| Treinar | Del | apagar classe (carrega 2×) |

## Afinar

No `app.js`, na secção "visão":

- `ALERTA_CONF` (0.55) e `ALERTA_FRAMES` (2): sensibilidade do alarme. Sobe para ter menos falsos alarmes, desce para ficar mais rápido.
- `PASSO_CONF` (0.7) e `PASSO_FRAMES` (3): o mesmo, mas para confirmar os passos normais.
- `ORDEM_RIGOROSA` (false): põe `true` para avisar quando a ordem de montagem não bate certo.

## Limites

- Reconhece bem coisas que se distinguem visualmente (carne, queijo, alface, ketchup vs. mostarda). Coisas pequenas e parecidas, como pickles e cebola picada, precisam de muito treino e mesmo assim podem falhar.
- Funciona melhor no mesmo sítio e com a mesma luz em que treinaste.
