# Contexto Técnico da Aplicação: Leitor de QR Code e EAN (Inventário)

## Visão Geral
Este é um aplicativo web focado em dispositivos móveis (Progressive Web App / SPA) construído com Vanilla HTML, CSS e JavaScript (sem frameworks pesados). Seu objetivo principal é ler códigos de barras (EAN-13), QR Codes de Patrimônio e códigos compostos (Modelo + Série) usando a câmera do dispositivo, armazenando e agrupando essas contagens localmente no navegador (`localStorage`), para posterior exportação.

## Regras de Negócio e Parser Inteligente
O sistema agora lida com 4 campos principais: **Patrimônio**, **Modelo**, **Nº Série** e **EAN**.

O "Parser" (Regex) no evento `onScanSuccess` tenta decifrar a string escaneada:
1. `^\d{3}\.\d{2}\.\d{3}$` -> **Patrimônio**.
2. `^\d{13}$` -> **EAN**.
3. `^(CRC[A-Z0-9]{7})([A-Z0-9]{9})(.*)$` -> Fatiamento **Modelo** (Consul) e **Série** (Consul).
4. `^ARC\d+$` -> **Nº Série** (Elgin).
5. `^KVF[A-Z0-9]+$` -> **Modelo** (Elgin).

### Lógica de Quantidade e Agrupamento
- Produtos **COM** Número de Série ou Patrimônio: São considerados *únicos*. Ao salvar, eles **NÃO** somam quantidade com itens já existentes, mesmo que tenham o mesmo Modelo. São inseridos como novas linhas (Quantidade padrão: 1).
- Produtos **SEM** Série/Patrimônio (apenas Modelo ou EAN): O sistema tenta agrupá-los, somando as quantidades se houver correspondência exata, a menos que tenham Observações distintas.

## Tecnologias e Arquitetura
- **`index.html`**: UI focada em mobile, importa o FontAwesome via CDN para ícones e a biblioteca `html5-qrcode` via CDN para acesso à câmera.
- **`style.css`**: Design System usando variáveis nativas (`:root`), paleta azul (`#0056b3`) e branca, layout Flexbox responsivo.
- **`main.js`**:
  - `Html5QrcodeScanner`: Controla o fluxo de vídeo e decodificação (usando a câmera de ambiente/traseira).
  - `AudioContext`: Sintetizador de beeps de sucesso.
  - `localStorage`: Persistência de dados JSON (`inventario_codigos`).
  - Exportação em formato CSV.

## Ambiente de Desenvolvimento
Não é necessário `npm` ou `Node.js`. Basta abrir o `index.html` em um navegador. Para uso no celular e para permitir o acesso à câmera, a aplicação precisa estar hospedada (como Github Pages ou Vercel) ou acessada via um túnel HTTPS local seguro.
