# Documentação Técnica — Editor de Texto com Paginação

## 1. Visão Geral do Projeto

Editor WYSIWYG (What You See Is What You Get) baseado em TipTap v3, que simula visualmente páginas A4 em tempo real no navegador. O conteúdo é distribuído automaticamente entre páginas conforme o usuário digita, e o botão "Imprimir / PDF" gera um PDF com as mesmas quebras de página exibidas na tela.

**Stack:** Next.js 16 + React 19 + TypeScript + TailwindCSS v4
**Repositório:** `/home/magno/repos/personal/editor`

---

## 2. Estrutura de Arquivos

```
editor/
├── app/
│   ├── layout.tsx              ← Root layout (HTML, fonte Inter, metadata)
│   ├── page.tsx                ← Página principal (monta <PagedEditor>)
│   └── global.css              ← Estilos globais + variáveis Tailwind
├── components/
│   ├── tiptap/
│   │   ├── paged-editor.tsx    ← Componente principal do editor (único componente relevante)
│   │   └── paged-editor.css    ← Estilos de tela + @media print
│   └── ui/
│       └── button.tsx          ← Componente Button (shadcn/ui com CVA)
├── lib/
│   └── utils.ts                ← Função utilitária cn() para Tailwind
├── node_modules/
│   └── tiptap-pagination-plus/ ← Extensão de paginação (lógica crítica)
│       └── dist/
│           ├── PaginationPlus.js
│           ├── utils.js
│           └── constants.js
├── package.json
└── tsconfig.json
```

---

## 3. Dependências Principais

| Pacote | Versão | Papel |
|---|---|---|
| `next` | 16.0.10 | Framework React com SSR/App Router |
| `react` / `react-dom` | 19.2.0 | Biblioteca UI |
| `@tiptap/react` | ^3.20.0 | Bindings React para TipTap |
| `@tiptap/starter-kit` | ^3.20.0 | Extensões base (bold, italic, history, etc.) |
| `@tiptap/pm` | ^3.20.0 | ProseMirror — motor de edição estruturada |
| `@tiptap/extension-placeholder` | ^3.20.0 | Placeholder quando editor está vazio |
| `tiptap-pagination-plus` | ^3.0.5 | Paginação automática A4 com floats |
| `tailwindcss` | ^4.1.9 | CSS utilitário |
| `lucide-react` | ^0.454.0 | Ícone `<Printer>` na toolbar |
| `class-variance-authority` | ^0.7.1 | Variantes do componente Button |

---

## 4. Camada de Aplicação

### `app/layout.tsx`
Root layout padrão Next.js App Router. Define `<html lang="pt-BR">`, aplica fonte **Inter** (Google Fonts) e importa `global.css`. Exporta metadata com title "Editor de Texto".

### `app/page.tsx`
Página raiz. Renderiza apenas `<PagedEditor>` dentro de um `<main>` com classes Tailwind `min-h-screen bg-muted py-8`.

### `global.css`
Importa Tailwind v4 via `@import "tailwindcss"`. Define variáveis CSS de tema (cores, raio de borda, sombras) usadas pelos componentes shadcn/ui. **Não afeta diretamente o editor.**

---

## 5. Componente Principal: `PagedEditor`

**Arquivo:** `components/tiptap/paged-editor.tsx`
**Tipo:** React Client Component (`"use client"`)

### 5.1 Configuração A4 (`A4_CONFIG`)

```ts
const A4_CONFIG = {
  ...PAGE_SIZES.A4,         // pageHeight:1123, pageWidth:794, marginTop:95,
                            // marginBottom:95, marginLeft:76, marginRight:76
  pageGap: 40,              // Espaço visual entre páginas (px)
  footerRight: "Página {page}",  // Token substituído pelo número da página
  footerLeft: "",
  headerRight: "",
  headerLeft: "",
  customHeader: {},
  customFooter: {},
}
```

Todos os valores são em **pixels CSS (96dpi)**. Correspondências físicas aproximadas:
- `pageHeight: 1123px` ≈ 297mm (A4)
- `pageWidth: 794px` ≈ 210mm (A4)
- `marginTop/Bottom: 95px` ≈ 25mm
- `marginLeft/Right: 76px` ≈ 20mm

