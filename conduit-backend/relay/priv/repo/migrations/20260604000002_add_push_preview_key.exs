defmodule Relay.Repo.Migrations.AddPushPreviewKey do
  use Ecto.Migration

  def change do
    alter table(:identities) do
      add :preview_key, :bytea, null: true
    end
  end
end
