"use client";

import { useState, useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { PaginationPlus, PAGE_SIZES } from "tiptap-pagination-plus";
import { Button } from "../ui/button";
import { Printer } from "lucide-react";
import "./paged-editor.css";

const A4_CONFIG = {
  ...PAGE_SIZES.A4,
  pageGap: 40,
  footerRight: "Página {page}",
  footerLeft: "",
  headerRight: "",
  headerLeft: "",
  customHeader: {},
  customFooter: {},
};

export function PagedEditor() {
  const [pageCount, setPageCount] = useState(1);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Comece a escrever..." }),
      PaginationPlus.configure(A4_CONFIG),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "paged-editor-prosemirror",
      },
    },
  });

  const updatePageCount = useCallback(() => {
    if (!editor?.view?.dom) return;
    const paginationEl = editor.view.dom.querySelector("[data-rm-pagination]");
    const count = paginationEl ? paginationEl.children.length : 1;
    setPageCount(Math.max(1, count));
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const scheduleUpdate = () => requestAnimationFrame(updatePageCount);
    updatePageCount();
    editor.on("update", scheduleUpdate);
    editor.on("transaction", scheduleUpdate);
    return () => {
      editor.off("update", scheduleUpdate);
      editor.off("transaction", scheduleUpdate);
    };
  }, [editor, updatePageCount]);

  useEffect(() => {
    if (!editor) return;

    const handleBeforePrint = () => {
      const tiptapEl = editor.view.dom as HTMLElement;
      tiptapEl.dataset.printMinHeight = tiptapEl.style.minHeight;
      tiptapEl.dataset.printBorder = tiptapEl.style.border;
      tiptapEl.dataset.printWidth = tiptapEl.style.width;
      tiptapEl.dataset.printPaddingLeft = tiptapEl.style.paddingLeft;
      tiptapEl.dataset.printPaddingRight = tiptapEl.style.paddingRight;
      tiptapEl.style.minHeight = "";
      tiptapEl.style.border = "";
      tiptapEl.style.width = "";
      tiptapEl.style.paddingLeft = "";
      tiptapEl.style.paddingRight = "";
      tiptapEl.style.boxShadow = "none";
      tiptapEl.style.background = "white";
    };

    const handleAfterPrint = () => {
      const tiptapEl = editor.view.dom as HTMLElement;
      tiptapEl.style.minHeight = tiptapEl.dataset.printMinHeight ?? "";
      tiptapEl.style.border = tiptapEl.dataset.printBorder ?? "";
      tiptapEl.style.width = tiptapEl.dataset.printWidth ?? "";
      tiptapEl.style.paddingLeft = tiptapEl.dataset.printPaddingLeft ?? "";
      tiptapEl.style.paddingRight = tiptapEl.dataset.printPaddingRight ?? "";
      tiptapEl.style.boxShadow = "";
      tiptapEl.style.background = "";
      delete tiptapEl.dataset.printMinHeight;
      delete tiptapEl.dataset.printBorder;
      delete tiptapEl.dataset.printWidth;
      delete tiptapEl.dataset.printPaddingLeft;
      delete tiptapEl.dataset.printPaddingRight;
    };

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [editor]);

  const handlePrint = () => {
    const tiptapEl = editor.view.dom as HTMLElement;
    const breakMarkers: HTMLElement[] = [];

    // Limpar coloração de debug anterior
    tiptapEl.querySelectorAll("[data-debug-print-page]").forEach((el) => {
      (el as HTMLElement).removeAttribute("data-debug-print-page");
    });

    // --- [A] Log antes de qualquer mudança ---
    const computedStyle = window.getComputedStyle(tiptapEl);
    console.group("🖨️ PRINT DEBUG");
    console.group("[A] Estado inicial do tiptapEl");
    console.log(`offsetWidth=${tiptapEl.offsetWidth}px  clientWidth=${tiptapEl.clientWidth}px`);
    console.log(`inline width="${tiptapEl.style.width}"  paddingLeft="${tiptapEl.style.paddingLeft}"  paddingRight="${tiptapEl.style.paddingRight}"  minHeight="${tiptapEl.style.minHeight}"`);
    console.log(`CSS var --rm-page-content-first="${computedStyle.getPropertyValue("--rm-page-content-first").trim()}"`);
    console.log(`CSS var --rm-page-content-general="${computedStyle.getPropertyValue("--rm-page-content-general").trim()}"`);
    const paginationEl = tiptapEl.querySelector("[data-rm-pagination]") as HTMLElement | null;
    const firstHeaderEl = tiptapEl.querySelector(".rm-first-page-header") as HTMLElement | null;
    console.log(`paginationEl encontrado: ${!!paginationEl}  |  firstHeaderEl encontrado: ${!!firstHeaderEl}`);
    if (firstHeaderEl) console.log(`firstHeaderEl offsetHeight=${firstHeaderEl.offsetHeight}px`);
    console.groupEnd();

    // 1. Salvar inline styles injetados pela extensão
    const saved = {
      minHeight: tiptapEl.style.minHeight,
      border: tiptapEl.style.border,
      width: tiptapEl.style.width,
      paddingLeft: tiptapEl.style.paddingLeft,
      paddingRight: tiptapEl.style.paddingRight,
      boxShadow: tiptapEl.style.boxShadow,
      background: tiptapEl.style.background,
    };

    // 2. Aplicar layout equivalente ao da impressão para medir posições reais.
    if (paginationEl) paginationEl.style.display = "none";
    if (firstHeaderEl) firstHeaderEl.style.display = "none";
    tiptapEl.style.minHeight = "";
    tiptapEl.style.border = "";
    tiptapEl.style.width = "642px";
    tiptapEl.style.paddingLeft = "";
    tiptapEl.style.paddingRight = "";
    tiptapEl.style.boxShadow = "none";
    tiptapEl.style.background = "white";

    // Forçar reflow
    tiptapEl.getBoundingClientRect();

    // --- [B] Log após simulação ---
    // Ler a altura real de conteúdo por página calculada pela extensão.
    // --rm-page-content-general inclui footer/header reais, então coincide exatamente
    // com o quanto de texto cabe por página na tela (887px com footer "Página X").
    const PAGE_HEIGHT = parseFloat(computedStyle.getPropertyValue("--rm-page-content-general")) || 887;
    const tiptapTop = tiptapEl.getBoundingClientRect().top;
    let pageBottomY = tiptapTop + PAGE_HEIGHT;
    console.group("[B] Após simulação de estilos de impressão");
    console.log(`offsetWidth=${tiptapEl.offsetWidth}px  clientWidth=${tiptapEl.clientWidth}px`);
    console.log(`tiptapTop (viewport)=${tiptapTop.toFixed(1)}  PAGE_HEIGHT=${PAGE_HEIGHT}  pageBottomY inicial=${pageBottomY.toFixed(1)}`);
    console.groupEnd();

    // 3. Medir filhos e calcular quebras
    let currentPage = 1;
    console.group("[C] Posição de cada filho");
    const children = Array.from(tiptapEl.children) as HTMLElement[];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child === paginationEl || child === firstHeaderEl) {
        console.log(`filho[${i}] IGNORADO: ${child.tagName}#${child.id}.${child.className.slice(0, 40)}`);
        continue;
      }

      const childRect = child.getBoundingClientRect();
      const relTop = childRect.top - tiptapTop;
      const relBottom = childRect.bottom - tiptapTop;

      if (childRect.bottom > pageBottomY) {
        currentPage++;
        const marker = document.createElement("div");
        marker.dataset.printBreak = "true";
        marker.style.cssText = "break-before:page;page-break-before:always;height:0;overflow:hidden;";
        tiptapEl.insertBefore(marker, child);
        breakMarkers.push(marker);
        console.log(`  [D] ✅ BREAK inserido antes do filho[${i}] — início da página ${currentPage} (relTop=${relTop.toFixed(1)})`);
        pageBottomY = childRect.top + PAGE_HEIGHT;
      }

      // Coloração visual por página de impressão
      child.dataset.debugPrintPage = String(currentPage);

      const preview = child.textContent?.slice(0, 30).replace(/\n/g, "↵") ?? "";
      console.log(`filho[${i}] ${child.tagName} relTop=${relTop.toFixed(1)} relBottom=${relBottom.toFixed(1)} → página ${currentPage}  "${preview}"`);
    }
    console.groupEnd();

    // 4. Restaurar styles originais
    if (paginationEl) paginationEl.style.display = "";
    if (firstHeaderEl) firstHeaderEl.style.display = "";
    Object.assign(tiptapEl.style, saved);

    // --- [E] Log após restauração ---
    console.group("[E] Após restaurar estilos");
    console.log(`offsetWidth=${tiptapEl.offsetWidth}px  inline width="${tiptapEl.style.width}"`);
    console.log(`Marcadores de quebra inseridos: ${breakMarkers.length}`);
    console.groupEnd();
    console.groupEnd();

    window.print();

    // 5. Remover marcadores de quebra (cores ficam para comparação visual)
    breakMarkers.forEach((m) => m.remove());
  };

  if (!editor) {
    return (
      <div className="paged-editor paged-editor-loading">
        <div className="paged-editor-toolbar">
          <h1>Editor de Texto</h1>
        </div>
        <div className="paged-editor-loading-message">Carregando editor...</div>
      </div>
    );
  }

  return (
    <div className="paged-editor">
      <header className="paged-editor-toolbar">
        <h1>Editor de Texto</h1>
        <div className="paged-editor-toolbar-right">
          <span className="paged-editor-page-count">
            {pageCount} página{pageCount !== 1 ? "s" : ""}
          </span>
          <div className="paged-editor-print-group">
            <Button
              onClick={handlePrint}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Printer className="w-4 h-4 mr-2" />
              Imprimir / PDF
            </Button>
            <p className="paged-editor-print-hint">
              No diálogo de impressão, desmarque &ldquo;Cabeçalhos e rodapés&rdquo;
            </p>
          </div>
        </div>
      </header>

      <main className="paged-editor-document">
        <EditorContent editor={editor} className="paged-editor-wrapper" />
      </main>
    </div>
  );
}