### 5.2 Estado e Hooks React

```ts
const [pageCount, setPageCount] = useState(1)
```
Único estado: contador de páginas exibido na toolbar ("N páginas").

```ts
const editor = useEditor({ ... })
```
Hook principal do TipTap. Configurado com:
- `immediatelyRender: false` — evita hydration mismatch SSR/cliente
- Extensions: `StarterKit`, `Placeholder`, `PaginationPlus.configure(A4_CONFIG)`
- `editorProps.attributes.class: "paged-editor-prosemirror"` — aplica classe CSS ao elemento `.tiptap`
- `content: ""` — inicia vazio

### 5.3 Contagem de Páginas (`updatePageCount`)

```ts
const updatePageCount = useCallback(() => {
  const paginationEl = editor.view.dom.querySelector("[data-rm-pagination]")
  const count = paginationEl ? paginationEl.children.length : 1
  setPageCount(Math.max(1, count))
}, [editor])
```

Lê o número de filhos de `[data-rm-pagination]` (= número de `.rm-page-break` elements criados pela extensão = número de páginas). Registrado nos eventos `update` e `transaction` do editor via `requestAnimationFrame` para atualizar após o DOM ser recalculado.

### 5.4 Handlers de Impressão por Evento (`beforeprint` / `afterprint`)

Registrados via `useEffect` para tratar **Ctrl+P** ou impressão do sistema (sem passar pelo botão):

- **`handleBeforePrint`**: Salva os inline styles da extensão em `data-*` attributes no `.tiptap`, então limpa `minHeight`, `border`, `width`, `paddingLeft`, `paddingRight`, `boxShadow`. Garante que o layout não fique "preso" em 794px no print.
- **`handleAfterPrint`**: Restaura todos os inline styles a partir dos `data-*` attributes e os remove.

> **Limitação:** estes handlers NÃO inserem marcadores de quebra de página — servem apenas para limpar estilos. O resultado do Ctrl+P pode ter paginação diferente do botão.

### 5.5 Função Principal de Impressão (`handlePrint`)

Executada ao clicar no botão "Imprimir / PDF". Implementa um **algoritmo de simulação de layout** em 5 fases:

---

#### Fase A — Capturar estado inicial
```ts
const computedStyle = window.getComputedStyle(tiptapEl)
```
Lê CSS vars calculadas pela extensão **antes** de qualquer mudança de estilo. Importante: `computedStyle` é um snapshot ao vivo — os valores de `--rm-page-content-*` refletem o estado atual do documento.

Também localiza dois elementos críticos:
- `paginationEl` = `tiptapEl.querySelector("[data-rm-pagination]")` — container dos floats de paginação
- `firstHeaderEl` = `tiptapEl.querySelector(".rm-first-page-header")` — decoration de 105px no topo da página 1

---

#### Fase B — Aplicar layout equivalente ao print

```ts
paginationEl.style.display = "none"   // Remove os floats do layout
firstHeaderEl.style.display = "none"  // Remove os 105px do header da p1
tiptapEl.style.minHeight = ""         // Remove altura mínima forçada
tiptapEl.style.width = "642px"        // Conteúdo = 794 - 76 - 76 = 642px
tiptapEl.style.paddingLeft = ""       // Remove padding lateral
tiptapEl.style.paddingRight = ""
tiptapEl.getBoundingClientRect()      // Força reflow síncrono
```

A largura de `642px` é idêntica à área de conteúdo no print (`@page margin: 20mm` → 170mm ≈ 643px). Isso garante que o browser use os mesmos quebras de linha que no print.

---

#### Fase C — Calcular `PAGE_HEIGHT` a partir do CSS var

```ts
const PAGE_HEIGHT = parseFloat(
  computedStyle.getPropertyValue("--rm-page-content-general")
) || 887
```

**Por que ler do CSS var?**

