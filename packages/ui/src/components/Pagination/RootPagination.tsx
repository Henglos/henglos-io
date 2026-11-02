import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginationProps {
	page: number;
	total: number;
	onPageChange: (page: number) => void;
	siblingCount?: number;
	className?: string;
}

function getPages(page: number, total: number, siblingCount: number): (number | "...")[] {
	if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

	const left = Math.max(2, page - siblingCount);
	const right = Math.min(total - 1, page + siblingCount);

	const showLeftDot = left > 2;
	const showRightDot = right < total - 1;

	const middle: (number | "...")[] = [];
	for (let i = left; i <= right; i++) middle.push(i);

	return [
		1,
		...(showLeftDot ? ["..." as const] : []),
		...middle,
		...(showRightDot ? ["..." as const] : []),
		total,
	];
}

/** Page numbers with previous / next — first, last and the ones around the current, "…" between. */
export const RootPagination: React.FC<PaginationProps> = ({
	page,
	total,
	onPageChange,
	siblingCount = 1,
	className,
}) => {
	const pages = getPages(page, total, siblingCount);

	return (
		<div className={clsx("flex items-center gap-2", className)}>
			<button
				onClick={() => onPageChange(Math.max(1, page - 1))}
				disabled={page === 1}
				className="size-8 flex items-center justify-center rounded-md border border-line text-fg-secondary hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
			>
				<ChevronLeft size={12} />
			</button>

			{pages.map((p, i) =>
				p === "..." ? (
					<span
						key={`dots-${i}`}
						className="size-8 flex items-center justify-center text-xs text-fg-muted"
					>
						···
					</span>
				) : (
					<button
						key={p}
						onClick={() => onPageChange(p)}
						className={clsx(
							"size-8 flex items-center justify-center rounded-md text-xs transition-colors cursor-pointer",
							p === page
								? "bg-fg text-canvas"
								: "border border-line text-fg-muted hover:text-fg"
						)}
					>
						{p}
					</button>
				)
			)}

			<button
				onClick={() => onPageChange(Math.min(total, page + 1))}
				disabled={page === total}
				className="size-8 flex items-center justify-center rounded-md border border-line text-fg-secondary hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
			>
				<ChevronRight size={12} />
			</button>
		</div>
	);
};
