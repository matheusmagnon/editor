"use client";

import React, { useState, useEffect, useCallback } from "react";
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

  const handlePrint = () => {
    window.print();
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
