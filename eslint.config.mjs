import nextConfig from "eslint-config-next";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "supabase/**",
      "src/types/supabase.ts",
    ],
  },
  ...nextConfig,
];

export default config;
