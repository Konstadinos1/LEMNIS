#pragma once
#include <stdint.h>
#include <stddef.h>

// Return codes
#define CONDUIT_OK              0
#define CONDUIT_ERR_INVALID_KEY -1
#define CONDUIT_ERR_ENCRYPT     -2
#define CONDUIT_ERR_DECRYPT     -3
#define CONDUIT_ERR_VERIFY      -4
#define CONDUIT_ERR_INVALID_INPUT -5

#ifdef __cplusplus
extern "C" {
#endif

// Random
int32_t conduit_random_bytes(uint8_t *out, size_t len);

// X25519
int32_t conduit_x25519_keypair(uint8_t *secret_out, uint8_t *public_out);
int32_t conduit_x25519_dh(const uint8_t *my_secret, const uint8_t *their_public, uint8_t *shared_out);

// Ed25519
int32_t conduit_ed25519_keypair(uint8_t *secret_out, uint8_t *public_out);
int32_t conduit_ed25519_sign(const uint8_t *message, size_t message_len, const uint8_t *secret_key, uint8_t *sig_out);
int32_t conduit_ed25519_verify(const uint8_t *message, size_t message_len, const uint8_t *signature, const uint8_t *public_key);

// AES-256-GCM
int32_t conduit_aes_gcm_encrypt(
    const uint8_t *key,
    const uint8_t *nonce,
    const uint8_t *plaintext, size_t plaintext_len,
    const uint8_t *aad, size_t aad_len,
    uint8_t *ct_out
);
int32_t conduit_aes_gcm_decrypt(
    const uint8_t *key,
    const uint8_t *nonce,
    const uint8_t *ciphertext, size_t ciphertext_len,
    const uint8_t *aad, size_t aad_len,
    uint8_t *pt_out
);

// HKDF-SHA-256
int32_t conduit_hkdf_sha256(
    const uint8_t *ikm, size_t ikm_len,
    const uint8_t *salt, size_t salt_len,
    const uint8_t *info, size_t info_len,
    uint8_t *out, size_t out_len
);

// HMAC-SHA-256
int32_t conduit_hmac_sha256(
    const uint8_t *key, size_t key_len,
    const uint8_t *data, size_t data_len,
    uint8_t *mac_out
);

// SHA-256
int32_t conduit_sha256(const uint8_t *data, size_t data_len, uint8_t *hash_out);

// Constant-time comparison
int32_t conduit_constant_time_eq(const uint8_t *a, const uint8_t *b, size_t len);

#ifdef __cplusplus
}
#endif