A extensão calcula a altura real de conteúdo por página levando em conta o footer ("Página {page}" = ~26px):
```
_pageHeaderHeight = contentMarginTop(10) + marginTop(95) + headerHeight(0) = 105px
_pageFooterHeight = contentMarginBottom(10) + marginBottom(95) + footerHeight(26) = 131px
_pageHeight = 1123 - 105 - 131 = 887px  →  --rm-page-content-general
```

Usar `933` (A4 sem footer) colocaria 2 parágrafos extras em cada página do print em relação à tela.

---

#### Fase D — Iterar filhos e inserir marcadores de quebra

```ts
const tiptapTop = tiptapEl.getBoundingClientRect().top
let pageBottomY = tiptapTop + PAGE_HEIGHT

for (const child of tiptapEl.children) {
  if (child === paginationEl || child === firstHeaderEl) continue

  const childRect = child.getBoundingClientRect()
  if (childRect.bottom > pageBottomY) {
    // Inserir marcador break-before:page ANTES deste filho
    const marker = document.createElement("div")
    marker.dataset.printBreak = "true"
    marker.style.cssText = "break-before:page;page-break-before:always;height:0;overflow:hidden;"
    tiptapEl.insertBefore(marker, child)
    breakMarkers.push(marker)
    pageBottomY = childRect.top + PAGE_HEIGHT  // Próxima página
  }

  child.dataset.debugPrintPage = String(currentPage)  // Debug: cor por página
}
```

**Lógica do algoritmo:**
1. `pageBottomY` começa em `tiptapTop + PAGE_HEIGHT` (y absoluto do fim da página 1 na viewport)
2. Para cada parágrafo `<p>`: se `childRect.bottom > pageBottomY`, o parágrafo transborda a página atual
3. Insere `div[data-print-break]` com `break-before: page` ANTES do parágrafo
4. Reseta `pageBottomY = childRect.top + PAGE_HEIGHT` (nova página começa no topo deste parágrafo)
5. As coordenadas são viewport-relativas — o scroll cancela porque usamos `childRect.top - tiptapTop`

---

#### Fase E — Restaurar e imprimir

```ts
paginationEl.style.display = ""
firstHeaderEl.style.display = ""
Object.assign(tiptapEl.style, saved)  // Restaura todos os inline styles

window.print()  // Síncrono/bloqueante — aguarda fechar o diálogo

breakMarkers.forEach(m => m.remove())  // Limpa marcadores
```

Após restaurar, o `@media print` do CSS sobrescreve os inline styles com `!important`, garantindo que o print use `width: 100%` e `padding: 0`.

---

## 6. Extensão `tiptap-pagination-plus`

### 6.1 Visão Geral

Extensão TipTap que implementa paginação visual via **CSS floats**. Não usa `overflow: hidden` nem `clip` — o conteúdo flui normalmente, e elementos flutuantes criam o visual de "páginas separadas".

### 6.2 Inicialização (`onCreate`)

Ao montar o editor, a extensão modifica o elemento `.tiptap` (= `editor.view.dom`):

```js
targetNode.classList.add("rm-with-pagination")
targetNode.style.border = "1px solid var(--rm-page-gap-border-color)"
targetNode.style.paddingLeft = "var(--rm-margin-left)"    // 76px
targetNode.style.paddingRight = "var(--rm-margin-right)"  // 76px
targetNode.style.width = "var(--rm-page-width)"           // 794px
```

Injeta um `<style>` no `<head>` com regras para `.rm-page-header`, `.rm-page-footer`, `.rm-pagination-gap`, `.rm-page-break`, etc.

### 6.3 Variáveis CSS

Definidas via `updateCssVariables()` como inline styles no `.tiptap`:

| Variável | Valor A4 | Descrição |
|---|---|---|
| `--rm-page-height` | `1123px` | Altura total da página |
| `--rm-page-width` | `794px` | Largura total da página |
| `--rm-margin-top` | `95px` | Margem superior física |
| `--rm-margin-bottom` | `95px` | Margem inferior física |
| `--rm-margin-left` | `76px` | Margem esquerda (padding do editor) |
| `--rm-margin-right` | `76px` | Margem direita (padding do editor) |
| `--rm-content-margin-top` | `10px` | Espaço entre borda da margem e conteúdo |
| `--rm-content-margin-bottom` | `10px` | Espaço entre conteúdo e borda da margem |
| `--rm-page-gap-border-color` | `#e5e5e5` | Cor da borda do gap entre páginas |
| `--rm-page-content-first` | `992px`* | marginTop do float da página 1 |
| `--rm-page-content-general` | `887px`* | Altura de conteúdo por página (pages 2+) |
| `--rm-max-content-child-height` | calculado | Altura máxima de imagens/tabelas |

