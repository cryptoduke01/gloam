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
