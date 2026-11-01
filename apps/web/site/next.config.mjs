import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {

	basePath: "henglos-io",
	rewrites: [
		{
			source: '/',
			has: [
				{
					type: "host",
					value: 'get.henglos.com'
				}
			],
			destination: 'https://raw.githubusercontent.com/Henglos/henglos-io/refs/heads/main/deploy/docker/get-hio.sh',
			permanent: false
		},
		{
			source: '/:path*',
			has: [
				{
					type: "host",
					value: 'docs.henglos.com'
				}
			],
			destination: '/docs/:path*'
		}
	],
	
	reactStrictMode: true,
	// Ship their TypeScript source — the docs render workflows with the studio's canvas.
	transpilePackages: ["@henglosio/ui", "@henglosio/workflow-ui"],
	images: { unoptimized: true },
	// Dev only: Next's badge would sit on the docs sidebar's theme switch (bottom left).
	devIndicators: { position: "bottom-right" },
};

export default withMDX(config);
