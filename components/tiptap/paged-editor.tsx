"use client";

import React from "react";
import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "../../components/ui/button";
import { Printer } from "lucide-react";
import "./paged-editor.css";

// A4: 210mm x 297mm
// 96 DPI: 1mm = 3.7795px
const PAGE_WIDTH_PX = 794;
const PAGE_HEIGHT_PX = 1123;
const PAGE_MARGIN_PX = 96;
const PAGE_FOOTER_HEIGHT = 40; // Espaço para o número da página
const LINE_HEIGHT = 26; // 16px * 1.6 = 25.6px, arredondado para cima
// Área de conteúdo: altura da página - margens - rodapé - margem de segurança (1 linha extra)
const CONTENT_HEIGHT_PX =
  PAGE_HEIGHT_PX - PAGE_MARGIN_PX * 2 - PAGE_FOOTER_HEIGHT - LINE_HEIGHT;

interface PageData {
  id: string;
  content: string;
}

export function PagedEditor() {
  const [pages, setPages] = useState<PageData[]>([
    { id: "page-1", content: "" },
  ]);
  const pageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isProcessing = useRef(false);
  const focusInfo = useRef<{ pageId: string; offset: number } | null>(null);

  const saveCursorPosition = useCallback((pageId: string) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const pageEl = pageRefs.current.get(pageId);
    if (!pageEl || !pageEl.contains(range.startContainer)) return;

    const preRange = document.createRange();
    preRange.selectNodeContents(pageEl);
    preRange.setEnd(range.startContainer, range.startOffset);
    const offset = preRange.toString().length;

    focusInfo.current = { pageId, offset };
  }, []);

  const restoreCursorPosition = useCallback(() => {
    if (!focusInfo.current) return;

    const { pageId, offset } = focusInfo.current;
    const pageEl = pageRefs.current.get(pageId);
    if (!pageEl) return;

    const selection = window.getSelection();
    if (!selection) return;

    let currentOffset = 0;
    const walker = document.createTreeWalker(
      pageEl,
      NodeFilter.SHOW_TEXT,
      null
    );
    let node = walker.nextNode();

    while (node) {
      const nodeLength = node.textContent?.length || 0;
      if (currentOffset + nodeLength >= offset) {
        const range = document.createRange();
        range.setStart(node, offset - currentOffset);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      currentOffset += nodeLength;
      node = walker.nextNode();
    }

    const range = document.createRange();
    range.selectNodeContents(pageEl);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  const processOverflow = useCallback(() => {
    if (isProcessing.current) return;
    isProcessing.current = true;

    setPages((currentPages) => {
      const newPages = [...currentPages];
      let changed = false;

      for (let i = 0; i < newPages.length; i++) {
        const pageEl = pageRefs.current.get(newPages[i].id);
        if (!pageEl) continue;

        const contentEl = pageEl.querySelector(".page-content") as HTMLElement;
        if (!contentEl) continue;

        if (contentEl.scrollHeight > CONTENT_HEIGHT_PX) {
          saveCursorPosition(newPages[i].id);

          const text = contentEl.innerText || "";
          const words = text.split(/(\s+)/);

          const measureDiv = document.createElement("div");
          measureDiv.style.cssText = `
            position: absolute;
            visibility: hidden;
            width: ${PAGE_WIDTH_PX - PAGE_MARGIN_PX * 2}px;
            font-family: Arial, sans-serif;
            font-size: 16px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-word;
          `;
          document.body.appendChild(measureDiv);

          let cutIndex = words.length;
          let testText = "";

          for (let j = 0; j < words.length; j++) {
            testText += words[j];
            measureDiv.innerText = testText;
            if (measureDiv.scrollHeight > CONTENT_HEIGHT_PX) {
              cutIndex = Math.max(1, j);
              break;
            }
          }

          document.body.removeChild(measureDiv);

          if (cutIndex < words.length) {
            const keepText = words.slice(0, cutIndex).join("");
            const overflowText = words.slice(cutIndex).join("");

            newPages[i] = { ...newPages[i], content: keepText };

            if (i + 1 < newPages.length) {
              const nextContent = newPages[i + 1].content;
              newPages[i + 1] = {
                ...newPages[i + 1],
                content: overflowText + (nextContent ? "\n" + nextContent : ""),
              };
              if (focusInfo.current?.pageId === newPages[i].id) {
                const keptLength = keepText.length;
                if (focusInfo.current.offset > keptLength) {
                  focusInfo.current = {
                    pageId: newPages[i + 1].id,
                    offset: focusInfo.current.offset - keptLength,
                  };
                }
              }
            } else {
              const newPageId = `page-${Date.now()}`;
              newPages.push({ id: newPageId, content: overflowText });
              if (focusInfo.current?.pageId === newPages[i].id) {
                const keptLength = keepText.length;
                if (focusInfo.current.offset > keptLength) {
                  focusInfo.current = {
                    pageId: newPageId,
                    offset: focusInfo.current.offset - keptLength,
                  };
                }
              }
            }

            changed = true;
          }
        }
      }

      while (
        newPages.length > 1 &&
        !newPages[newPages.length - 1].content.trim()
      ) {
        newPages.pop();
        changed = true;
      }

      isProcessing.current = false;

      if (changed) {
        setTimeout(() => restoreCursorPosition(), 0);
      }

      return changed ? newPages : currentPages;
    });
  }, [saveCursorPosition, restoreCursorPosition]);

  const processTimeoutRef = useRef<NodeJS.Timeout>();

  const scheduleProcess = useCallback(() => {
    if (processTimeoutRef.current) {
      clearTimeout(processTimeoutRef.current);
    }
    processTimeoutRef.current = setTimeout(processOverflow, 100);
  }, [processOverflow]);

  const handleInput = useCallback(
    (pageId: string, e: React.FormEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const newContent = target.innerText || "";

      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, content: newContent } : p))
      );

      scheduleProcess();
    },
    [scheduleProcess]
  );

  const handleKeyDown = useCallback(
    (pageId: string, e: React.KeyboardEvent<HTMLDivElement>) => {
      const pageIndex = pages.findIndex((p) => p.id === pageId);

      if (e.key === "Backspace" && pageIndex > 0) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          if (range.collapsed && range.startOffset === 0) {
            const pageEl = pageRefs.current.get(pageId);
            if (pageEl) {
              const contentEl = pageEl.querySelector(".page-content");
              if (
                contentEl &&
                range.startContainer === contentEl.firstChild &&
                range.startOffset === 0
              ) {
                e.preventDefault();
                const prevPageId = pages[pageIndex - 1].id;
                const currentContent = pages[pageIndex].content;

                setPages((prev) => {
                  const newPages = [...prev];
                  const prevContent = newPages[pageIndex - 1].content;
                  newPages[pageIndex - 1] = {
                    ...newPages[pageIndex - 1],
                    content: prevContent + currentContent,
                  };
                  newPages.splice(pageIndex, 1);
                  return newPages;
                });

                setTimeout(() => {
                  const prevEl = pageRefs.current.get(prevPageId);
                  if (prevEl) {
                    const contentEl = prevEl.querySelector(
                      ".page-content"
                    ) as HTMLElement;
                    if (contentEl) {
                      contentEl.focus();
                      const prevContent = pages[pageIndex - 1].content;
                      focusInfo.current = {
                        pageId: prevPageId,
                        offset: prevContent.length,
                      };
                      restoreCursorPosition();
                    }
                  }
                  scheduleProcess();
                }, 0);
              }
            }
          }
        }
      }
    },
    [pages, restoreCursorPosition, scheduleProcess]
  );

  const handlePrint = () => {
    window.print();
  };

  const setPageRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      pageRefs.current.set(id, el);
    } else {
      pageRefs.current.delete(id);
    }
  }, []);

  useEffect(() => {
    pages.forEach((page) => {
      const pageEl = pageRefs.current.get(page.id);
      if (pageEl) {
        const contentEl = pageEl.querySelector(".page-content") as HTMLElement;
        if (contentEl && contentEl.innerText !== page.content) {
          if (document.activeElement !== contentEl) {
            contentEl.innerText = page.content;
          }
        }
      }
    });
  }, [pages]);

  return (
    <div className="paged-editor">
      {/* Toolbar */}
      <header className="paged-editor-toolbar">
        <h1>Editor de Texto</h1>
        <div className="paged-editor-toolbar-right">
          <span className="paged-editor-page-count">
            {pages.length} página{pages.length !== 1 ? "s" : ""}
          </span>
          <Button
            onClick={handlePrint}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Printer className="w-4 h-4 mr-2" />
            Imprimir / PDF
          </Button>
        </div>
      </header>

      {/* Print container - separate from screen layout */}
      <main className="paged-editor-document">
        {pages.map((page, index) => (
          <article
            key={page.id}
            ref={(el) => setPageRef(page.id, el)}
            className="paged-editor-page"
          >
            <div
              className="page-content"
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => handleInput(page.id, e)}
              onKeyDown={(e) => handleKeyDown(page.id, e)}
              data-placeholder={index === 0 ? "Comece a escrever..." : ""}
            />
            <footer className="page-footer">{index + 1}</footer>
          </article>
        ))}
      </main>
    </div>
  );
}
