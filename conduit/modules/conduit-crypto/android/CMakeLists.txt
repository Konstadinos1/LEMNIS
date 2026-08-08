cmake_minimum_required(VERSION 3.22.1)
project(conduit_crypto_jni)

# Path to prebuilt Rust .so files (built by cargo-ndk)
# Expected layout after `cargo ndk -t arm64-v8a -t x86_64 build --release`:
#   ../rust/target/<abi>/release/libconduit_crypto.so

set(RUST_TARGET_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../rust/target")

if(ANDROID_ABI STREQUAL "arm64-v8a")
  set(RUST_ABI_DIR "aarch64-linux-android")
elseif(ANDROID_ABI STREQUAL "x86_64")
  set(RUST_ABI_DIR "x86_64-linux-android")
elseif(ANDROID_ABI STREQUAL "x86")
  set(RUST_ABI_DIR "i686-linux-android")
elseif(ANDROID_ABI STREQUAL "armeabi-v7a")
  set(RUST_ABI_DIR "armv7-linux-androideabi")
else()
  message(FATAL_ERROR "Unsupported ABI: ${ANDROID_ABI}")
endif()

set(RUST_LIB "${RUST_TARGET_DIR}/${RUST_ABI_DIR}/release/libconduit_crypto.so")

add_library(conduit_crypto SHARED IMPORTED)
set_target_properties(conduit_crypto PROPERTIES IMPORTED_LOCATION "${RUST_LIB}")

# JNI bridge (thin wrapper that calls the Rust C API)
add_library(conduit_crypto_jni SHARED
  ${CMAKE_CURRENT_SOURCE_DIR}/jni/conduit_crypto_jni.cpp
)

target_include_directories(conduit_crypto_jni PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/../ios  # reuse the shared C header
)

target_link_libraries(conduit_crypto_jni
  conduit_crypto
  android
  log
)
