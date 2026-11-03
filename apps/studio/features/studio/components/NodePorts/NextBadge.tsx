import { StepForward } from "lucide-react";

// Debug mode: marks the node Continue runs next.
export const NextBadge = () => (
	<div className="absolute -top-6 left-2 flex items-center gap-1 px-1.5 h-5 rounded-sm bg-accent text-on-accent text-xs font-medium pointer-events-none">
		<StepForward size={10} />
		next
	</div>
);
