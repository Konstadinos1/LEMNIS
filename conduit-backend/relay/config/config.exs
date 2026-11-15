import Config

config :relay,
  ecto_repos: [Relay.Repo]

config :relay, RelayWeb.Endpoint,
  url: [host: "localhost"],
  render_errors: [
    formats: [json: RelayWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Relay.PubSub,
  live_view: [signing_salt: "conduit_salt"]

config :relay, Relay.Repo,
  pool_size: 10

config :logger, :console,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id, :identity_id]

config :phoenix, :json_library, Jason

import_config "#{config_env()}.exs"
