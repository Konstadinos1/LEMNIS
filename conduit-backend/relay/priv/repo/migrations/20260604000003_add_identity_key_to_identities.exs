defmodule Relay.Repo.Migrations.AddIdentityKeyToIdentities do
  use Ecto.Migration

  def change do
    alter table(:identities) do
      add :identity_key_b64, :text, null: true
    end

    # Backfill existing rows so the NOT NULL constraint can be added later;
    # for now allow null to avoid blocking fresh installs.
  end
end
