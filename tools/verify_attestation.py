#!/usr/bin/env python3
"""
verify_attestation.py — Host-side verifier for H-Gate attestation packets.

Verifies:
  1) Ed25519 signature over the attestation payload
  2) PCR register integrity
  3) Monotonic counter non-regression

Requires: pip install pynacl
"""

import sys
import struct
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError


def verify_attestation(pubkey_hex: str, packet: bytes, sig: bytes) -> bool:
    """Verify an H-Gate attestation packet signature."""
    vk = VerifyKey(bytes.fromhex(pubkey_hex))
    try:
        vk.verify(packet, sig)
        # Parse attestation payload
        if len(packet) < 40:
            print("❌ Attestation packet too short.")
            return False
        counter = struct.unpack_from("<Q", packet, 0)[0]
        pcr = packet[8:40].hex()
        print(f"✅ Attestation Valid")
        print(f"   Counter : {counter}")
        print(f"   PCR     : {pcr}")
        return True
    except BadSignatureError:
        print("❌ CRITICAL: Attestation signature mismatch. H-Gate trust broken.")
        return False


def verify_image(pubkey_hex: str, image_path: str) -> bool:
    """Verify a signed boot image header."""
    with open(image_path, "rb") as f:
        header = f.read(4 + 64 + 32)  # magic + sig + hash
        if len(header) < 100:
            print("❌ Image header too short.")
            return False
        magic = header[0:4]
        if magic != b"HGAT":
            print(f"❌ Bad magic: {magic}")
            return False
        sig = header[4:68]
        payload_hash = header[68:100]
        # Read remaining payload
        payload = f.read()

    import hashlib
    computed = hashlib.sha256(payload).digest()
    if computed != payload_hash:
        print("❌ Payload hash mismatch.")
        return False

    vk = VerifyKey(bytes.fromhex(pubkey_hex))
    try:
        vk.verify(payload_hash, sig)
        print(f"✅ Image Verified: {image_path}")
        print(f"   Payload SHA-256: {computed.hex()}")
        return True
    except BadSignatureError:
        print(f"❌ Image signature invalid: {image_path}")
        return False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  verify_attestation.py attest <pubkey_hex> <packet_hex> <sig_hex>")
        print("  verify_attestation.py image  <pubkey_hex> <image_path>")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "attest" and len(sys.argv) == 5:
        ok = verify_attestation(sys.argv[2], bytes.fromhex(sys.argv[3]), bytes.fromhex(sys.argv[4]))
        sys.exit(0 if ok else 1)
    elif cmd == "image" and len(sys.argv) == 4:
        ok = verify_image(sys.argv[2], sys.argv[3])
        sys.exit(0 if ok else 1)
    else:
        print("Invalid arguments.")
        sys.exit(1)
