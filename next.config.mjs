/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/**": ["./infra/migrations/**"],
  },
};

export default nextConfig;
