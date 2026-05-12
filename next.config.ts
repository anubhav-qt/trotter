import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['onnxruntime-node', '@huggingface/transformers'],
};

export default nextConfig;
