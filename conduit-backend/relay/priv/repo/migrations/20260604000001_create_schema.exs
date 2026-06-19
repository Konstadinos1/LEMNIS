defmodule Relay.Repo.Migrations.CreateSchema do
  use Ecto.Migration

  def change do
    # Messaging identities (Signal identity key fingerprint only — no wallet address)
    create table(:identities, primary_key: false) do
      add :id, :uuid, primary_key: true, null: false
      add :fingerprint, :text, null: false
      add :registration_id, :integer, null: false
      add :device_id, :integer, null: false, default: 1
      add :push_token, :text
      add :push_platform, :text

      timestamps()
    end

    create unique_index(:identities, [:fingerprint])

    # Pre-key bundles (public keys only — private keys never touch the server)
    create table(:prekey_bundles, primary_key: false) do
      add :id, :uuid, primary_key: true, null: false
      add :identity_id, references(:identities, type: :uuid, on_delete: :delete_all), null: false
      add :identity_key, :bytea, null: false
      add :signed_prekey_id, :integer, null: false
      add :signed_prekey, :bytea, null: false
      add :signed_prekey_sig, :bytea, null: false
      add :kyber_prekey_id, :integer, null: false
      add :kyber_prekey, :bytea, null: false
      add :kyber_prekey_sig, :bytea, null: false

      timestamps()
    end

    create unique_index(:prekey_bundles, [:identity_id])

    # One-time pre-keys (consumed on first use — server never holds the private half)
    create table(:one_time_prekeys, primary_key: false) do
      add :id, :uuid, primary_key: true, null: false
      add :identity_id, references(:identities, type: :uuid, on_delete: :delete_all), null: false
      add :key_id, :integer, null: false
      add :public_key, :bytea, null: false

      timestamps()
    end

    create index(:one_time_prekeys, [:identity_id])

    # Token allowlist (managed by admin; no user data)
    create table(:allowlisted_tokens, primary_key: false) do
      add :id, :uuid, primary_key: true, null: false
      add :chain_id, :integer, null: false
      add :address, :text, null: false
      add :symbol, :text, null: false
      add :name, :text, null: false
      add :decimals, :integer, null: false
      add :logo_uri, :text
      add :risk_score, :integer, null: false, default: 0
      add :is_active, :boolean, null: false, default: true
      add :added_at, :utc_datetime_usec, null: false

      timestamps()
    end

    create unique_index(:allowlisted_tokens, [:chain_id, :address])

    # Paymaster sponsorship log (for rate-limiting and abuse detection)
    create table(:sponsorship_log, primary_key: false) do
      add :id, :uuid, primary_key: true, null: false
      add :account_address, :text, null: false
      add :user_op_hash, :text, null: false
      add :gas_used, :bigint
      add :sponsored_at, :utc_datetime_usec, null: false

      timestamps()
    end

    create index(:sponsorship_log, [:account_address])
    create index(:sponsorship_log, [:sponsored_at])
  end
end
