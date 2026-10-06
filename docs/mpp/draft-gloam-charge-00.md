---
title: Gloam Charge Intent for HTTP Payment Authentication
abbrev: Gloam Charge
docname: draft-gloam-charge-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: TBD
    org: Gloam
    email: TBD

normative:
  RFC2104:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC5869:
  RFC8174:
  RFC8259:
  RFC8785:
  RFC9457:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  I-D.payment-intent-charge:
    title: "'charge' Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-charge/
    author:
      - name: Jake Moxey
      - name: Brendan Ryan
      - name: Tom Meagher
    date: 2026
  SEC1:
    title: "SEC 1: Elliptic Curve Cryptography, Version 2.0"
    target: https://www.secg.org/sec1-v2.pdf
    author:
      - org: Standards for Efficient Cryptography Group
    date: 2009-05
  SP800-38D:
    title: "Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM) and GMAC"
    target: https://doi.org/10.6028/NIST.SP.800-38D
    author:
      - org: NIST
    date: 2007-11

informative:
  GLOAM-POOL:
    title: "ShieldPoolPoseidon (Gloam shielded pool contract)"
    target: https://github.com/cryptoduke01/gloam/tree/main/contracts
    author:
      - org: Gloam
  GLOAM-SDK:
    title: "@gloamtrade/sdk and @gloamtrade/mppx-gloam"
    target: https://github.com/cryptoduke01/gloam/tree/main/packages
    author:
      - org: Gloam
  POSEIDON:
    title: "Poseidon: A New Hash Function for Zero-Knowledge Proof Systems"
    target: https://eprint.iacr.org/2019/458
    author:
      - name: Lorenzo Grassi
      - name: Dmitry Khovratovich
      - name: Christian Rechberger
      - name: Arnab Roy
      - name: Markus Schofnegger
    date: 2019
  GROTH16:
    title: "On the Size of Pairing-based Non-interactive Arguments"
    target: https://eprint.iacr.org/2016/260
    author:
      - name: Jens Groth
    date: 2016
  TEMPO-CHARGE:
    title: "Tempo Charge Intent for HTTP Payment Authentication"
    target: https://github.com/tempoxyz/mpp-specs/blob/main/specs/methods/tempo/draft-tempo-charge-00.md
    author:
      - org: Tempo Labs
---

--- abstract

This document defines the "charge" intent for the "gloam" payment
method in the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. A gloam charge is paid with a private
transfer inside a Gloam shielded pool. The payment travels to the
server sealed to the payee's receive tag, and the server moves it into
a note only it knows before it serves the resource. An observer of the
chain sees a shielded transfer and nothing else: not the amount, not
the asset, not the payer, not the payee.

--- middle

# Introduction

Every payment method registered for the Payment scheme so far settles
in public. A Tempo or EVM charge is a token transfer whose amount,
sender and recipient are on the public ledger; a card charge is visible
to the processor. For an agent that pays per request, that ledger is a
complete record of which services it uses, how often, and at what
price. For a service, it publishes its revenue and its customers.

The "gloam" method settles a charge through a Gloam shielded pool
{{GLOAM-POOL}}: a contract that holds deposits as notes. A note is a
commitment to a secret, an amount and an asset; spending one reveals
only a nullifier, and a zero-knowledge proof {{GROTH16}} shows the
spend is valid. A private transfer spends one note and creates two
(a payment note and a change note), and the pool emits

~~~
Transferred(bytes32 indexed nullifier, bytes32[2] newCommitments)
~~~

and nothing else. The amount and asset are inside the commitments.

A gloam charge works like this. The payer builds a private transfer of
exactly the requested amount and asset from a note it holds. It seals
the payment note to the payee's receive tag, a public key the server
publishes in the challenge, so only the payee can open it. The server
opens it, checks that it binds the requested amount and asset, that it
is the payment output of a transfer in the official pool, and that the
credential is bound to this challenge. Then it sweeps the payment note
into a fresh note whose secret only the server knows, and serves the
resource only after that sweep confirms. The sweep matters: the payer
created the payment note, so the payer knows its secret too and could
spend it back until the payee moves it.

