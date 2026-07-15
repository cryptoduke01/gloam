// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract SealedSwapVerifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 5376858934922155448918121039708161264557203818496255243229653110918801535495;
    uint256 constant alphay  = 11054109057823590362403954748432464922830615018379565657030017843251128364664;
    uint256 constant betax1  = 2151062535441544556158870658154638495529866028445322410121123552550679137632;
    uint256 constant betax2  = 20438771323709089522835970380274131029186269756134110956056026118094803445324;
    uint256 constant betay1  = 959296887710049764760016205107355499822177825116929769471325628057435076745;
    uint256 constant betay2  = 1652062607521287646738151680447022728140528039546410153188466087688074525263;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 18120322250924816461500283107876170162510538794291983809176296451152400171765;
    uint256 constant deltax2 = 18457587785739185260087733410016940706419321655861114918819179235913282799424;
    uint256 constant deltay1 = 950117378168646159365944731698745990177303335112358140799552075858891112735;
    uint256 constant deltay2 = 16265281001132271345223944153685168888164024138937343749955042833701882107390;

    
    uint256 constant IC0x = 13672101925304693602012296674999021287189135635377955612567174378088041663050;
    uint256 constant IC0y = 14680322515681636026885448375586274539373126742142234248316376391929832712019;
    
    uint256 constant IC1x = 21288049463883495200169352682115304552392239351485054547703328585238949181323;
    uint256 constant IC1y = 9035952112538939503056641105242487241246608238902382773757448703321957029644;
    
    uint256 constant IC2x = 2324891126037605303293050343221072243704571569590407360447178990035590070116;
    uint256 constant IC2y = 16313712477216758466293941583039512664446931159571030418325936369064763103632;
    
    uint256 constant IC3x = 8294673291246679107415063403367965118707889773698264967672469195804693576906;
    uint256 constant IC3y = 9532422468464738055093477077986589772042004259839718778718967662446541850380;
    
    uint256 constant IC4x = 12395992026958806072826412035368509375561873157455709252839332044990424437288;
    uint256 constant IC4y = 14455356884017832319608941846484160009147025844623641341363841978408150070285;
    
    uint256 constant IC5x = 21469385397778102716488832986292132160932547330379508891806850904003941559015;
    uint256 constant IC5y = 317475644944830094472644823559325348447039012177659334671775601495738341252;
    
    uint256 constant IC6x = 8283576990868933914436929305066762468693210182065312740637791436022256841782;
    uint256 constant IC6y = 15894110168721237394201291973562759665559319239857500150776265976838058422391;
    
    uint256 constant IC7x = 5207740850254836923409060349649515908713125298352423239900641276533461893400;
    uint256 constant IC7y = 7590225465210342928888586162786050348553481142518895806951425234133737043909;
    
    uint256 constant IC8x = 7765692048471839436816826995362652110700439527538243725853847758869028630745;
    uint256 constant IC8y = 5522375575872155561968064892042552065146497744692620421416243703736903295062;
    
    uint256 constant IC9x = 20436849466644642556650342459316336714524345877384642395034709362547996513725;
    uint256 constant IC9y = 20146284051381289588740311128275947369904792499938251146983249927466792001737;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[9] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
