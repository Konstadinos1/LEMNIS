defmodule Relay.Prekeys do
  @moduledoc """
  Pre-key management context.
  Only PUBLIC keys are handled here — private keys never leave the client device.
  """

  import Ecto.Query
  alias Relay.{Repo, Identity, PrekeyBundle, OneTimePrekey}

  @doc """
  Register a new identity and its pre-key material.
  Upserts the identity and replaces the signed prekey bundle.
  """
  def register(params) do
    fingerprint = derive_fingerprint(params.identity_key_dh)

    Repo.transaction(fn ->
      identity =
        case Repo.get_by(Identity, fingerprint: fingerprint) do
          nil ->
            %Identity{}
            |> Identity.changeset(%{
              fingerprint: fingerprint,
              identity_key_b64: Base.encode64(params.identity_key_ed),
              registration_id: params.registration_id,
              device_id: params.device_id || 1,
            })
            |> Repo.insert!()

          existing ->
            existing
        end

      # Replace signed prekey bundle
      Repo.delete_all(from b in PrekeyBundle, where: b.identity_id == ^identity.id)

      %PrekeyBundle{}
      |> PrekeyBundle.changeset(%{
        identity_id: identity.id,
        identity_key: params.identity_key_dh,
        signed_prekey_id: params.signed_prekey.key_id,
        signed_prekey: params.signed_prekey.public_key,
        signed_prekey_sig: params.signed_prekey.signature,
        kyber_prekey_id: params.kyber_prekey[:key_id] || 0,
        kyber_prekey: params.kyber_prekey[:public_key] || <<>>,
        kyber_prekey_sig: params.kyber_prekey[:signature] || <<>>,
      })
      |> Repo.insert!()

      # Insert one-time pre-keys (de-duplicate by key_id)
      Enum.each(params.one_time_prekeys, fn otk ->
        %OneTimePrekey{}
        |> OneTimePrekey.changeset(%{
          identity_id: identity.id,
          key_id: otk.key_id,
          public_key: otk.public_key,
        })
        |> Repo.insert(on_conflict: :nothing)
      end)

      identity
    end)
  end

  @doc """
  Fetch the pre-key bundle for a peer, consuming one one-time prekey atomically.
  Includes `otk_remaining` so the client knows when to replenish its OTK pool.
  Returns `{:ok, bundle}` or `{:error, :not_found}`.
  """
  def fetch_bundle(fingerprint) do
    case Repo.get_by(Identity, fingerprint: fingerprint) do
      nil ->
        {:error, :not_found}

      identity ->
        bundle = Repo.get_by!(PrekeyBundle, identity_id: identity.id)
        otk = consume_one_time_prekey(identity.id)
        remaining = Repo.aggregate(
          from(k in OneTimePrekey, where: k.identity_id == ^identity.id),
          :count
        )

        {:ok, %{
          registration_id: identity.registration_id,
          identity_key_dh: bundle.identity_key,
          identity_key_ed: Base.decode64!(identity.identity_key_b64),
          signed_prekey_id: bundle.signed_prekey_id,
          signed_prekey: bundle.signed_prekey,
          signed_prekey_signature: bundle.signed_prekey_sig,
          kyber_prekey_id: bundle.kyber_prekey_id,
          kyber_prekey: bundle.kyber_prekey,
          kyber_prekey_signature: bundle.kyber_prekey_sig,
          one_time_prekey_id: otk && otk.key_id,
          one_time_prekey: otk && otk.public_key,
          otk_remaining: remaining,
        }}
    end
  end

  @doc """
  Add replenished one-time prekeys for an existing identity.
  The identity is looked up by fingerprint derived from `identity_key_dh`.
  Returns `{:ok, count_added}` or `{:error, :not_found}`.
  """
  def replenish(fingerprint, one_time_prekeys) do
    case Repo.get_by(Identity, fingerprint: fingerprint) do
      nil ->
        {:error, :not_found}

      identity ->
        inserted =
          Enum.count(one_time_prekeys, fn otk ->
            result =
              %OneTimePrekey{}
              |> OneTimePrekey.changeset(%{
                identity_id: identity.id,
                key_id: otk.key_id,
                public_key: otk.public_key,
              })
              |> Repo.insert(on_conflict: :nothing)

            match?({:ok, _}, result)
          end)

        {:ok, inserted}
    end
  end

  # Atomically fetch and delete a one-time prekey.
  defp consume_one_time_prekey(identity_id) do
    Repo.transaction(fn ->
      query =
        from k in OneTimePrekey,
          where: k.identity_id == ^identity_id,
          limit: 1,
          lock: "FOR UPDATE SKIP LOCKED"

      case Repo.one(query) do
        nil -> nil
        otk ->
          Repo.delete!(otk)
          otk
      end
    end)
    |> case do
      {:ok, result} -> result
      _ -> nil
    end
  end

  defp derive_fingerprint(identity_key_dh) do
    :crypto.hash(:sha256, identity_key_dh) |> Base.encode16(case: :lower)
  end
end