The method supports two submission modes:

- `push`: the payer broadcasts its transfer (from its own wallet or
  through a relay) and presents the transaction hash.
- `pull`: the payer presents the proven transfer call and the server
  submits it. The payer needs no gas and its wallet never appears on
  chain, and nothing moves unless the server takes the payment.

## Push Mode

~~~
   Client                        Server                    Gloam pool
      |                             |                           |
      |  (1) GET /resource          |                           |
      |---------------------------->|                           |
      |  (2) 402 Payment Required   |                           |
      |      method="gloam"         |                           |
      |<----------------------------|                           |
      |  (3) prove transfer, seal   |                           |
      |      payment note to tag    |                           |
      |  (4) transfer(...)          |                           |
      |-------------------------------------------------------->|
      |  (5) Authorization: Payment |                           |
      |      (hash, ticket, binding)|                           |
      |---------------------------->|                           |
      |                             |  (6) open ticket, check   |
      |                             |      Transferred event    |
      |                             |  (7) sweep to fresh note  |
      |                             |-------------------------->|
      |                             |  (8) sweep confirmed      |
      |                             |<--------------------------|
      |  (9) 200 OK                 |                           |
      |      Payment-Receipt        |                           |
      |<----------------------------|                           |
~~~

## Pull Mode

~~~
   Client                        Server                    Gloam pool
      |  (1)-(2) as above           |                           |
      |  (3) prove transfer, seal   |                           |
      |  (4) Authorization: Payment |                           |
      |      (transfer, ticket,     |                           |
      |       binding)              |                           |
      |---------------------------->|                           |
      |                             |  (5) check, submit the    |
      |                             |      payer's transfer     |
      |                             |-------------------------->|
      |                             |  (6) sweep to fresh note  |
      |                             |-------------------------->|
      |  (7) 200 OK + Receipt       |                           |
      |<----------------------------|                           |
~~~

## Relationship to the Charge Intent

This document implements the "charge" intent
{{I-D.payment-intent-charge}} for the "gloam" method. Settlement is
deferred: a verified credential is not final until the server's sweep
confirms.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Shielded Pool
: A Gloam pool contract {{GLOAM-POOL}}. It keeps a Merkle tree of
  note commitments and a set of spent nullifiers.

Note
: A value held in the pool: a secret `s`, an amount `v` and an asset
  `a`. Its commitment is `Poseidon(s, v, a)` {{POSEIDON}} and its
  nullifier is `Poseidon(s, commitment)`. Whoever knows `s` can spend
  the note.

Private Transfer
: A pool call `transfer(proof, root, nullifier, newCommitments)` that
  spends one note and creates two. The proof shows the spent note is
  in the tree under `root`, that `nullifier` is its nullifier, and that
  the two new notes conserve its value and asset.

Payment Note
: `newCommitments[0]` of the payer's transfer: a note for exactly the
  charged amount and asset.

Change Note
: `newCommitments[1]`: the rest of the payer's note, kept by the payer.

Receive Tag
: A payee's public identifier, `gloamr1.` followed by the base64url
  {{RFC4648}} encoding of a P-256 public key in SubjectPublicKeyInfo
  form (91 bytes). The matching private key is the Receive Key.

Ticket
: A note package sealed to a receive tag (see {{ticket}}).

Sweep
: A private transfer by the payee from the payment note to a fresh
  note only the payee knows, for the whole amount, with a zero change
  note.

Push Mode, Pull Mode
: Who broadcasts the payer's transfer: the payer (push) or the server
  (pull).

# Method Identifier

This specification registers the payment method identifier:

~~~
gloam
~~~

# Request Schema

The `request` parameter is base64url-encoded JSON, serialized with
JSON Canonicalization Scheme {{RFC8785}} before encoding, per
{{I-D.httpauth-payment}}.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in base units, a base-10 integer string greater than zero |
| `currency` | string | REQUIRED | Token address of the asset; the zero address is the chain's native unit |
| `recipient` | string | REQUIRED | The payee's receive tag (`gloamr1.`...) |
| `description` | string | OPTIONAL | Human-readable payment description |
| `externalId` | string | OPTIONAL | Merchant reference, echoed in the receipt |

