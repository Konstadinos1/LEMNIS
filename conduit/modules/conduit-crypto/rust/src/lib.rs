use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng as AeadOsRng, Payload},
    Aes256Gcm, Nonce,
};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use rand_core::{OsRng, RngCore};
use sha2::Sha256;
use x25519_dalek::{PublicKey as X25519Public, StaticSecret};
use zeroize::Zeroize;

type HmacSha256 = Hmac<Sha256>;

// ─── Error codes returned to native callers ───────────────────────────────────

const OK: i32 = 0;
const ERR_INVALID_KEY: i32 = -1;
const ERR_ENCRYPT: i32 = -2;
const ERR_DECRYPT: i32 = -3;
const ERR_VERIFY: i32 = -4;
const ERR_INVALID_INPUT: i32 = -5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

unsafe fn slice_from_raw<'a>(ptr: *const u8, len: usize) -> Option<&'a [u8]> {
    if ptr.is_null() || len == 0 {
        return None;
    }
    Some(std::slice::from_raw_parts(ptr, len))
}

unsafe fn slice_from_raw_allow_empty<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    if ptr.is_null() || len == 0 {
        return &[];
    }
    std::slice::from_raw_parts(ptr, len)
}

unsafe fn slice_mut_from_raw<'a>(ptr: *mut u8, len: usize) -> Option<&'a mut [u8]> {
    if ptr.is_null() || len == 0 {
        return None;
    }
    Some(std::slice::from_raw_parts_mut(ptr, len))
}

// ─── Random ───────────────────────────────────────────────────────────────────

/// Fill `out` with cryptographically secure random bytes.
/// Returns OK or ERR_INVALID_INPUT.
#[no_mangle]
pub unsafe extern "C" fn conduit_random_bytes(out: *mut u8, len: usize) -> i32 {
    let out_slice = match slice_mut_from_raw(out, len) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };
    OsRng.fill_bytes(out_slice);
    OK
}

// ─── X25519 ───────────────────────────────────────────────────────────────────

/// Generate a new X25519 keypair.
/// `secret_out`: 32 bytes, `public_out`: 32 bytes.
#[no_mangle]
pub unsafe extern "C" fn conduit_x25519_keypair(
    secret_out: *mut u8,
    public_out: *mut u8,
) -> i32 {
    let secret_slice = match slice_mut_from_raw(secret_out, 32) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };
    let public_slice = match slice_mut_from_raw(public_out, 32) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };

    let secret = StaticSecret::random_from_rng(OsRng);
    let public = X25519Public::from(&secret);
    secret_slice.copy_from_slice(secret.as_bytes());
    public_slice.copy_from_slice(public.as_bytes());
    OK
}

/// Perform X25519 Diffie-Hellman.
/// `my_secret`: 32 bytes, `their_public`: 32 bytes, `shared_out`: 32 bytes.
#[no_mangle]
pub unsafe extern "C" fn conduit_x25519_dh(
    my_secret: *const u8,
    their_public: *const u8,
    shared_out: *mut u8,
) -> i32 {
    let secret_bytes = match slice_from_raw(my_secret, 32) {
        Some(s) => s,
        None => return ERR_INVALID_KEY,
    };
    let public_bytes = match slice_from_raw(their_public, 32) {
        Some(s) => s,
        None => return ERR_INVALID_KEY,
    };
    let out_slice = match slice_mut_from_raw(shared_out, 32) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };

    let mut secret_arr = [0u8; 32];
    secret_arr.copy_from_slice(secret_bytes);
    let secret = StaticSecret::from(secret_arr);

    let mut public_arr = [0u8; 32];
    public_arr.copy_from_slice(public_bytes);
    let public = X25519Public::from(public_arr);

    let shared = secret.diffie_hellman(&public);
    out_slice.copy_from_slice(shared.as_bytes());
    OK
}

// ─── Ed25519 ──────────────────────────────────────────────────────────────────

/// Generate a new Ed25519 keypair.
/// `secret_out`: 64 bytes (expanded), `public_out`: 32 bytes.
#[no_mangle]
pub unsafe extern "C" fn conduit_ed25519_keypair(
    secret_out: *mut u8,
    public_out: *mut u8,
) -> i32 {
    let secret_slice = match slice_mut_from_raw(secret_out, 64) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };
    let public_slice = match slice_mut_from_raw(public_out, 32) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };

    let signing_key = SigningKey::generate(&mut OsRng);
    // Store as [seed(32) || public(32)] — matches NaCl convention
    secret_slice[..32].copy_from_slice(signing_key.as_bytes());
    secret_slice[32..].copy_from_slice(signing_key.verifying_key().as_bytes());
    public_slice.copy_from_slice(signing_key.verifying_key().as_bytes());
    OK
}

