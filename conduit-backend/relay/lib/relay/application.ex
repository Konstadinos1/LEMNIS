defmodule Relay.Application do
  use Application

  @impl true
  def start(_type, _args) do
    children = [
      Relay.Repo,
      {Phoenix.PubSub, name: Relay.PubSub},
      {Redix, {Application.fetch_env!(:relay, :redis_url), [name: :redix]}},
      RelayWeb.Endpoint
    ]

    opts = [strategy: :one_for_one, name: Relay.Supervisor]
    Supervisor.start_link(children, opts)
  end

  @impl true
  def config_change(changed, _new, removed) do
    RelayWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