`recipient` is REQUIRED for this method. It is not a ledger address:
nothing is ever sent to it on chain. It is the key the payment note is
sealed to, and the server MUST be able to open what is sealed to it.

Challenge expiry is conveyed by the `expires` auth-param. Because a
push payment is proved and confirmed before it is presented, servers
SHOULD give gloam challenges at least 5 minutes; 10 minutes is
RECOMMENDED.

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.chainId` | number | REQUIRED | Chain the pool is deployed on |
| `methodDetails.pool` | string | REQUIRED | Address of the Gloam pool the transfer settles through |
| `methodDetails.decimals` | number | OPTIONAL | Decimals of `currency`, for display only |
| `methodDetails.supportedModes` | array | OPTIONAL | `"push"` and/or `"pull"`. Absent means both |
| `methodDetails.version` | number | OPTIONAL | Absent means 1. This document defines version 1 |

A server that accepts only one mode MUST list it in
`supportedModes`. Clients MUST use a listed mode.

## Official Pools {#official-pools}

The pool is the one party in a gloam charge that both sides trust: it
holds the value and enforces the rules. Clients and servers MUST accept
only the official Gloam pool for `chainId` and MUST refuse a challenge
or credential naming any other address, whatever else it says. At the
time of writing:

| Chain | chainId | Pool |
|-------|---------|------|
| Tempo Moderato (testnet) | 42431 | `0x841DC046Ea3CC842BA3A855731472c6Eb0F2d5eb` |
| Robinhood Chain (testnet) | 46630 | `0x72406D9597807A46f730d8b4fDBC5aC45Dc1d740` |

Implementations SHOULD take this list from the Gloam SDK
{{GLOAM-SDK}} rather than from the challenge. Address fields are
compared by their 20-byte value, not by string form.

## Example

~~~json
{
  "amount": "10000",
  "currency": "0x20c0000000000000000000000000000000000000",
  "methodDetails": {
    "chainId": 42431,
    "decimals": 6,
    "pool": "0x841DC046Ea3CC842BA3A855731472c6Eb0F2d5eb"
  },
  "recipient": "gloamr1.MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEj8xrmkwgp0hB3Q4Sr2WjCh895eFfYoKCCXi5F7h1lYT0ssjq7R-nHlfVwjtpXZePTPOzY6aBEY9R9spujhi_mw"
}
~~~

This asks for 0.01 PathUSD on Tempo Moderato, sealed to the given
receive tag, settled through the Tempo Gloam pool, in either mode.

# Credential Schema

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge |
| `payload` | object | REQUIRED | Gloam payload, below |
| `source` | string | OPTIONAL | Payer identifier |

A gloam payment is unlinkable to the payer by design, and `source`
would undo that. Clients SHOULD omit `source`. Servers MUST NOT require
it and MUST NOT use it in verification.

## Common Payload Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"hash"` (push) or `"transfer"` (pull) |
| `ticket` | string | REQUIRED | The payment note package sealed to `recipient` ({{ticket}}) |
| `binding` | string | REQUIRED | Challenge binding ({{binding}}) |

## Ticket {#ticket}

The ticket carries the payment note to the payee and to no one else.

The plaintext is a note package: `gloam1.` followed by the base64url
encoding (no padding) of the UTF-8 JSON object

| Key | Value |
|-----|-------|
| `v` | `1` |
| `t` | `"gloam-private-note"` |
| `s` | `"poseidon"` |
| `p` | pool address |
| `a` | asset address |
| `w` | amount in base units, decimal string |
| `k` | note secret, `0x`-prefixed hex |
| `c` | note commitment, `0x`-prefixed hex |

The package is sealed to the receive tag as follows:

