defmodule Relay.Push do
  @moduledoc """
  Dispatch APNs (iOS) and FCM v1 (Android) push notifications for offline
  message delivery.

  The relay never holds plaintext message content.  It encrypts a short
  "preview" string with each recipient's stored preview key (AES-256-GCM)
  so the NSE / FCM service worker can show a human-readable notification
  without access to the Double Ratchet session.

  All dispatch is fire-and-forget — failures are logged but do not affect
  the message delivery flow.
  """

  require Logger

  import Ecto.Query, only: [from: 2]

  alias Relay.Repo

  @preview_text "New message"
  @apns_bundle_id "com.conduit.app"

  # ---------------------------------------------------------------------------
  # Public API
  # ---------------------------------------------------------------------------

  @doc """
  Asynchronously dispatch push notifications to a list of identity
  fingerprints.  Called from the channel after broadcasting a message.

  `recipients` is a list of hex fingerprint strings (may include the sender;
  duplicates are tolerated).  `thread_id` is included as custom data so the
  client can navigate directly to the thread.
  """
  @spec dispatch_async([String.t()], String.t()) :: :ok
  def dispatch_async([], _thread_id), do: :ok

  def dispatch_async(recipients, thread_id) when is_list(recipients) do
    Task.start(fn ->
      fingerprints = Enum.uniq(recipients)
      rows = load_push_targets(fingerprints)

      Enum.each(rows, fn row ->
        case dispatch_one(row, thread_id) do
          :ok ->
            :ok

          {:error, reason} ->
            Logger.warning("[Push] dispatch failed fingerprint=#{row.fingerprint} reason=#{inspect(reason)}")
        end
      end)
    end)

    :ok
  end

  # ---------------------------------------------------------------------------
  # Internal helpers
  # ---------------------------------------------------------------------------

  defp load_push_targets(fingerprints) do
    from(i in "identities",
      where: i.fingerprint in ^fingerprints,
      where: not is_nil(i.push_token),
      select: %{
        fingerprint: i.fingerprint,
        push_token: i.push_token,
        push_platform: i.push_platform,
        preview_key: i.preview_key
      }
    )
    |> Repo.all()
  end

  defp dispatch_one(%{push_platform: "ios"} = row, thread_id) do
    encrypted_preview = maybe_encrypt_preview(row.preview_key)
    send_apns(row.push_token, encrypted_preview, thread_id)
  end

  defp dispatch_one(%{push_platform: "android"} = row, thread_id) do
    encrypted_preview = maybe_encrypt_preview(row.preview_key)
    send_fcm(row.push_token, encrypted_preview, thread_id)
  end

  defp dispatch_one(row, _thread_id) do
    Logger.debug("[Push] unknown platform #{inspect(row[:push_platform])} for #{row.fingerprint}")
    :ok
  end

  # Encrypt the preview string with the recipient's AES-256-GCM preview key.
  # Wire format: nonce(12) || ciphertext || tag(16) — matches the mobile
  # decryptPreview() function.  Returns nil (no preview) if no key stored.
  defp maybe_encrypt_preview(nil), do: nil
  defp maybe_encrypt_preview(preview_key) when is_binary(preview_key) and byte_size(preview_key) == 32 do
    nonce = :crypto.strong_rand_bytes(12)
    {ciphertext, tag} =
      :crypto.crypto_one_time_aead(
        :aes_256_gcm,
        preview_key,
        nonce,
        @preview_text,
        _aad = "",
        _tag_length = 16,
        _encrypt = true
      )

    Base.encode64(nonce <> ciphertext <> tag)
  end
  defp maybe_encrypt_preview(_), do: nil

  # ---------------------------------------------------------------------------
  # APNs
  # ---------------------------------------------------------------------------

  defp send_apns(device_token, encrypted_preview, thread_id) do
    cfg = apns_config()
    if cfg == :disabled do
      Logger.debug("[Push] APNs disabled (no APNS_KEY_PEM config)")
      :ok
    else
      payload = build_apns_payload(encrypted_preview, thread_id)
      host = if cfg.sandbox, do: "https://api.sandbox.push.apple.com", else: "https://api.push.apple.com"
      url = "#{host}/3/device/#{device_token}"
      jwt = build_apns_jwt(cfg)

      headers = [
        {"authorization", "bearer #{jwt}"},
        {"apns-topic", @apns_bundle_id},
        {"apns-push-type", "alert"},
        {"apns-priority", "10"},
        {"content-type", "application/json"},
      ]

      request = Finch.build(:post, url, headers, Jason.encode!(payload))
      case Finch.request(request, Relay.Finch, receive_timeout: 5_000) do
        {:ok, %Finch.Response{status: 200}} ->
          :ok

        {:ok, %Finch.Response{status: status, body: body}} ->
          {:error, "APNs HTTP #{status}: #{body}"}

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  defp build_apns_payload(nil, thread_id) do
    %{
      "aps" => %{
        "alert" => %{"title" => "Conduit", "body" => "New message"},
        "sound" => "default",
        "badge" => 1,
        "content-available" => 1,
        "mutable-content" => 0
      },
      "thread_id" => thread_id
    }
  end
  defp build_apns_payload(encrypted_preview, thread_id) do
    %{
      "aps" => %{
        "alert" => %{"title" => "Conduit", "body" => "New encrypted message"},
        "sound" => "default",
        "badge" => 1,
        "content-available" => 1,
        "mutable-content" => 1
      },
      "thread_id" => thread_id,
      "encrypted_preview" => encrypted_preview
    }
  end

  # Build an ES256 JWT for APNs provider authentication.
  # Caches the signed JWT for up to 55 minutes (APNs tokens are valid 1 hour).
  defp build_apns_jwt(cfg) do
    Relay.Push.FcmTokenCache.get_apns_jwt(cfg)
  end

  defp sign_es256(header_b64, payload_b64, pem) do
    signing_input = "#{header_b64}.#{payload_b64}"

    [{_type, key_der, _} | _] = :public_key.pem_decode(pem)
    private_key = :public_key.pem_entry_decode({:ECPrivateKey, key_der, :not_encrypted})

    der_sig = :public_key.sign(signing_input, :sha256, private_key)
    raw_sig = der_ecdsa_to_raw(der_sig)
    "#{signing_input}.#{Base.url_encode64(raw_sig, padding: false)}"
  end

  # Parse ASN.1 DER ECDSA signature (SEQUENCE { INTEGER r, INTEGER s })
  # and return the raw 64-byte (r || s) form required by JWT.
  defp der_ecdsa_to_raw(der) do
    case :public_key.der_decode(:'ECDSA-Sig-Value', der) do
      {_, r, s} ->
        pad_int(r, 32) <> pad_int(s, 32)

      _ ->
        raise "Failed to parse ECDSA DER signature"
    end
  end

  defp pad_int(n, len) when is_integer(n) do
    bin = :binary.encode_unsigned(n)
    pad_len = len - byte_size(bin)
    <<0::size(pad_len)-unit(8), bin::binary>>
  end

  # ---------------------------------------------------------------------------
  # FCM v1
  # ---------------------------------------------------------------------------

  defp send_fcm(device_token, encrypted_preview, thread_id) do
    project_id = System.get_env("FCM_PROJECT_ID")
    if is_nil(project_id) do
      Logger.debug("[Push] FCM disabled (no FCM_PROJECT_ID config)")
      :ok
    else
      case Relay.Push.FcmTokenCache.get_access_token() do
        {:ok, access_token} ->
          payload = build_fcm_payload(device_token, encrypted_preview, thread_id)
          url = "https://fcm.googleapis.com/v1/projects/#{project_id}/messages:send"
          headers = [
            {"authorization", "Bearer #{access_token}"},
            {"content-type", "application/json"},
          ]
          request = Finch.build(:post, url, headers, Jason.encode!(payload))
          case Finch.request(request, Relay.Finch, receive_timeout: 5_000) do
            {:ok, %Finch.Response{status: 200}} ->
              :ok

            {:ok, %Finch.Response{status: status, body: body}} ->
              {:error, "FCM HTTP #{status}: #{body}"}

            {:error, reason} ->
              {:error, reason}
          end

        {:error, reason} ->
          {:error, "FCM token fetch failed: #{inspect(reason)}"}
      end
    end
  end

  defp build_fcm_payload(device_token, nil, thread_id) do
    %{
      "message" => %{
        "token" => device_token,
        "notification" => %{"title" => "Conduit", "body" => "New message"},
        "android" => %{"priority" => "high"},
        "data" => %{"thread_id" => thread_id}
      }
    }
  end
  defp build_fcm_payload(device_token, encrypted_preview, thread_id) do
    %{
      "message" => %{
        "token" => device_token,
        "notification" => %{"title" => "Conduit", "body" => "New encrypted message"},
        "android" => %{"priority" => "high"},
        "data" => %{
          "thread_id" => thread_id,
          "encrypted_preview" => encrypted_preview
        }
      }
    }
  end

  # ---------------------------------------------------------------------------
  # Config helpers
  # ---------------------------------------------------------------------------

  defp apns_config do
    key_pem = System.get_env("APNS_KEY_PEM")
    key_id = System.get_env("APNS_KEY_ID")
    team_id = System.get_env("APNS_TEAM_ID")

    if is_nil(key_pem) or is_nil(key_id) or is_nil(team_id) do
      :disabled
    else
      %{
        key_pem: key_pem,
        key_id: key_id,
        team_id: team_id,
        sandbox: System.get_env("APNS_SANDBOX", "false") == "true"
      }
    end
  end

  # Expose for FcmTokenCache
  def sign_es256_public(header_b64, payload_b64, pem),
    do: sign_es256(header_b64, payload_b64, pem)
