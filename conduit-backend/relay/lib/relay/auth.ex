defmodule Relay.Auth do
  @moduledoc """
  Identity JWT verification.
  Clients sign a short-lived JWT with their Ed25519 messaging identity key.
  The relay verifies the signature and extracts the identity fingerprint.
  The JWT deliberately contains NO wallet address — the relay must never be
  able to correlate a messaging identity with an on-chain address.
  """

  @doc """
  Verify a JWT signed with the client's Ed25519 identity key.
  Returns `{:ok, identity_fingerprint}` or `{:error, reason}`.

  Token structure:
    header: { alg: "EdDSA", typ: "JWT" }
    payload: {
      sub: "<hex identity key fingerprint>",
      iat: <issued-at unix ts>,
      exp: <expiry unix ts>,
      jti: "<random nonce>"
    }
    signature: Ed25519(identity_secret_key, base64url(header) || "." || base64url(payload))
  """
  def verify_identity_jwt(token) when is_binary(token) do
    with {:ok, parts} <- split_token(token),
         {:ok, header} <- decode_part(parts.header),
         {:ok, payload} <- decode_part(parts.payload),
         :ok <- verify_algorithm(header),
         :ok <- verify_expiry(payload),
         {:ok, fingerprint} <- extract_fingerprint(payload),
         {:ok, pub_key} <- fetch_identity_key(fingerprint),
         :ok <- verify_signature(parts, pub_key) do
      {:ok, fingerprint}
    end
  end

  def verify_identity_jwt(_), do: {:error, :invalid_token}

  # ─── Private helpers ───────────────────────────────────────────────────────

  defp split_token(token) do
    case String.split(token, ".") do
      [h, p, s] -> {:ok, %{header: h, payload: p, signature: s}}
      _ -> {:error, :malformed_token}
    end
  end

  defp decode_part(part) do
    with {:ok, json} <- Base.url_decode64(part, padding: false),
         {:ok, map} <- Jason.decode(json) do
      {:ok, map}
    else
      _ -> {:error, :decode_error}
    end
  end

  defp verify_algorithm(%{"alg" => "EdDSA"}), do: :ok
  defp verify_algorithm(_), do: {:error, :unsupported_algorithm}

  defp verify_expiry(%{"exp" => exp}) do
    now = System.system_time(:second)
    if exp > now, do: :ok, else: {:error, :token_expired}
  end
  defp verify_expiry(_), do: {:error, :missing_expiry}

  defp extract_fingerprint(%{"sub" => fp}) when is_binary(fp) and byte_size(fp) > 0,
    do: {:ok, fp}
  defp extract_fingerprint(_), do: {:error, :missing_subject}

  defp fetch_identity_key(fingerprint) do
    case Relay.Repo.get_by(Relay.Identity, fingerprint: fingerprint) do
      nil -> {:error, :unknown_identity}
      identity ->
        case Base.decode64(identity.identity_key_b64) do
          {:ok, key} -> {:ok, key}
          _ -> {:error, :invalid_stored_key}
        end
    end
  end

  defp verify_signature(%{header: h, payload: p, signature: sig_b64}, pub_key) do
    message = "#{h}.#{p}"
    with {:ok, sig} <- Base.url_decode64(sig_b64, padding: false),
         true <- :crypto.verify(:eddsa, :none, message, sig, [pub_key, :ed25519]) do
      :ok
    else
      _ -> {:error, :invalid_signature}
    end
  end
end