1. Generate an ephemeral P-256 key pair {{SEC1}}.
2. Compute the ECDH shared secret between the ephemeral private key
   and the tag's public key (256 bits).
3. Derive a 256-bit key with HKDF-SHA256 {{RFC5869}}, empty salt,
   info `"gloam-pay-to-tag-v1"`.
4. Encrypt the plaintext with AES-256-GCM {{SP800-38D}} under that key
   and a random 96-bit IV, with no additional data.
5. The ticket is `gloam2t.` followed by the base64url encoding (no
   padding) of: the ephemeral public key length as 2 bytes big endian,
   the ephemeral SubjectPublicKeyInfo, the IV, and the ciphertext with
   its 16-byte tag.

The same format is used by the Gloam app to hand notes between people,
so a payee can also open a ticket there. Clients MUST NOT send an
unsealed note package in a gloam credential, and servers MUST reject
one.

## Challenge Binding {#binding}

Anyone can seal a ticket to a receive tag, so a ticket alone does not
show which challenge it pays. The binding ties the credential to one
challenge with a key only the payer and the payee know:

~~~
K       = the payment note secret as 32 bytes, big endian
M       = JCS(["gloam-mpp-charge-v1", realm, id, commitment])
binding = base64url(HMAC-SHA256(K, M))     (no padding)
~~~

`realm` and `id` are the challenge's. `commitment` is the payment
note's commitment as lowercase `0x`-prefixed hex. HMAC is
{{RFC2104}}; JCS is {{RFC8785}}, which for this array is plain
compact JSON.

Someone who lifts a credential off the wire cannot open the ticket, so
cannot learn `K`, so cannot present the payment against another
challenge (for example a second request at the same price).

## Hash Payload (type="hash") {#hash-payload}

Push mode. The payer has broadcast its transfer.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hash` | string | REQUIRED | The transfer's transaction hash, `0x`-prefixed, 32 bytes |

~~~json
{
  "binding": "Hq2b2k0Qy9mR0x1s8YwVb2lU8e9v3fQm0p6r7s1t2u4",
  "hash": "0x1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b",
  "ticket": "gloam2t.AFswWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATnUncqjjDtq2oA...",
  "type": "hash"
}
~~~

## Transfer Payload (type="transfer") {#transfer-payload}

Pull mode. The payer presents its proven transfer for the server to
submit.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transfer.proof` | string | REQUIRED | Packed Groth16 proof, `0x`-prefixed hex |
| `transfer.root` | string | REQUIRED | Merkle root the proof is against, bytes32 |
| `transfer.nullifier` | string | REQUIRED | Nullifier of the payer's spent note, bytes32 |
| `transfer.newCommitments` | array | REQUIRED | `[payment, change]`, two bytes32 values |

~~~json
{
  "binding": "4UOm-5gUeOR_78Dn-Qzb7Z5XWaPr-mI20erZoGYL5YQ",
  "ticket": "gloam2t.AFswWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATnUncqjjDtq2oA...",
  "transfer": {
    "newCommitments": [
      "0x1b4b4d63d4214dfd99450382ee62fe415bac1e427bef5bff6b65a99f0b2e1bd1",
      "0x0329a42dc1b651cf0cd345375aac23a55912735fdc6124f0511742ec9864559a"
    ],
    "nullifier": "0x08ca17d842003229b66ec0aa65b43adcfd6e69be3f97779591987d78dff0119e",
    "proof": "0x2a9f...",
    "root": "0x07240c8cd5f1f6c24e5fac72c6ff90d2f8140867ce895ca448cab01c1040498c"
  },
  "type": "transfer"
}
~~~

The proof authorizes the transfer: the pool does not check who
submits it, so the server (or a relay acting for it) can.

# Client Procedure

To pay a gloam charge, a client:

1. MUST check that `method` is `"gloam"`, `intent` is `"charge"`, the
   challenge has not expired, and the request parses as above.
2. MUST check `methodDetails.pool` against the official pool for
   `methodDetails.chainId` ({{official-pools}}) and refuse otherwise.
