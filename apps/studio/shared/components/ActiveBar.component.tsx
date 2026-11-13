"use client";
import { Avatar, Button } from "@henglosio/ui";
import { Computer, KeyRound, LayoutGrid, Package, ScrollText } from "lucide-react";
import Link from "next/link";

const DOCS_URL = "https://docs.henglos.com/henglos-io";

export const ActivityBar = () => {

	return (

		<nav className="flex flex-col gap-6 items-center w-12 h-full p-2 bg-chrome border-r border-line">

			<Link href={"/hub"}>
				<Button.Root variant="cursor" size="lg">
					<Button.Icon>
						<img src="/logo.svg" className="size-6 aspect-square "/>
					</Button.Icon>
				</Button.Root>
			</Link>

			<div className="flex flex-col gap-2">

				<Link href={"/hub"}>
					<Button.Root variant="ghost" size="lg">
						<Button.Icon>
							<LayoutGrid size={16}/>
						</Button.Icon>
					</Button.Root>
				</Link>

				<Link href={"/drivers"}>
					<Button.Root variant="ghost" size="lg">
						<Button.Icon>
							<Computer size={16}/>
						</Button.Icon>
					</Button.Root>
				</Link>

				<Link href={"/library"}>
					<Button.Root variant="ghost" size="lg">
						<Button.Icon>
							<Package size={16}/>
						</Button.Icon>
					</Button.Root>
				</Link>

				<Link href={"/credentials"} title="Credentials">
					<Button.Root variant="ghost" size="lg">
						<Button.Icon>
							<KeyRound size={16}/>
						</Button.Icon>
					</Button.Root>
				</Link>

			</div>

			<div className="flex flex-col gap-2 mt-auto">

				{/* The docs live outside the studio — opened in a new tab, so the workflow stays open. */}
				<a href={DOCS_URL} target="_blank" rel="noopener noreferrer" title="Documentation">
					<Button.Root variant="ghost" size="lg">
						<Button.Icon>
							<ScrollText size={16} />
						</Button.Icon>
					</Button.Root>
				</a>

			</div>

		</nav>

	);

}
