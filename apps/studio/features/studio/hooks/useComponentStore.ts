import { listPackages, PackageGroup } from "@shared/api";
import { useEffect, useState } from "react";

const cache = new Map<string, PackageGroup[]>();

function groupPackages(packages: Awaited<ReturnType<typeof listPackages>>): PackageGroup[] {
	const grouped = packages.reduce(
		(acc, pkg) => {
			const key = `${pkg.name}_${pkg.author}`;
			if (!acc[key]) {
				acc[key] = { name: pkg.name, author: pkg.author, description: pkg.description, versions: [] };
			}
			acc[key].versions.push(pkg);
			return acc;
		},
		{} as Record<string, PackageGroup>,
	);
	return Object.values(grouped);
}

export function useComponentStore() {
	const [components, setComponents] = useState<PackageGroup[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [query, setQuery] = useState("");

	useEffect(() => {
		if (cache.has(query)) {
			setComponents(cache.get(query)!);
			setIsLoading(false);
			return;
		}

		setIsLoading(true);

		const timeout = setTimeout(() => {
			listPackages({ type: "component", q: query || undefined })
				.then((packages) => {
					const grouped = groupPackages(packages);
					cache.set(query, grouped);
					setComponents(grouped);
				})
				.finally(() => setIsLoading(false));
		}, 300);

		return () => clearTimeout(timeout);
	}, [query]);

	return { components, isLoading, query, setQuery };
}