3. MUST check the amount, `currency` and `recipient` against its own
   policy before proving anything (per the core spec's amount
   verification). Displayed `description` text MUST NOT be relied on.
4. Chooses a mode the challenge allows. Pull is RECOMMENDED when
   offered: the client needs no gas, its wallet does not appear on
   chain, and if the server refuses, nothing has moved.
5. Builds a private transfer from a note it holds that covers the
   amount, with the payment note for exactly `amount` of `currency`
   and a fresh random secret, and the rest as change.
6. SHOULD persist the change note before anything is submitted. It is
   the client's remaining balance.
7. Seals the payment note package to `recipient` ({{ticket}}) and
   computes the binding ({{binding}}).
8. Push: broadcasts the transfer, SHOULD wait for it to succeed, and
   presents `type="hash"`. Clients SHOULD NOT start a push payment
   with less than 30 seconds left before `expires`, since the value
   moves before the credential is presented.
   Pull: presents `type="transfer"` without broadcasting.
9. Sends the credential in the field the challenge selects
   (`Authorization` by default, `Payment-Authorization` when the
   challenge carries `header`).

# Verification Procedure {#verification}

A server verifying a gloam credential MUST, before granting access:

1. Verify the challenge `id` was issued by it for exactly the echoed
   parameters (for example with the HMAC binding of
   {{I-D.httpauth-payment}}), that it has not expired, and that its
   terms are the price of the resource requested.
2. Parse the request; reject unless `methodDetails.pool` is the
   official pool for `methodDetails.chainId`.
3. Reject unless `recipient` is its own receive tag.
4. Parse the payload; reject a `type` that the challenge's
   `supportedModes` or the server's policy does not allow.
5. Open the ticket with its receive key. A ticket that does not open
   was sealed to someone else or is corrupt: reject.
6. Reject unless the note package's pool (if present) is the request's
   pool, its asset equals `currency`, and its amount equals `amount`.
7. Reject unless the commitment equals `Poseidon(secret, amount,
   asset)`. Without this a payer could present a real leaf minted for
   a smaller amount with a larger claimed amount.
8. Recompute the binding and reject on mismatch (constant-time
   comparison).
9. Compute the payment note's nullifier. Reject if the pool reports it
   spent and the server has no record of spending it itself (the
   payer took it back, or the credential was already used).
10. Push: fetch the receipt of `hash`. If it is not mined yet, answer
    402 with `Retry-After`. Reject unless it succeeded and contains a
    `Transferred` log emitted by the pool address (logs from any other
    address MUST be ignored) whose `newCommitments[0]` is the payment
    note's commitment.
11. Pull: reject unless `transfer.newCommitments[0]` is the payment
    note's commitment. If the payment note is not in the pool yet,
    reject when `transfer.nullifier` is already spent (the funding
    note was spent elsewhere, so the transfer cannot land).

These steps are read-only. Passing them does not make a payment final.

# Settlement Procedure

## Pull Submission

In pull mode the server submits the payer's transfer (from its own
wallet or through a relay) and waits for it. If it does not land and
the payment note is not in the pool, the server MUST reject; nothing
was paid.

## Sweep

The server then sweeps: a private transfer spending the payment note
into a fresh note, for the whole amount, with a zero-value change
note. The server SHOULD persist the fresh note before submitting the
sweep, since its secret is now the money and a crash after submission
would otherwise lose it.

## Finality

| State | Final | Grant access |
|-------|-------|--------------|
| Verified ({{verification}}) | No | No |
| Sweep submitted, not confirmed | No | No |
| Sweep confirmed | Yes | Yes |

Until the sweep confirms, the payer can spend the payment note itself.
If it does, the sweep cannot land (the nullifier is spent) and the
server MUST NOT grant access.

## Failure Handling

- Payment note already spent by someone else: reject
  (`verification-failed`). The value is not the server's.
- Push transfer not mined yet, or sweep sent but not confirmed: 402
  with `Retry-After`. The server SHOULD remember a sent sweep, so that
  a retry of the same credential is served once the sweep is seen in
  the pool, instead of being rejected as already spent.
