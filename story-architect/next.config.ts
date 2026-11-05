import type { NextConfig } from "next";
const nextConfig: NextConfig = { serverExternalPackages: ["@prisma/client", "pdfkit"] };
export default nextConfig;
