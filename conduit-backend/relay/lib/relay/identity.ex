defmodule Relay.Identity do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "identities" do
    field :fingerprint, :string
    field :identity_key_b64, :string  # Base64 Ed25519 public key (server-side verification)
    field :registration_id, :integer
    field :device_id, :integer, default: 1
    field :push_token, :string
    field :push_platform, :string

    has_one :prekey_bundle, Relay.PrekeyBundle
    has_many :one_time_prekeys, Relay.OneTimePrekey

    timestamps()
  end

  def changeset(identity, attrs) do
    identity
    |> cast(attrs, [:fingerprint, :identity_key_b64, :registration_id, :device_id, :push_token, :push_platform])
    |> validate_required([:fingerprint, :identity_key_b64, :registration_id])
    |> validate_length(:fingerprint, is: 64)
    |> unique_constraint(:fingerprint)
  end
end

defmodule Relay.PrekeyBundle do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "prekey_bundles" do
    belongs_to :identity, Relay.Identity

    field :identity_key, :binary
    field :signed_prekey_id, :integer
    field :signed_prekey, :binary
    field :signed_prekey_sig, :binary
    field :kyber_prekey_id, :integer
    field :kyber_prekey, :binary
    field :kyber_prekey_sig, :binary

    timestamps()
  end

  def changeset(bundle, attrs) do
    bundle
    |> cast(attrs, [
      :identity_id, :identity_key,
      :signed_prekey_id, :signed_prekey, :signed_prekey_sig,
      :kyber_prekey_id, :kyber_prekey, :kyber_prekey_sig
    ])
    |> validate_required([:identity_id, :identity_key, :signed_prekey_id, :signed_prekey, :signed_prekey_sig])
    |> foreign_key_constraint(:identity_id)
  end
end

defmodule Relay.OneTimePrekey do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "one_time_prekeys" do
    belongs_to :identity, Relay.Identity
    field :key_id, :integer
    field :public_key, :binary

    timestamps()
  end

  def changeset(key, attrs) do
    key
    |> cast(attrs, [:identity_id, :key_id, :public_key])
    |> validate_required([:identity_id, :key_id, :public_key])
    |> foreign_key_constraint(:identity_id)
  end
end