- Sweep reverted and the nullifier unspent: nothing moved; the server
  MAY retry the sweep.

A client that receives a 402 after presenting a push credential (or
any 402 with `Retry-After`) SHOULD present the same credential again
before it pays a fresh challenge. Its first payment may still settle,
and paying again would pay twice.

## Receipt

On success the server returns `Payment-Receipt`
{{I-D.httpauth-payment}} with:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"gloam"` |
| `reference` | string | Transaction hash of the sweep |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} settlement time |
| `challengeId` | string | The challenge `id` |
| `chainId` | number | Chain the payment settled on |
| `externalId` | string | OPTIONAL. Echoed from the request |

The payer can already find the sweep by watching for its payment
note's nullifier, so the receipt reveals nothing new to it.

# Replay Protection

The replay token is the payment note's nullifier. The sweep spends it
on chain, and the pool accepts each nullifier once, so a payment note
can settle exactly one access. Servers:

- MUST check it (step 9 of {{verification}}) and record it as consumed
  when a sweep confirms;
- MUST make the claim on a nullifier atomic, so that concurrent
  requests with the same credential produce at most one sweep and one
  delivery;
- rely on the binding ({{binding}}) to keep a credential from being
  presented against a different challenge.

The challenge `id` is single use as the charge intent requires. A
server MUST record a challenge as consumed when a payment for it
settles, and MUST reject a different payment presented for the same
`id` with `invalid-challenge` before sweeping it, so that the second
payer's value is not taken. The claim on a challenge MUST be atomic,
like the claim on a nullifier.

# Error Responses

Rejections are 402 with a fresh challenge and Problem Details
{{RFC9457}}, using the types of {{I-D.httpauth-payment}}:

| Condition | Problem type |
|-----------|--------------|
| Challenge not issued by this server, or terms of another route | `invalid-challenge` |
| Challenge expired | `payment-expired` |
| Payload does not match this schema | `invalid-payload` |
| Credential not base64url JSON | `malformed-credential` |
| Any check of {{verification}} fails, or the note was already spent | `verification-failed` |
| Transfer not mined, sweep unconfirmed (with `Retry-After`) | `verification-failed` |

# Security Considerations

## Transport Security

All communication MUST use TLS 1.2 or higher. A gloam credential is a
bearer token: whoever holds it can present it.

## Why the Sweep Is Mandatory

The payer generates the payment note's secret. A server that served
after step 11 of {{verification}} without sweeping would serve a
payment the payer can still spend back. Servers MUST NOT grant access
before the sweep confirms.

## Credential Theft

The ticket is encrypted to the receive tag, so a stolen credential
does not reveal the note. It can still be presented, once, against the
challenge it is bound to; it cannot be presented against any other
challenge ({{binding}}). Servers and intermediaries MUST NOT log
credentials.

## Amount and Asset Binding

The amount and asset in the ticket are only claims until step 7 of
{{verification}} checks them against the commitment, and step 10 or 11
ties that commitment to the pool. Skipping either lets a payer pay
less than the price.

## Pool and Event Substitution

A malicious server could name a contract it controls as the pool, and
a malicious client could point to a transaction whose logs come from
such a contract. Both are closed by accepting only the official pool
and only logs emitted by its address.

## Pull Mode

A transfer payload is a complete, submittable transaction. A server
that rejects it, or anyone who sees it, could still submit it later,
moving the payment to the payee. A client whose pull credential is
refused SHOULD spend the funding note again soon (its next payment
does this), which invalidates the old transfer. The proof is bound to
a Merkle root, so servers SHOULD submit promptly, before the root
leaves the pool's root history.

## Push Mode and Expiry

In push mode the value moves before the credential is presented. A
credential that arrives after `expires` is rejected, while the payment
note still sits sealed to the payee. Servers SHOULD issue generous
expiry windows and clients SHOULD keep a margin (see the Client
Procedure). A client MAY keep the payment note's secret so that it can
reclaim a payment the payee never swept.

## Server Keys

The receive key opens every ticket sealed to the server, and fresh
notes are the server's balance. Both MUST be kept server side, with
the care given to a wallet's private key.

## Denial of Service

Verification costs an ECDH and AES-GCM decryption, Poseidon hashes and
chain reads; settlement costs a proof and a transaction, and pull mode
also pays for the payer's transfer. Servers SHOULD rate limit
credential verification and MAY offer only push to unauthenticated
clients.

## Issuer Controls

On chains whose stablecoins carry issuer controls (Tempo's TIP-20
freeze, for example), an issuer could freeze the pool's balance of
that token. That risk is shared by every holder of a note in that
asset and is outside the control of this method.

## Proving Keys

The Groth16 verifier relies on a trusted setup. Deployments listed in
{{official-pools}} are testnets with development keys; a production
deployment needs a multi-party ceremony.

# Privacy Considerations

What the public sees for one gloam charge: two `Transferred` events
(the payment and the sweep), each with a nullifier and two
commitments, the addresses that submitted those transactions, and
their timing. It does not see the amount, the asset, the payer's
notes, the payee's notes, or the receive tag.

What remains linkable:

- Push mode shows the payer's wallet as the sender of its transfer,
  unless it submits through a relay. Pull mode shows only the server
  or its relay.
- A server that receives a `hash` can look up that transaction's
  sender, so in push mode it may learn the payer's wallet. Pull mode
  avoids this.
- A sweep shortly after a payment can be linked to it by timing. The
  anonymity set is every note in the pool; on a new or quiet pool it
  is small.
- Network metadata (IP addresses, TLS fingerprints) is out of scope.

The server learns the amount and asset, which it set, and nothing
about the payer's other notes or balance. The payer learns the
payee's receive tag, which the challenge publishes.

This differs from operator-visible privacy systems, where a designated
operator sees every transaction: here no party other than the payer
and the payee learns the payment's amount or parties.

# IANA Considerations

## Payment Method Registration

This document registers the following payment method in the "HTTP
Payment Methods" registry established by {{I-D.httpauth-payment}}:

| Method Identifier | Description | Reference |
|-------------------|-------------|-----------|
| `gloam` | Private transfer through a Gloam shielded pool | This document |

## Payment Intent Registration

This document registers the following in the "HTTP Payment Intents"
registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `charge` | `gloam` | One-time private transfer, swept before access | This document |

--- back

# ABNF Collected

~~~abnf
gloam-charge-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "gloam" DQUOTE ","
  "intent=" DQUOTE "charge" DQUOTE ","
  "request=" base64url-nopad

gloam-charge-credential = "Payment" 1*SP base64url-nopad

receive-tag   = "gloamr1." base64url-nopad
sealed-ticket = "gloam2t." base64url-nopad
note-package  = "gloam1." base64url-nopad

base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Test Vectors

## Challenge Binding

~~~
K       = 0x000000000000000000000000000000000000000000000000000000000000002a
realm   = "api.example.com"
id      = "kM9xPqWvT2nJrHsY4aDfEb"
commit  = 0x0cafe00000000000000000000000000000000000000000000000000000000001
M       = ["gloam-mpp-charge-v1","api.example.com","kM9xPqWvT2nJrHsY4aDfEb","0x0cafe00000000000000000000000000000000000000000000000000000000001"]
binding = 2vjHW5l6ZyecrqQtmCNwNGSqHDnWtLJMp5y_-kxG2RI
~~~

## Challenge Id

With the HMAC construction of {{I-D.httpauth-payment}}, the server
secret `test-vector-secret` (UTF-8), and the request of the example
above with `expires="2026-10-06T12:10:00Z"`, the challenge is:

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="VCrhPiJuYqbW_IsGPzwGsySzvShpj76pwoy-_CuySxw",
  realm="api.example.com",
  method="gloam",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMCIsImN1cnJlbmN5IjoiMHgyMGMwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIiwibWV0aG9kRGV0YWlscyI6eyJjaGFpbklkIjo0MjQzMSwiZGVjaW1hbHMiOjYsInBvb2wiOiIweDg0MURDMDQ2RWEzQ0M4NDJCQTNBODU1NzMxNDcyYzZFYjBGMmQ1ZWIifSwicmVjaXBpZW50IjoiZ2xvYW1yMS5NRmt3RXdZSEtvWkl6ajBDQVFZSUtvWkl6ajBEQVFjRFFnQUVqOHhybWt3Z3AwaEIzUTRTcjJXakNoODk1ZUZmWW9LQ0NYaTVGN2gxbFlUMHNzanE3Ui1uSGxmVndqdHBYWmVQVFBPelk2YUJFWTlSOXNwdWpoaV9tdyJ9",
  expires="2026-10-06T12:10:00Z"
~~~

# Full Example

The challenge is the one above. The client pays in pull mode and
retries with (payload abbreviated):

~~~json
{
  "challenge": {
    "expires": "2026-10-06T12:10:00Z",
    "id": "VCrhPiJuYqbW_IsGPzwGsySzvShpj76pwoy-_CuySxw",
    "intent": "charge",
    "method": "gloam",
    "realm": "api.example.com",
    "request": "eyJhbW91bnQiOiIxMDAwMCIs..."
  },
  "payload": {
    "binding": "4UOm-5gUeOR_78Dn-Qzb7Z5XWaPr-mI20erZoGYL5YQ",
    "ticket": "gloam2t.AFswWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATnUncqjjDtq2oA...",
    "transfer": {
      "newCommitments": [
        "0x1b4b4d63d4214dfd99450382ee62fe415bac1e427bef5bff6b65a99f0b2e1bd1",
        "0x0329a42dc1b651cf0cd345375aac23a55912735fdc6124f0511742ec9864559a"
      ],
      "nullifier": "0x08ca17d842003229b66ec0aa65b43adcfd6e69be3f97779591987d78dff0119e",
      "proof": "0x2a9f...",
      "root": "0x07240c8cd5f1f6c24e5fac72c6ff90d2f8140867ce895ca448cab01c1040498c"
    },
    "type": "transfer"
  }
}
~~~

A pull credential with a real proof is about 3 KB and a push
credential about 2 KB, within the 4 KB servers must accept.

The server submits the transfer, sweeps the payment note, and answers:

~~~http
HTTP/1.1 200 OK
Cache-Control: private
Payment-Receipt: eyJzdGF0dXMiOiJzdWNjZXNzIiwibWV0aG9kIjoiZ2xvYW0iLCJ0aW1lc3RhbXAiOiIyMDI2LTEwLTA2VDEyOjAwOjAzWiIsInJlZmVyZW5jZSI6IjB4M2MzYzNjM2MzYzNjM2MzYzNjM2MzYzNjM2MzYzNjM2MzYzNjM2MzYzNjM2MzYzNjM2MzYzNjM2MzYzNjM2MzYyIsImNoYWxsZW5nZUlkIjoiVkNyaFBpSnVZcWJXX0lzR1B6d0dzeVN6dlNocGo3NnB3b3ktX0N1eVN4dyIsImNoYWluSWQiOjQyNDMxfQ
~~~

The receipt decodes to:

~~~json
{
  "chainId": 42431,
  "challengeId": "VCrhPiJuYqbW_IsGPzwGsySzvShpj76pwoy-_CuySxw",
  "method": "gloam",
  "reference": "0x3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c",
  "status": "success",
  "timestamp": "2026-10-06T12:00:03Z"
}
~~~

# Implementation

A TypeScript implementation is `@gloamtrade/mppx-gloam`
{{GLOAM-SDK}}: an mppx method (server and client), a library-free
codec and Fetch paywall, and the Gloam MCP server's `gloam_fetch_paid`
and `gloam_verify_payment` tools.

# Acknowledgements

This method builds on the Payment scheme and the charge intent by
Tempo Labs and Stripe, and follows the structure of the Tempo charge
method {{TEMPO-CHARGE}}.
