defmodule RelayWeb.InternalPrekeysController do
  use Phoenix.Controller, formats: [:json]

  alias Relay.Prekeys

  @doc """
  POST /internal/prekeys/register
  Body mirrors the API gateway schema (camelCase, number arrays for binary fields).
  """
  def register(conn, params) do
    with {:ok, parsed} <- parse_register_params(params),
         {:ok, _identity} <- Prekeys.register(parsed) do
      conn
      |> put_status(:created)
      |> json(%{ok: true})
    else
      {:error, :invalid_params, reason} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "invalid_params", detail: reason})

      {:error, changeset} when is_map(changeset) ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "db_error"})

      _ ->
        conn
        |> put_status(:internal_server_error)
        |> json(%{error: "internal_error"})
    end
  end

  @doc """
  POST /internal/prekeys/replenish
  Upload additional one-time prekeys for an existing identity.
  Caller must include their fingerprint so we can locate the identity.
  """
  def replenish(conn, params) do
    fingerprint = params["fingerprint"]

    unless is_binary(fingerprint) and Regex.match?(~r/^[0-9a-f]{64}$/, fingerprint) do
      conn
      |> put_status(:bad_request)
      |> json(%{error: "invalid_fingerprint"})
    else
      case parse_one_time_prekeys(params["oneTimePreKeys"]) do
        {:error, :invalid_params, reason} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: "invalid_params", detail: reason})

        {:ok, otks} ->
          case Prekeys.replenish(fingerprint, otks) do
            {:ok, count} ->
              json(conn, %{ok: true, added: count})

            {:error, :not_found} ->
              conn
              |> put_status(:not_found)
              |> json(%{error: "identity_not_found"})
          end
      end
    end
  end

  @doc """
  GET /internal/prekeys/:fingerprint
  Returns pre-key bundle with binary fields serialised as number arrays,
  matching what the mobile client expects.
  """
  def fetch_bundle(conn, %{"fingerprint" => fingerprint}) do
    unless Regex.match?(~r/^[0-9a-f]{64}$/, fingerprint) do
      conn
      |> put_status(:bad_request)
      |> json(%{error: "invalid_fingerprint"})
    else
      case Prekeys.fetch_bundle(fingerprint) do
        {:ok, bundle} ->
          json(conn, serialise_bundle(bundle))

        {:error, :not_found} ->
          conn
          |> put_status(:not_found)
          |> json(%{error: "not_found"})
      end
    end
  end

  # ---------------------------------------------------------------------------
  # Param parsing — convert camelCase JSON to the atom map Prekeys.register/1 expects.
  # Binary fields arrive as number[] (0-255 integers) from the Node gateway.
  # ---------------------------------------------------------------------------

  defp parse_register_params(p) do
    with {:ok, id_dh}  <- parse_binary(p["identityKeyDh"], "identityKeyDh"),
         {:ok, id_ed}  <- parse_binary(p["identityKeyEd"], "identityKeyEd"),
         {:ok, spk}    <- parse_signed_prekey(p["signedPreKey"]),
         {:ok, kpk}    <- parse_kyber_prekey(p["kyberPreKey"]),
         {:ok, otks}   <- parse_one_time_prekeys(p["oneTimePreKeys"]),
         {:ok, reg_id} <- parse_integer(p["registrationId"], "registrationId") do
      {:ok, %{
        identity_key_dh:  id_dh,
        identity_key_ed:  id_ed,
        registration_id:  reg_id,
        device_id:        parse_integer_default(p["deviceId"], 1),
        signed_prekey:    spk,
        kyber_prekey:     kpk,
        one_time_prekeys: otks,
      }}
    end
  end

  defp parse_signed_prekey(nil), do: {:error, :invalid_params, "signedPreKey required"}
  defp parse_signed_prekey(m) when is_map(m) do
    with {:ok, pub} <- parse_binary(m["publicKey"], "signedPreKey.publicKey"),
         {:ok, sig} <- parse_binary(m["signature"], "signedPreKey.signature"),
         {:ok, kid} <- parse_integer(m["keyId"], "signedPreKey.keyId") do
      {:ok, %{key_id: kid, public_key: pub, signature: sig}}
    end
  end
  defp parse_signed_prekey(_), do: {:error, :invalid_params, "signedPreKey must be an object"}

  defp parse_kyber_prekey(nil), do: {:ok, %{key_id: 0, public_key: <<>>, signature: <<>>}}
  defp parse_kyber_prekey(m) when is_map(m) do
    with {:ok, pub} <- parse_binary(m["publicKey"], "kyberPreKey.publicKey"),
         {:ok, sig} <- parse_binary(m["signature"], "kyberPreKey.signature"),
         {:ok, kid} <- parse_integer(m["keyId"], "kyberPreKey.keyId") do
      {:ok, %{key_id: kid, public_key: pub, signature: sig}}
    end
  end
  defp parse_kyber_prekey(_), do: {:error, :invalid_params, "kyberPreKey must be an object"}

  defp parse_one_time_prekeys(nil), do: {:ok, []}
  defp parse_one_time_prekeys(list) when is_list(list) do
    Enum.reduce_while(list, {:ok, []}, fn item, {:ok, acc} ->
      with {:ok, pub} <- parse_binary(item["publicKey"], "oneTimePreKeys[].publicKey"),
           {:ok, kid} <- parse_integer(item["keyId"], "oneTimePreKeys[].keyId") do
        {:cont, {:ok, acc ++ [%{key_id: kid, public_key: pub}]}}
      else
        err -> {:halt, err}
      end
    end)
  end
  defp parse_one_time_prekeys(_), do: {:error, :invalid_params, "oneTimePreKeys must be an array"}

  defp parse_binary(nil, field), do: {:error, :invalid_params, "#{field} required"}
  defp parse_binary(arr, field) when is_list(arr) do
    if Enum.all?(arr, &(is_integer(&1) and &1 >= 0 and &1 <= 255)) do
      {:ok, :erlang.list_to_binary(arr)}
    else
      {:error, :invalid_params, "#{field} must be a byte array (0-255)"}
    end
  end
  defp parse_binary(_, field), do: {:error, :invalid_params, "#{field} must be an array"}

  defp parse_integer(nil, field), do: {:error, :invalid_params, "#{field} required"}
  defp parse_integer(v, _field) when is_integer(v), do: {:ok, v}
  defp parse_integer(_, field), do: {:error, :invalid_params, "#{field} must be an integer"}

  defp parse_integer_default(nil, default), do: default
  defp parse_integer_default(v, _default) when is_integer(v), do: v
  defp parse_integer_default(_, default), do: default

  # ---------------------------------------------------------------------------
  # Bundle serialisation — convert binaries back to number[] for the API gateway.
  # ---------------------------------------------------------------------------

  defp serialise_bundle(b) do
    %{
      registrationId:        b.registration_id,
      identityKeyDh:         to_number_array(b.identity_key_dh),
      identityKeyEd:         to_number_array(b.identity_key_ed),
      signedPreKeyId:        b.signed_prekey_id,
      signedPreKey:          to_number_array(b.signed_prekey),
      signedPreKeySignature: to_number_array(b.signed_prekey_signature),
      kyberPreKeyId:         b.kyber_prekey_id,
      kyberPreKey:           to_number_array(b.kyber_prekey),
      kyberPreKeySignature:  to_number_array(b.kyber_prekey_signature),
      oneTimePreKeyId:       b.one_time_prekey_id,
      oneTimePreKey:         if(b.one_time_prekey, do: to_number_array(b.one_time_prekey), else: nil),
      otkRemaining:          b.otk_remaining,
    }
  end

  defp to_number_array(binary) when is_binary(binary), do: :erlang.binary_to_list(binary)
  defp to_number_array(nil), do: nil
end