*Valores com footer "Página {page}" (footerHeight ≈ 26px).

### 6.4 Cálculo de Alturas (`getHeight` em utils.js)

```js
export const getHeight = (pageOptions, _headerHeight, _footerHeight) => {
  const _pageHeaderHeight = pageOptions.contentMarginTop   // 10
                          + pageOptions.marginTop           // 95
                          + _headerHeight                   // 0 (sem custom header)
  // = 105px

  const _pageFooterHeight = pageOptions.contentMarginBottom // 10
                          + pageOptions.marginBottom        // 95
                          + _footerHeight                   // 26 (footer "Página N")
  // = 131px

  const _pageHeight = pageOptions.pageHeight                // 1123
                    - _pageHeaderHeight                     // 105
                    - _pageFooterHeight                     // 131
  // = 887px

  return { _pageHeaderHeight, _pageFooterHeight, _pageHeight }
}
```

### 6.5 Cálculo de Conteúdo de Página (`--rm-page-content-*`)

```js
// Para cada página no loop:
const contentHeight = page === 1
  ? _pageHeight + _pageHeaderHeight   // 887 + 105 = 992  → --rm-page-content-first
  : _pageHeight                       // 887              → --rm-page-content-general
```

O valor `992px` da página 1 inclui o `_pageHeaderHeight` porque o widget `.rm-first-page-header` ocupa esse espaço no topo. O float `.page` da página 1 tem `marginTop: 992px` (medido da raiz de `[data-rm-pagination]`), posicionando-se exatamente após o conteúdo da página 1.

### 6.6 Estrutura DOM Criada pela Extensão

Dentro do `.tiptap` (= `editor.view.dom`), a extensão injeta dois widgets ProseMirror em `position 0, side: -1` (antes de todo conteúdo):

```
.tiptap
├── div#pages[data-rm-pagination].rm-pages-wrapper   ← Widget 1 (pageWidget)
│   └── .rm-page-break  (um por página)
│       ├── .page (float:left; clear:both; marginTop: --rm-page-content-*)
│       └── .breaker (float:left; clear:both; width: calc(100% + 152px))
│           ├── .rm-page-footer  (footer: "Página N")
│           │   └── .rm-page-footer-content
│           │       ├── .rm-page-footer-left
│           │       └── .rm-page-footer-right
│           ├── .rm-pagination-gap  (height: 40px; background: #fff)
│           └── .rm-page-header  (vazio nesta config)
│               └── .rm-page-header-content
├── .rm-first-page-header.rm-page-header   ← Widget 2 (firstHeaderWidget, 105px)
├── <p>Parágrafo 1</p>
├── <p>Parágrafo 2</p>
└── ...
```

**Como os floats criam a paginação visual:**

1. `.page` tem `float: left; clear: both; marginTop: 992px` → posiciona-se verticalmente em y=992 (abaixo do conteúdo da página 1)
2. `.breaker` tem `float: left; clear: both; width: calc(100% + 152px)` → é mais largo que o container (incluindo os paddings), funcionando como um clearfix que "empurra" o conteúdo abaixo
3. O conteúdo abaixo de `.breaker` (parágrafos da página 2) flui após o `.breaker`, que visualmente aparece como o "espaço entre páginas"
4. `refreshPage()` seta `minHeight = lastPageBreak.offsetTop + lastPageBreak.offsetHeight + 2px` para garantir que o container tenha altura suficiente

### 6.7 Cálculo de Número de Páginas (`calculatePageCount`)

