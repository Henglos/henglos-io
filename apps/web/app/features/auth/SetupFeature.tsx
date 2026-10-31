"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Text } from "@henglosio/ui";
import { registerUser } from "@shared/api";
import PixelBlast from "@/shared/components/PixelBlastBackground/PixelBlast";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";

export const SetupFeature = () => {

	const router = useRouter();

	const [username, setUsername] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {

		e.preventDefault();
		setLoading(true);

		try {
			await registerUser({ username, email, password });
			router.push("/auth/login");
		} catch {
		} finally {
			setLoading(false);
		}

	};

	return (

		<main className="grid grid-cols-2 w-full h-full bg-canvas">

			<div className="flex justify-center items-center w-full h-full relative">

				<PixelBlast
					className="absolute! top-0 left-0 w-full h-full"
					style={{}}
					variant="circle"
					pixelSize={4}
					color="#35d363"
					patternScale={3}
					patternDensity={1}
					pixelSizeJitter={1}
					enableRipples
					rippleSpeed={0.4}
					rippleThickness={0.12}
					rippleIntensityScale={1.5}
					liquid={false}
					liquidStrength={0.12}
					liquidRadius={1.2}
					liquidWobbleSpeed={5}
					speed={0.5}
					edgeFade={0.15}
				/>

				<Image src="/logo.svg" alt="Henglos IO" width={300} height={300} className="z-10" draggable={false} unselectable="on"/>

			</div>

			<div className="z-10 w-full h-full right-0 flex items-center justify-center bg-canvas border-l border-line">


				<form
					className="z-10 w-80 flex flex-col gap-4 items-center"
				>

					<Text variant="high" size="xl">Sign Up</Text>

					<Input.Root>
						<Input.Label>Username</Input.Label>
						<Input.Field
							type="text"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							placeholder="your_username"
							autoComplete="username"
							required
						/>
					</Input.Root>

					<Input.Root>
						<Input.Label>Email</Input.Label>
						<Input.Field
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@example.com"
							autoComplete="email"
							required
						/>
					</Input.Root>

					<Input.Root>
						<Input.Label>Password</Input.Label>
						<Input.Field
							type={showPassword ? "text" : "password"}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="x x x x x x"
							autoComplete="new-password"
							required
						/>
						<Input.Affix
							className="cursor-pointer"
							onClick={() => setShowPassword((v) => !v)}
						>
							{showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
						</Input.Affix>
					</Input.Root>

					<Button.Root onClick={handleSubmit} type="button" variant="primary" disabled={loading} className="w-full py-4!">
						<Button.Label>{loading ? "wait..." : "Setup Account"}</Button.Label>
					</Button.Root>

				</form>

			</div>


		</main>

	);

};
