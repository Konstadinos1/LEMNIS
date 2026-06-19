defmodule Relay.Application do
  use Application

  @impl true
  def start(_type, _args) do
    children = [
      Relay.Repo,
      {Phoenix.PubSub, name: Relay.PubSub},
      {Redix, {Application.fetch_env!(:relay, :redis_url), [name: :redix]}},
      {Finch, name: Relay.Finch, pools: %{
        "https://fcm.googleapis.com" => [size: 10, count: 2],
        "https://oauth2.googleapis.com" => [size: 4, count: 1],
        "https://api.push.apple.com" => [size: 10, count: 2, protocol: :http2],
        "https://api.sandbox.push.apple.com" => [size: 4, count: 1, protocol: :http2],
      }},
      Relay.Push.FcmTokenCache,
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
