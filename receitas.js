// =====================================================================
//  RECEITAS — o que leva cada produto, pela ordem de montagem.
//
//  • A chave (à esquerda) é procurada no nome que aparece no ecrã.
//    Maiúsculas e acentos não interessam. "CHEESE" apanha "CHEESEBURGER DUPLO".
//    Se várias chaves servirem, ganha a mais comprida.
//  • Os ingredientes (à direita) têm de ter EXATAMENTE os mesmos nomes
//    que usas no ecrã "Treinar" — são essas as coisas que a câmara aprende.
//  • Se um ingrediente se repete (ex.: 2 carnes), escreve-o 2 vezes.
//  • Produtos sem receita aparecem na lista para marcar à mão.
//  • "sem X" no pedido = ALARME se a câmara vir X (funciona mesmo sem receita,
//    basta X estar treinado).
//
//  Edita à vontade no GitHub — isto são só exemplos.
// =====================================================================

window.RECEITAS = {
  "HAMBURGUER":        ["Pão", "Carne", "Ketchup", "Mostarda", "Cebola", "Pickles"],
  "CHEESEBURGER":      ["Pão", "Carne", "Queijo", "Ketchup", "Mostarda", "Cebola", "Pickles"],
  "DUPLO":             ["Pão", "Carne", "Queijo", "Carne", "Queijo", "Ketchup", "Mostarda"],
  "FRANGO":            ["Pão", "Frango", "Molho", "Alface"],
  "BACON":             ["Pão", "Carne", "Queijo", "Bacon", "Molho"],
  "ROYAL BACON":       ["Pão", "Carne", "Queijo", "Bacon", "Ketchup", "Mostarda", "Cebola", "Pickles"],

  "SALADA ATUM":       ["Alface", "Tomate", "Atum"],
  "SALADA FETA":       ["Alface", "Tomate", "Queijo"],
  "SALADA MISTA":      ["Alface", "Tomate", "Cebola"],
};

// Classe para "não estou a meter nada" (bancada parada, mãos fora).
// Treina-a sempre: é o que evita falsos alarmes.
window.CLASSE_NADA = "Nada";
