import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image.
  output: 'standalone',
  serverExternalPackages: ['onnxruntime-node', '@huggingface/transformers', 'better-sqlite3'],
  // FinBERT's ONNX binding loads this shared library at runtime, which file
  // tracing can't see. CPU build only — the CUDA/TensorRT providers are huge.
  outputFileTracingIncludes: {
    '/api/research': ['node_modules/onnxruntime-node/bin/napi-v6/linux/*/libonnxruntime.so.1'],
  },
};

export default nextConfig;
