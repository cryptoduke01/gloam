// SPDX-License-Identifier: GPL-3.0
/*
 * REAL constraint verifier for Poseidon unshield.circom (5363 constraints).
 * Dev ceremony keys — regenerate with production powers of tau before mainnet.
 *
 * Pairs with IncrementalMerkleTreePoseidon + NoteLibPoseidon (NOT the live keccak pool).
 * Live RH testnet 0x2BD9… uses keccak — do not set this verifier there.
 */

pragma solidity >=0.7.0 <0.9.0;

contract UnshieldVerifier {
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
    uint256 constant deltax1 = 10447573887288165548010213218238298140104696595410910410236632190274750779675;
    uint256 constant deltax2 = 19952890368330467299491115249947396022527640939218763633567241741189323470568;
    uint256 constant deltay1 = 8726455511515367209211150399616935437052205380174182330035985307650139128086;
    uint256 constant deltay2 = 14001630950741972030768923777977227601336019778621377091900866819835314636021;

    
    uint256 constant IC0x = 20070833554437504223209306501271799818969941497235116148268270987626488994679;
    uint256 constant IC0y = 19517387686940655519103654589277681896440404158418703763858873551982080818228;
    
    uint256 constant IC1x = 16264860955097889236864798516404933115488279973644676749843286033590843406532;
    uint256 constant IC1y = 7125192912592014549410571278729306430267619086782705676416741566643916074496;
    
    uint256 constant IC2x = 14362505874003328647410125113680957193208676432407867558267404152176025761991;
    uint256 constant IC2y = 3941898759590599266325159994021268470825140615406916932670967360162431944771;
    
    uint256 constant IC3x = 4409259420882905596930928359158598192127286627298950371429581982613112755013;
    uint256 constant IC3y = 18633807919523636375451753635301043637717775860475702672404109909904655898836;
    
    uint256 constant IC4x = 5992964916268562738281864340633672190099216244755060628671529689374932364395;
    uint256 constant IC4y = 19414703401945219619792728479452216664547483107628458120702093627585172122664;
    
    uint256 constant IC5x = 20334252074410473976318182700772576146529061385882327142503539719539302140285;
    uint256 constant IC5y = 2747080404952674452610836598998595393532400276560148499618272387847819278236;
    
 
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