```js
const lastElementRect = lastElementOfEditor.getBoundingClientRect()
const lastPageBreakRect = lastPageBreak.getBoundingClientRect()
const lastPageGap = lastElementRect.bottom - lastPageBreakRect.bottom

if (lastPageGap > 0) {
  // Conteúdo transborda → adicionar páginas
  return currentPageCount + Math.ceil(lastPageGap / pageContentAreaHeight)
} else if (lastPageGap < -10 && lastPageGap > -(pageHeight - 10)) {
  // Dentro da tolerância → manter count
  return currentPageCount
} else if (lastPageGap < -(pageHeight - 10)) {
  // Muito espaço vazio → remover páginas
  return currentPageCount + Math.floor(lastPageGap / (pageHeight + pageGap))
}
```

Compara o bottom do último elemento filho do editor com o bottom do último `.breaker` float. Se o conteúdo passa além, calcula quantas páginas extras são necessárias.

---

## 7. CSS e Estilos (`paged-editor.css`)

### 7.1 Variáveis de Tela (`:root`)

```css
:root {
  --paged-page-width: 794px;
  --paged-page-height: 1123px;
  --paged-page-margin: 96px;
  --paged-page-gap: 40px;
}
```

Usadas apenas para referência — a extensão define suas próprias via JS.

### 7.2 Layout Principal

- `.paged-editor` — container geral (`min-height: 100vh; background: #f8f9fa`)
- `.paged-editor-toolbar` — toolbar fixa no topo (`position: fixed; z-index: 50`)
- `.paged-editor-document` — área de conteúdo com `padding-top: 80px` (compensa toolbar)
- `.paged-editor-wrapper` — wrapper do EditorContent (`display: block` — crítico para não quebrar floats internos)
- `.paged-editor-wrapper > div` — centraliza o editor (`margin: 0 auto`)
- `.paged-editor-wrapper .tiptap` — o `.tiptap` recebe `background: white; box-shadow` (sem width — controlada pela extensão)

### 7.3 Debug Visual (temporary)

```css
[data-debug-print-page="1"] { outline: 3px solid #3b82f6 !important; }  /* azul */
[data-debug-print-page="2"] { outline: 3px solid #f97316 !important; }  /* laranja */
[data-debug-print-page="3"] { outline: 3px solid #22c55e !important; }  /* verde */
[data-debug-print-page="4"] { outline: 3px solid #a855f7 !important; }  /* roxo */
```

Atributos `data-debug-print-page` são setados por `handlePrint()` após calcular em qual página cada parágrafo cairá. Visíveis na tela após fechar o diálogo, úteis para comparar com a paginação visual da extensão.

### 7.4 `@media print`

```css
@page {
  size: A4 portrait;
  margin: 31mm 20mm;  /* → ~889px altura conteúdo ≈ 887px da extensão */
}
```

**Por que 31mm e não 25mm?** A extensão usa 887px por página (footer consome 36px extras). Com 25mm = 95px por margem → 1123-190=933px por página → 46px de espaço em branco ao final. Com 31mm ≈ 117px → 1123-234=889px → quase idêntico aos 887px da extensão.

**Elementos ocultados no print:**
```css
.paged-editor-toolbar,
[data-rm-pagination],       /* float container */
.rm-first-page-header,      /* decoration 105px */
.rm-page-break,             /* redundante (já ocultado via pai) */
.rm-page-footer, .rm-page-footer-left, .rm-page-footer-right,
.rm-page-header, .rm-page-header-left, .rm-page-header-right,
.rm-br-decoration           /* decorations de <br> */
```

**Reset de backgrounds:**
```css
html, body, main {
  background: white !important;
  margin: 0 !important;
}
```
O `main` é crítico — sem ele, `bg-muted` do Tailwind (cinza) aparece como barra no PDF.

**`.tiptap` no print:**
```css
.paged-editor-wrapper .tiptap {
  box-sizing: border-box !important;
  width: 100% !important;      /* ≈ 643px na folha A4 */
  padding: 0 !important;       /* extensão controlava, agora @page margin controla */
  min-height: 0 !important;
}
```

---

## 8. Fluxo Completo: Edição → Paginação → Print

