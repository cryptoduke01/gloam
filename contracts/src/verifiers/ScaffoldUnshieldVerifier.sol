// SPDX-License-Identifier: GPL-3.0
/*
 * SCAFFOLD ONLY — DO NOT setVerifier on a funded ShieldPool.
 *
 * This verifier is for the *placeholder* unshield.circom (no note/Merkle constraints).
 * Anyone who can generate a groth16 proof for that weak circuit can pass any public inputs.
 * Live RH testnet pool must keep verifier = address(0) until real constraints ship.
 *
 * Generated with snarkJS from circuits/build (dev ceremony, not production toxic-waste-free).
 */

pragma solidity >=0.7.0 <0.9.0;

contract ScaffoldUnshieldVerifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 15480427900786989457989595573483129567940925924523550386393090746009728952272;
    uint256 constant alphay  = 4829194004965754016023060947108359098112822803634971220250096480239157934950;
    uint256 constant betax1  = 12495343390204891433561616371011890737313019187608250870953779652795716839925;
    uint256 constant betax2  = 1937642326655955089568007070600842155974018476455004328541544860405585724182;
    uint256 constant betay1  = 14536918049080742152999713779246303244760287058187359337138064770094027448300;
    uint256 constant betay2  = 21240850176977800259119243444557006341000225858719795582588700955302505273817;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 14251629789109365550940143992485871543443253069208709128590676493055556745617;
    uint256 constant deltax2 = 4335047391243894109199656598235424401657737049111362772954391942290445949485;
    uint256 constant deltay1 = 10239776736595328761639333424316349405437715785105464012358298060871445799478;
    uint256 constant deltay2 = 14395369973872334592546423778904442960294305596236924168996457357942490463034;

    
    uint256 constant IC0x = 4122247239778295977701584603765462962253858593870638059524253120564938267573;
    uint256 constant IC0y = 5587613140154543327126213120286124764251776150030598312114947153234970067401;
    
    uint256 constant IC1x = 1278138460804967958133983053737762040176947251061959163197815726277161339106;
    uint256 constant IC1y = 732350086357048843023626457944152282870097615230555824165785104217620728513;
    
    uint256 constant IC2x = 18602180741916302302136997114257218204556109131182928999158402994858721540921;
    uint256 constant IC2y = 1443664089070617327126688091076881804793652976203436951290413018249807759174;
    
    uint256 constant IC3x = 9242432136144644337029765470244365163814635647526250099361742152358295376269;
    uint256 constant IC3y = 13440332547656803921457047063818790064185045736283824571294988995535810704836;
    
    uint256 constant IC4x = 13807515849316967241304734570012659162721351243762464824090350883195880637025;
    uint256 constant IC4y = 1768710909627730934144553072152731761822412543937591344894683801250452252865;
    
    uint256 constant IC5x = 832710859249694348519480104308608334648827801329578850049571020193817729025;
    uint256 constant IC5y = 7578279020994552085087829732381505601321271617356852827606328052784077891991;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[5] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
