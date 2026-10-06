/**
 * Proof checking for POST /api/v1/proofs/verify. The checks live in
 * lib/proofsServer (shared with the hosted MCP server); this only maps a
 * malformed proof to the API's error envelope.
 */
import { ApiError } from "@/lib/partnersApi";
import { ProofInputError, verifyProofText as verifyOnServer, type ApiVerifyResult } from "@/lib/proofsServer";

export { groth16Verify, SNARK_CHECK, type ApiVerifyResult, type ProofFormat } from "@/lib/proofsServer";

/** Checks any Gloam proof text. Malformed input is a 400 ApiError. */
export async function verifyProofText(raw: unknown): Promise<ApiVerifyResult> {
  try {
    return await verifyOnServer(raw);
  } catch (e) {
    if (e instanceof ProofInputError) throw new ApiError(e.status, e.code, e.message);
    throw e;
  }
}