end

# ---------------------------------------------------------------------------
# Token / JWT cache — keeps FCM OAuth2 tokens and APNs JWTs alive
# so we don't issue a new one on every push.
# ---------------------------------------------------------------------------
defmodule Relay.Push.FcmTokenCache do
  use Agent

  require Logger

  @fcm_token_url "https://oauth2.googleapis.com/token"
  # APNs JWTs expire after 1 hour; refresh at 55 minutes.
  @apns_jwt_ttl_s 55 * 60
  # FCM access tokens are valid for 1 hour; refresh at 55 minutes.
  @fcm_token_ttl_s 55 * 60

  def start_link(_opts) do
    Agent.start_link(fn -> %{fcm: nil, apns: nil} end, name: __MODULE__)
  end

  # Returns {:ok, token} or {:error, reason}
  def get_access_token do
    now = System.system_time(:second)

    case Agent.get(__MODULE__, & &1.fcm) do
      %{token: token, expires_at: exp} when exp > now ->
        {:ok, token}

      _ ->
        case fetch_fcm_access_token() do
          {:ok, token, ttl} ->
            Agent.update(__MODULE__, fn state ->
              Map.put(state, :fcm, %{token: token, expires_at: now + ttl})
            end)
            {:ok, token}

          err ->
            err
        end
    end
  end

  def get_apns_jwt(cfg) do
    now = System.system_time(:second)

    case Agent.get(__MODULE__, & &1.apns) do
      %{jwt: jwt, expires_at: exp} when exp > now ->
        jwt

      _ ->
        jwt = build_fresh_apns_jwt(cfg, now)
        Agent.update(__MODULE__, fn state ->
          Map.put(state, :apns, %{jwt: jwt, expires_at: now + @apns_jwt_ttl_s})
        end)
        jwt
    end
  end

  # ---------------------------------------------------------------------------

  defp build_fresh_apns_jwt(cfg, now) do
    header = %{"alg" => "ES256", "kid" => cfg.key_id}
    payload = %{"iss" => cfg.team_id, "iat" => now}

    header_b64 = Base.url_encode64(Jason.encode!(header), padding: false)
    payload_b64 = Base.url_encode64(Jason.encode!(payload), padding: false)

    Relay.Push.sign_es256_public(header_b64, payload_b64, cfg.key_pem)
  end

  defp fetch_fcm_access_token do
    sa_json = System.get_env("FCM_SERVICE_ACCOUNT_JSON")
    if is_nil(sa_json) do
      {:error, :no_service_account_json}
    else
      with {:ok, sa} <- Jason.decode(sa_json),
           jwt <- build_fcm_jwt(sa),
           {:ok, response} <- post_token_request(jwt),
           {:ok, body} <- Jason.decode(response.body) do
        token = body["access_token"]
        ttl = Map.get(body, "expires_in", @fcm_token_ttl_s)
        {:ok, token, ttl - 60}
      else
        err -> {:error, err}
      end
    end
  end

  defp build_fcm_jwt(sa) do
    now = System.system_time(:second)
    header = %{"alg" => "RS256", "typ" => "JWT"}
    payload = %{
      "iss" => sa["client_email"],
      "scope" => "https://www.googleapis.com/auth/firebase.messaging",
      "aud" => @fcm_token_url,
      "iat" => now,
      "exp" => now + 3600
    }

    header_b64 = Base.url_encode64(Jason.encode!(header), padding: false)
    payload_b64 = Base.url_encode64(Jason.encode!(payload), padding: false)
    signing_input = "#{header_b64}.#{payload_b64}"

    pem = sa["private_key"]
    [{_type, key_der, _} | _] = :public_key.pem_decode(pem)
    private_key = :public_key.pem_entry_decode({:RSAPrivateKey, key_der, :not_encrypted})

    sig = :public_key.sign(signing_input, :sha256, private_key)
    sig_b64 = Base.url_encode64(sig, padding: false)
    "#{signing_input}.#{sig_b64}"
  end

  defp post_token_request(jwt) do
    body = URI.encode_query(%{
      "grant_type" => "urn:ietf:params:oauth:grant-type:jwt-bearer",
      "assertion" => jwt
    })
    headers = [{"content-type", "application/x-www-form-urlencoded"}]
    request = Finch.build(:post, @fcm_token_url, headers, body)
    Finch.request(request, Relay.Finch, receive_timeout: 10_000)
  end
end
