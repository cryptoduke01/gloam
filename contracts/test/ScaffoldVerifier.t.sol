// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ScaffoldUnshieldVerifier} from "../src/verifiers/ScaffoldUnshieldVerifier.sol";
import {ScaffoldIVerifier} from "../src/verifiers/ScaffoldIVerifier.sol";

/**
 * @dev Proof from `circuits` sample-input (dev ceremony). Pipeline check only.
 */
contract ScaffoldVerifierTest is Test {
    // From circuits/build/unshield/proof.json + public.json
    function test_scaffold_groth16_sample_proof() public {
        ScaffoldUnshieldVerifier v = new ScaffoldUnshieldVerifier();

        uint256[2] memory a = [
            13282963893043176534416913700681512263609484821398441667203863029525882407027,
            15617555034632120249096972895073142678384491433739541000759038532801122207851
        ];
        uint256[2][2] memory b = [
            [
                3225202674443191928313936824767501851532493597614050389345078739060525741639,
                3609380508569283197749321776684627759983846330557458405347507517095321970865
            ],
            [
                11425970788610579108513307904759217097370179797090303833471434161126511825525,
                10490452765536790397560195415588024491848288716914618350410165738109726542575
            ]
        ];
        // snarkjs pi_b is [ [b00, b01], [b10, b11] ] but Solidity expects [ [b01,b00], [b11,b10] ]?
        // snarkjs export uses verifyProof with b as G2: typically swapped for Solidity.
        // If this fails, swap each pair.

        uint256[2] memory c = [
            16896896771715949434039434425199420098662113988843205643215626747024600259480,
            8659244062061364622791421042317239033209639126069656445063553124682989921975
        ];
        uint256[5] memory pub = [uint256(1), 2, 0, 1000000000000000, 3];

        // Try native order first; snarkjs often needs G2 coordinate swap
        bool ok = v.verifyProof(a, b, c, pub);
        if (!ok) {
            uint256[2][2] memory bSwap = [
                [
                    b[0][1],
                    b[0][0]
                ],
                [
                    b[1][1],
                    b[1][0]
                ]
            ];
            ok = v.verifyProof(a, bSwap, c, pub);
        }
        assertTrue(ok, "scaffold sample proof should verify");
    }

    function test_adapter_decodes_proof_bytes() public {
        ScaffoldUnshieldVerifier g = new ScaffoldUnshieldVerifier();
        ScaffoldIVerifier adapter = new ScaffoldIVerifier(g);

        uint256[2] memory a = [
            13282963893043176534416913700681512263609484821398441667203863029525882407027,
            15617555034632120249096972895073142678384491433739541000759038532801122207851
        ];
        uint256[2][2] memory b = [
            [
                3609380508569283197749321776684627759983846330557458405347507517095321970865,
                3225202674443191928313936824767501851532493597614050389345078739060525741639
            ],
            [
                10490452765536790397560195415588024491848288716914618350410165738109726542575,
                11425970788610579108513307904759217097370179797090303833471434161126511825525
            ]
        ];
        uint256[2] memory c = [
            16896896771715949434039434425199420098662113988843205643215626747024600259480,
            8659244062061364622791421042317239033209639126069656445063553124682989921975
        ];

        // Prefer swapped G2 (snarkjs solidity convention)
        bool direct = g.verifyProof(a, b, c, [uint256(1), 2, 0, 1000000000000000, 3]);
        if (!direct) {
            b = [
                [
                    3225202674443191928313936824767501851532493597614050389345078739060525741639,
                    3609380508569283197749321776684627759983846330557458405347507517095321970865
                ],
                [
                    11425970788610579108513307904759217097370179797090303833471434161126511825525,
                    10490452765536790397560195415588024491848288716914618350410165738109726542575
                ]
            ];
            direct = g.verifyProof(a, b, c, [uint256(1), 2, 0, 1000000000000000, 3]);
        }
        assertTrue(direct);

        bytes memory proof = abi.encode(a, b, c);
        uint256[] memory inputs = new uint256[](5);
        inputs[0] = 1;
        inputs[1] = 2;
        inputs[2] = 0;
        inputs[3] = 1000000000000000;
        inputs[4] = 3;
        assertTrue(adapter.verify(proof, inputs));
    }

    function test_wrong_inputs_fail() public {
        ScaffoldUnshieldVerifier v = new ScaffoldUnshieldVerifier();
        uint256[2] memory a = [
            13282963893043176534416913700681512263609484821398441667203863029525882407027,
            15617555034632120249096972895073142678384491433739541000759038532801122207851
        ];
        uint256[2][2] memory b = [
            [
                3609380508569283197749321776684627759983846330557458405347507517095321970865,
                3225202674443191928313936824767501851532493597614050389345078739060525741639
            ],
            [
                10490452765536790397560195415588024491848288716914618350410165738109726542575,
                11425970788610579108513307904759217097370179797090303833471434161126511825525
            ]
        ];
        uint256[2] memory c = [
            16896896771715949434039434425199420098662113988843205643215626747024600259480,
            8659244062061364622791421042317239033209639126069656445063553124682989921975
        ];
        // wrong public signal
        bool ok = v.verifyProof(a, b, c, [uint256(999), 2, 0, 1000000000000000, 3]);
        if (ok) {
            // try other b order
            ok = false;
        }
        // either order should fail with wrong pub
        uint256[2][2] memory b2 = [
            [
                3225202674443191928313936824767501851532493597614050389345078739060525741639,
                3609380508569283197749321776684627759983846330557458405347507517095321970865
            ],
            [
                11425970788610579108513307904759217097370179797090303833471434161126511825525,
                10490452765536790397560195415588024491848288716914618350410165738109726542575
            ]
        ];
        assertFalse(v.verifyProof(a, b, c, [uint256(999), 2, 0, 1000000000000000, 3]));
        assertFalse(v.verifyProof(a, b2, c, [uint256(999), 2, 0, 1000000000000000, 3]));
    }
}