/// Sign `message` with `secret_key` (64-byte NaCl-style secret).
/// `sig_out`: 64 bytes.
#[no_mangle]
pub unsafe extern "C" fn conduit_ed25519_sign(
    message: *const u8,
    message_len: usize,
    secret_key: *const u8,
    sig_out: *mut u8,
) -> i32 {
    let msg = match slice_from_raw(message, message_len) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };
    let sk_bytes = match slice_from_raw(secret_key, 64) {
        Some(s) => s,
        None => return ERR_INVALID_KEY,
    };
    let sig_slice = match slice_mut_from_raw(sig_out, 64) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };

    let mut seed = [0u8; 32];
    seed.copy_from_slice(&sk_bytes[..32]);
    let signing_key = SigningKey::from_bytes(&seed);
    let sig: Signature = signing_key.sign(msg);
    sig_slice.copy_from_slice(&sig.to_bytes());
    seed.zeroize();
    OK
}

/// Verify an Ed25519 signature.
/// Returns OK if valid, ERR_VERIFY if invalid.
#[no_mangle]
pub unsafe extern "C" fn conduit_ed25519_verify(
    message: *const u8,
    message_len: usize,
    signature: *const u8,
    public_key: *const u8,
) -> i32 {
    let msg = match slice_from_raw(message, message_len) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };
    let sig_bytes = match slice_from_raw(signature, 64) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };
    let pk_bytes = match slice_from_raw(public_key, 32) {
        Some(s) => s,
        None => return ERR_INVALID_KEY,
    };

    let mut pk_arr = [0u8; 32];
    pk_arr.copy_from_slice(pk_bytes);
    let verifying_key = match VerifyingKey::from_bytes(&pk_arr) {
        Ok(k) => k,
        Err(_) => return ERR_INVALID_KEY,
    };

    let mut sig_arr = [0u8; 64];
    sig_arr.copy_from_slice(sig_bytes);
    let sig = match Signature::from_bytes(&sig_arr.into()) {
        sig => sig,
    };

    match verifying_key.verify(msg, &sig) {
        Ok(_) => OK,
        Err(_) => ERR_VERIFY,
    }
}

// ─── AES-256-GCM ─────────────────────────────────────────────────────────────

/// Encrypt with AES-256-GCM.
/// `key`: 32 bytes, `nonce`: 12 bytes (caller supplies random nonce).
/// `aad`: optional associated data (may be null / 0 len).
/// `ct_out` must be `plaintext_len + 16` bytes (tag appended).
/// Returns OK or ERR_ENCRYPT.
#[no_mangle]
pub unsafe extern "C" fn conduit_aes_gcm_encrypt(
    key: *const u8,
    nonce: *const u8,
    plaintext: *const u8,
    plaintext_len: usize,
    aad: *const u8,
    aad_len: usize,
    ct_out: *mut u8,
) -> i32 {
    let key_bytes = match slice_from_raw(key, 32) {
        Some(s) => s,
        None => return ERR_INVALID_KEY,
    };
    let nonce_bytes = match slice_from_raw(nonce, 12) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };
    let pt = match slice_from_raw(plaintext, plaintext_len) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };
    let ad = slice_from_raw_allow_empty(aad, aad_len);

    let cipher = match Aes256Gcm::new_from_slice(key_bytes) {
        Ok(c) => c,
        Err(_) => return ERR_INVALID_KEY,
    };

    let n = Nonce::from_slice(nonce_bytes);
    let payload = Payload { msg: pt, aad: ad };
    let ciphertext = match cipher.encrypt(n, payload) {
        Ok(c) => c,
        Err(_) => return ERR_ENCRYPT,
    };

    let out_len = plaintext_len + 16;
    let out_slice = match slice_mut_from_raw(ct_out, out_len) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };
    out_slice.copy_from_slice(&ciphertext);
    OK
}

