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
          : "flex flex-col gap-3 rounded-md p-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className={cn("flex flex-wrap items-center justify-center gap-1", vertical ? "flex-col" : "sm:justify-start")}>
        <Button className="h-8 w-8 px-0" disabled={currentPage <= 1} variant="secondary" aria-label="首页" onClick={() => onPageChange(1)}>
          {vertical ? <ChevronsUp className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>
        <Button className="h-8 w-8 px-0" disabled={currentPage <= 1} variant="secondary" aria-label="上一页" onClick={() => onPageChange((page) => Math.max(1, page - 1))}>
          {vertical ? <ChevronUp className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
        {visiblePages.map((page) => (
          <Button key={page} className="h-8 w-8 px-0 text-xs" variant={page === currentPage ? "primary" : "secondary"} aria-label={`第 ${page} 页`} onClick={() => onPageChange(page)}>
            {page}
          </Button>
        ))}
        <Button className="h-8 w-8 px-0" disabled={currentPage >= totalPages} variant="secondary" aria-label="下一页" onClick={() => onPageChange((page) => Math.min(totalPages, page + 1))}>
          {vertical ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
        <Button className="h-8 w-8 px-0" disabled={currentPage >= totalPages} variant="secondary" aria-label="尾页" onClick={() => onPageChange(totalPages)}>
          {vertical ? <ChevronsDown className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
        </Button>
        {!vertical && (
          <span className="ml-0 text-xs text-subtle-foreground sm:ml-2">
            第 {currentPage} / {totalPages} 页
          </span>
        )}
      </div>
      <div className={cn("flex gap-2", vertical ? "flex-col items-center" : "flex-col sm:flex-row sm:items-center")}>
        {!vertical && totalItems !== undefined && <span className="text-center text-xs text-subtle-foreground sm:text-left">共 {totalItems} {itemLabel}</span>}
        {!vertical && <span className="text-center text-xs text-muted-foreground sm:text-left">每页数量</span>}
        <div className={cn("flex rounded-md border border-border bg-surface-muted p-1", vertical ? "flex-col" : "justify-center sm:justify-start")}>
          {pageSizeOptions.map((size) => (
            <Button key={size} className={cn("h-8 text-xs", vertical ? "w-10 px-0" : "px-3")} variant={pageSize === size ? "primary" : "ghost"} aria-label={`每页 ${size} 条`} onClick={() => onPageSizeChange(size)}>
              {size}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
