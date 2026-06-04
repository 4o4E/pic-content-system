import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsDown, ChevronsLeft, ChevronsRight, ChevronsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PaginationVariant = "horizontal" | "side";

export interface PaginationProps {
  ariaLabel: string;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  pageSizeOptions: number[];
  variant?: PaginationVariant;
  totalItems?: number;
  itemLabel?: string;
  className?: string;
  onPageChange: Dispatch<SetStateAction<number>>;
  onPageSizeChange: (size: number) => void;
}

export function Pagination({
  ariaLabel,
  currentPage,
  totalPages,
  pageSize,
  pageSizeOptions,
  variant = "horizontal",
  totalItems,
  itemLabel = "条",
  className,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const vertical = variant === "side";
  function visiblePageWindow(size: number) {
    const half = Math.floor(size / 2);
    const count = Math.min(size, totalPages);
    const start = Math.min(Math.max(currentPage - half, 1), Math.max(totalPages - count + 1, 1));
    return Array.from({ length: count }, (_, index) => start + index);
  }

  const desktopPages = visiblePageWindow(5);
  const mobilePages = visiblePageWindow(3);
  const currentPageSizeIndex = Math.max(0, pageSizeOptions.indexOf(pageSize));
  const nextMobilePageSize = pageSizeOptions[(currentPageSizeIndex + 1) % pageSizeOptions.length] ?? pageSize;

  function renderPageButton(page: number) {
    return (
      <Button key={page} className="h-8 w-8 px-0 text-xs" variant={page === currentPage ? "primary" : "secondary"} aria-label={`第 ${page} 页`} onClick={() => onPageChange(page)}>
        {page}
      </Button>
    );
  }

  function renderPageButtons(pages: number[]) {
    return pages.map(renderPageButton);
  }

  const visiblePages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
    const start = Math.min(Math.max(currentPage - 2, 1), Math.max(totalPages - 4, 1));
    return start + index;
  });

  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "border border-border bg-surface shadow-sm",
        vertical
          ? "hidden xl:fixed xl:right-4 xl:top-[4.75rem] xl:z-30 xl:flex xl:w-14 xl:flex-col xl:items-center xl:gap-2 xl:rounded-md xl:p-1"
          : "flex flex-nowrap items-center justify-between gap-1 rounded-md p-2 sm:gap-2 sm:p-3",
        className,
      )}
    >
      <div className={cn("flex min-w-0 shrink-0 items-center justify-center gap-1", vertical ? "flex-col" : "flex-nowrap md:justify-start")}>
        <Button className={cn("h-8 w-8 px-0", !vertical && "hidden sm:inline-flex")} disabled={currentPage <= 1} variant="secondary" aria-label="首页" onClick={() => onPageChange(1)}>
          {vertical ? <ChevronsUp className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>
        <Button className="h-8 w-8 px-0" disabled={currentPage <= 1} variant="secondary" aria-label="上一页" onClick={() => onPageChange((page) => Math.max(1, page - 1))}>
          {vertical ? <ChevronUp className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
        {vertical && renderPageButtons(visiblePages)}
        {!vertical && (
          <>
            <div className="contents sm:hidden">{renderPageButtons(mobilePages)}</div>
            <div className="hidden sm:contents">{renderPageButtons(desktopPages)}</div>
          </>
        )}
        <Button className="h-8 w-8 px-0" disabled={currentPage >= totalPages} variant="secondary" aria-label="下一页" onClick={() => onPageChange((page) => Math.min(totalPages, page + 1))}>
          {vertical ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
        <Button className={cn("h-8 w-8 px-0", !vertical && "hidden sm:inline-flex")} disabled={currentPage >= totalPages} variant="secondary" aria-label="尾页" onClick={() => onPageChange(totalPages)}>
          {vertical ? <ChevronsDown className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
        </Button>
        {!vertical && (
          <span className="ml-0 text-xs text-subtle-foreground sm:ml-2">
            <span className="sm:hidden">{currentPage}/{totalPages}</span>
            <span className="hidden sm:inline">第 {currentPage} / {totalPages} 页</span>
          </span>
        )}
      </div>
      <div className={cn("flex shrink-0 gap-1 sm:gap-2", vertical ? "flex-col items-center" : "items-center justify-center md:justify-end")}>
        {!vertical && totalItems !== undefined && <span className="hidden text-xs text-subtle-foreground md:inline">共 {totalItems} {itemLabel}</span>}
        {!vertical && <span className="hidden text-xs text-muted-foreground md:inline">每页</span>}
        {!vertical && (
          <Button className="h-8 min-w-14 px-2 text-xs md:hidden" variant="secondary" aria-label={`切换每页数量，当前每页 ${pageSize} 条`} onClick={() => onPageSizeChange(nextMobilePageSize)}>
            {pageSize} 条
          </Button>
        )}
        <div className={cn("rounded-md border border-border bg-surface-muted p-1", vertical ? "flex flex-col" : "hidden justify-center md:flex")}>
          {pageSizeOptions.map((size) => (
            <Button key={size} className={cn("h-8 text-xs", vertical ? "w-10 px-0" : "px-2 sm:px-3")} variant={pageSize === size ? "primary" : "ghost"} aria-label={`每页 ${size} 条`} onClick={() => onPageSizeChange(size)}>
              {size}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
