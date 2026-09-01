// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TransferVerifier} from "../src/verifiers/TransferVerifier.sol";
import {TransferIVerifier} from "../src/verifiers/TransferIVerifier.sol";
import {DualProofVerifier} from "../src/verifiers/DualProofVerifier.sol";
import {UnshieldVerifier} from "../src/verifiers/UnshieldVerifier.sol";
import {UnshieldIVerifier} from "../src/verifiers/UnshieldIVerifier.sol";

/**
 * @dev Proof from the real Poseidon transfer circuit, regenerated on the pot16 dev
 *      ceremony after the C2 range-check hardening. Spends leaf-0 note, splits into
 *      pay + change; public [root, nullifier, newCommitment0, newCommitment1].
 */
contract TransferVerifierTest is Test {
    function test_transfer_proof_verifies() public {
        TransferVerifier v = new TransferVerifier();
        uint256[2] memory a = [
            4994736957918134786226605030040568191609880316858913371450060956591293020264,
            1939927180158196869479555283731397552051517026347560724497366490389645503831
        ];
        uint256[2][2] memory b = [
            [
                5814710323753880607625188964305193786620395657213476869001018618896200906011,
                14648938953548529752399047728535083902285724950969956080342401724612824582190
            ],
            [
                14024005994502824019812057340112422029463536490776677972184979560384051446147,
                3525631349122729021340704709433622805582432954772737725296117196252975128802
            ]
        ];
        uint256[2] memory c = [
            775945886546460737893514309443563528369445707847419794797671770815409485006,
            5313733941641050780117625135868340314175452320815727461455282425870701311089
        ];
        uint256[4] memory pub = [
            13234193652734635164697424209615330599412255191967788575267034634808796923137,
            1945704986784996205275124157419427994886512646982192210318468338970744312245,
            2186333139843944972658356119109857323200738647011566664081090527609332676017,
            3180035557422202473253632809944765439556973547489051915971181442156632288984
        ];

        bool ok = v.verifyProof(a, b, c, pub);
        if (!ok) {
            uint256[2][2] memory b2 = [
                [
                    14648938953548529752399047728535083902285724950969956080342401724612824582190,
                    5814710323753880607625188964305193786620395657213476869001018618896200906011
                ],
                [
                    3525631349122729021340704709433622805582432954772737725296117196252975128802,
                    14024005994502824019812057340112422029463536490776677972184979560384051446147
                ]
            ];
            ok = v.verifyProof(a, b2, c, pub);
            b = b2;
        }
        assertTrue(ok);

        TransferIVerifier adapter = new TransferIVerifier(v);
        uint256[] memory inputs = new uint256[](4);
        for (uint256 i = 0; i < 4; i++) inputs[i] = pub[i];
        assertTrue(adapter.verify(abi.encode(a, b, c), inputs));

        // Dual routes by length
        UnshieldIVerifier u = new UnshieldIVerifier(new UnshieldVerifier());
        DualProofVerifier dual = new DualProofVerifier(u, adapter);
        assertTrue(dual.verify(abi.encode(a, b, c), inputs));
        // wrong length
        uint256[] memory bad = new uint256[](3);
        assertFalse(dual.verify(abi.encode(a, b, c), bad));
    }
}
