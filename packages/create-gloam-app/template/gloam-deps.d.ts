// @gloamtrade/sdk ships TypeScript source and depends on snarkjs (proving) and
// circomlibjs (Poseidon), neither of which ships its own types. Declaring them
// here lets `tsc` / `next build` type-check the transpiled SDK source. A real
// integrator adds the same two shims (or installs community @types if any).

declare module "snarkjs" {
  export const groth16: {
    fullProve: (
      input: Record<string, unknown>,
      wasmFile: string,
      zkeyFile: string
    ) => Promise<{
      proof: {
        pi_a: string[];
        pi_b: string[][];
        pi_c: string[];
      };
      publicSignals: string[];
    }>;
    verify: (
      vkey: unknown,
      publicSignals: string[],
      proof: unknown
    ) => Promise<boolean>;
  };
}

declare module "circomlibjs" {
  export type Poseidon = {
    (inputs: (bigint | number | string)[]): Uint8Array;
    F: {
      toObject: (x: unknown) => bigint;
    };
  };

  export function buildPoseidon(): Promise<Poseidon>;

  export const poseidonContract: {
    createCode: (nInputs: number) => string;
    generateABI: (nInputs: number) => unknown[];
  };
}