/// Decrypt with AES-256-GCM.
/// `ciphertext_len` = plaintext_len + 16 (tag).
/// `pt_out` must be `ciphertext_len - 16` bytes.
/// Returns OK or ERR_DECRYPT.
#[no_mangle]
pub unsafe extern "C" fn conduit_aes_gcm_decrypt(
    key: *const u8,
    nonce: *const u8,
    ciphertext: *const u8,
    ciphertext_len: usize,
    aad: *const u8,
    aad_len: usize,
    pt_out: *mut u8,
) -> i32 {
    if ciphertext_len < 16 {
        return ERR_INVALID_INPUT;
    }
    let key_bytes = match slice_from_raw(key, 32) {
        Some(s) => s,
        None => return ERR_INVALID_KEY,
    };
    let nonce_bytes = match slice_from_raw(nonce, 12) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };
    let ct = match slice_from_raw(ciphertext, ciphertext_len) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };
    let ad = slice_from_raw_allow_empty(aad, aad_len);

    let cipher = match Aes256Gcm::new_from_slice(key_bytes) {
        Ok(c) => c,
        Err(_) => return ERR_INVALID_KEY,
    };

    let n = Nonce::from_slice(nonce_bytes);
    let payload = Payload { msg: ct, aad: ad };
    let plaintext = match cipher.decrypt(n, payload) {
        Ok(p) => p,
        Err(_) => return ERR_DECRYPT,
    };

    let out_len = ciphertext_len - 16;
    let out_slice = match slice_mut_from_raw(pt_out, out_len) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };
    out_slice.copy_from_slice(&plaintext);
    OK
}

// ─── HKDF-SHA-256 ─────────────────────────────────────────────────────────────

/// HKDF-SHA-256 extract+expand.
/// `salt` and `info` may be null / 0 len.
/// `out` receives `out_len` bytes of key material.
#[no_mangle]
pub unsafe extern "C" fn conduit_hkdf_sha256(
    ikm: *const u8,
    ikm_len: usize,
    salt: *const u8,
    salt_len: usize,
    info: *const u8,
    info_len: usize,
    out: *mut u8,
    out_len: usize,
) -> i32 {
    let ikm_bytes = match slice_from_raw(ikm, ikm_len) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };
    let salt_bytes = if salt.is_null() || salt_len == 0 {
        None
    } else {
        slice_from_raw(salt, salt_len)
    };
    let info_bytes = slice_from_raw_allow_empty(info, info_len);
    let out_slice = match slice_mut_from_raw(out, out_len) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };

    let hk = Hkdf::<Sha256>::new(salt_bytes, ikm_bytes);
    match hk.expand(info_bytes, out_slice) {
        Ok(_) => OK,
        Err(_) => ERR_INVALID_INPUT,
    }
}

// ─── HMAC-SHA-256 ─────────────────────────────────────────────────────────────

/// HMAC-SHA-256.
/// `mac_out`: 32 bytes.
#[no_mangle]
pub unsafe extern "C" fn conduit_hmac_sha256(
    key: *const u8,
    key_len: usize,
    data: *const u8,
    data_len: usize,
    mac_out: *mut u8,
) -> i32 {
    let key_bytes = match slice_from_raw(key, key_len) {
        Some(s) => s,
        None => return ERR_INVALID_KEY,
    };
    let data_bytes = match slice_from_raw(data, data_len) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };
    let out_slice = match slice_mut_from_raw(mac_out, 32) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };

    let mut mac = HmacSha256::new_from_slice(key_bytes).expect("HMAC accepts any key length");
    mac.update(data_bytes);
    let result = mac.finalize().into_bytes();
    out_slice.copy_from_slice(&result);
    OK
}

// ─── SHA-256 ─────────────────────────────────────────────────────────────────

/// SHA-256 hash.
/// `hash_out`: 32 bytes.
#[no_mangle]
pub unsafe extern "C" fn conduit_sha256(
    data: *const u8,
    data_len: usize,
    hash_out: *mut u8,
) -> i32 {
    use sha2::Digest;

    let data_bytes = match slice_from_raw(data, data_len) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };
    let out_slice = match slice_mut_from_raw(hash_out, 32) {
        Some(s) => s,
        None => return ERR_INVALID_INPUT,
    };

    let mut hasher = sha2::Sha256::new();
    hasher.update(data_bytes);
    out_slice.copy_from_slice(&hasher.finalize());
    OK
}

/// Secure constant-time comparison of two equal-length byte slices.
/// Returns 1 if equal, 0 if not equal or invalid input.
#[no_mangle]
pub unsafe extern "C" fn conduit_constant_time_eq(
    a: *const u8,
    b: *const u8,
    len: usize,
) -> i32 {
    if len == 0 {
        return 1;
    }
    let a_bytes = match slice_from_raw(a, len) {
        Some(s) => s,
        None => return 0,
    };
    let b_bytes = match slice_from_raw(b, len) {
        Some(s) => s,
        None => return 0,
    };
    let mut diff: u8 = 0;
    for (x, y) in a_bytes.iter().zip(b_bytes.iter()) {
        diff |= x ^ y;
    }
    if diff == 0 { 1 } else { 0 }
}