```
Usuário digita
     ↓
ProseMirror atualiza o document model
     ↓
Plugin de paginação (apply) → calculatePageCount()
     ├── Se count mudou → dispara transaction com meta PAGE_COUNT_META_KEY
     │        ↓
     │   apply() → createDecoration() → reconstrói [data-rm-pagination]
     │        ↓
     │   refreshPage() → atualiza minHeight do .tiptap
     └── Se count igual → atualiza CSS vars (--rm-page-content-general, etc.)
                      → refreshPage()
     ↓
DOM atualizado → visual de páginas separadas na tela
     ↓
React (scheduleUpdate via requestAnimationFrame)
     ↓
updatePageCount() → lê paginationEl.children.length → setPageCount()
     ↓
Toolbar exibe "N páginas"
```

```
Usuário clica "Imprimir / PDF"
     ↓
handlePrint()
     ↓
[A] Captura computedStyle (--rm-page-content-general = 887px)
     ↓
[B] Oculta paginationEl + firstHeaderEl
    Aplica width:642px, sem padding, sem minHeight
    Força reflow via getBoundingClientRect()
     ↓
[C] PAGE_HEIGHT = 887px (do CSS var)
    Itera filhos do .tiptap em ordem DOM
    Para cada <p>: se bottom > pageBottomY → insere <div break-before:page>
     ↓
[D] Restaura todos os inline styles da extensão
     ↓
window.print()  →  @media print aplica
                    [data-rm-pagination] { display:none }
                    .tiptap { width:100%, padding:0 }
                    div[data-print-break] → forçam quebra de página
     ↓
Usuário vê PDF com mesmas quebras de página da tela
     ↓
Remove breakMarkers do DOM
```

---

## 9. Componente `Button` (shadcn/ui)

**Arquivo:** `components/ui/button.tsx`

Baseado em **CVA (class-variance-authority)** e **Radix UI Slot**. Variantes:

| variant | Aparência |
|---|---|
| `default` | bg-primary text-primary-foreground |
| `destructive` | bg-destructive |
| `outline` | border border-input bg-background |
| `secondary` | bg-secondary |
| `ghost` | hover:bg-accent |
| `link` | underline |

Tamanhos: `default`, `sm`, `lg`, `icon`. Aceita `asChild` para renderizar como outro elemento via Slot.

No `PagedEditor` é usado com `variant` default, `size="sm"`, e classes adicionais `bg-blue-600 hover:bg-blue-700 text-white`.

---

## 10. Pontos de Atenção / Trade-offs

### Dependência de CSS vars em runtime
`handlePrint()` lê `--rm-page-content-general` via `getComputedStyle()` **antes** de mudar qualquer estilo. Se a extensão não tiver calculado esses valores ainda (ex: em SSR ou render inicial), o fallback é `887`. Isso é seguro porque `getComputedStyle()` é síncrono e a extensão seta as vars em `onCreate()` + view updates.

### `window.print()` é síncrono/bloqueante
No Chrome, `window.print()` abre o diálogo e só retorna quando o usuário fecha. Isso permite o padrão: (1) preparar DOM, (2) print, (3) limpar DOM — tudo em sequência síncrona.

### Ctrl+P vs Botão
`beforeprint`/`afterprint` limpam inline styles mas NÃO inserem marcadores de quebra. O Ctrl+P produzirá paginação diferente do botão. Para consistência total, seria necessário chamar a lógica de `handlePrint` dentro do `beforeprint` também.

### Largura de 642px
A equação `794px - 76px - 76px = 642px` é a área de conteúdo da extensão. No print, `@page margin: 20mm` dá `170mm ≈ 643px`. A diferença de 1px é imperceptível para quebras de linha em texto normal.

### Footer dinâmico afeta `PAGE_HEIGHT`
Se o footer for removido (`footerRight: ""`), `_pageFooterHeight = 105px` (sem os 26px do texto), `_pageHeight = 913px`. O JS leria `--rm-page-content-general = 913px` e se ajustaria automaticamente. O `@page margin: 31mm` ficaria ligeiramente errado (28px a mais), mas não causaria problemas visuais significativos.
