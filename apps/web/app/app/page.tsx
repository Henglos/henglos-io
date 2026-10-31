"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCookie } from "@shared/lib/cookies";
import { getSetupStatus } from "@shared/api";

export default function RootPage() {

	const router = useRouter();

	useEffect(() => {

		const check = async () => {

			const token = getCookie("accessToken");
			if (token) {
				router.replace("/hub");
				return;
			}

			try {
				const { hasUser } = await getSetupStatus();
				router.replace(hasUser ? "/auth/login" : "/auth/setup");
			} catch {
				router.replace("/auth/login");
			}

		};

		check();

	}, [router]);

	return null;

}
