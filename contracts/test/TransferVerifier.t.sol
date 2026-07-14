// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TransferVerifier} from "../src/verifiers/TransferVerifier.sol";
import {TransferIVerifier} from "../src/verifiers/TransferIVerifier.sol";
import {DualProofVerifier} from "../src/verifiers/DualProofVerifier.sol";
import {UnshieldVerifier} from "../src/verifiers/UnshieldVerifier.sol";
import {UnshieldIVerifier} from "../src/verifiers/UnshieldIVerifier.sol";

contract TransferVerifierTest is Test {
    function test_transfer_proof_verifies() public {
        TransferVerifier v = new TransferVerifier();
        uint256[2] memory a = [
            11517924719783162735458376779136247965780076152338941945220965327796170838638,
            20086245490068195864528722146434842440260484143094552263843134120606400009209
        ];
        uint256[2][2] memory b = [
            [
                19684938967231469233990158328889339322490632374663205991140529653865133528269,
                14129260470432671609240299603824414220437532098320197344634461925576472664387
            ],
            [
                5128144888069052756349868209386059419718382887616796265667741307289050954939,
                13920314258824957170380961781376633200161536568875607950824703935851550393675
            ]
        ];
        uint256[2] memory c = [
            14945602014983656416740432694391966830565460673467377561877532937264546652639,
            811948134799670481503754173291110593897100046512574197938269947044396981372
        ];
        uint256[4] memory pub = [
            5945548233041026236964551845427649031697369031748654710988646711994441283705,
            1125695664727506856657025906980711424247878598875537821671194854644788577619,
            16740832815541826037638905624022762492519561877776272342339977385913904935276,
            7945379184380470498340791232677850560210637162757032609041772504404943082969
        ];

        bool ok = v.verifyProof(a, b, c, pub);
        if (!ok) {
            uint256[2][2] memory b2 = [
                [
                    14129260470432671609240299603824414220437532098320197344634461925576472664387,
                    19684938967231469233990158328889339322490632374663205991140529653865133528269
                ],
                [
                    13920314258824957170380961781376633200161536568875607950824703935851550393675,
                    5128144888069052756349868209386059419718382887616796265667741307289050954939
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
